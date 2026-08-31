import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../../prisma/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const POSTGRES_IDENTIFIER = /^[\p{L}_][\p{L}\p{N}_-]{0,62}$/u;

export function resolveDatabaseSchema(
  connectionString: string | undefined,
  configuredSchema = process.env.DATABASE_SCHEMA,
): string | undefined {
  const explicitSchema = configuredSchema?.trim();
  let urlSchema: string | undefined;

  if (connectionString) {
    try {
      urlSchema = new URL(connectionString).searchParams.get('schema')?.trim();
    } catch {
      throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
    }
  }

  const schema = explicitSchema || urlSchema;
  if (!schema) return undefined;

  if (!POSTGRES_IDENTIFIER.test(schema)) {
    throw new Error('DATABASE_SCHEMA contains an invalid PostgreSQL identifier');
  }

  return schema;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('DATABASE_URL is required in production');
      }

      console.warn('DATABASE_URL is not configured. Database calls will fail.');
    }

    const sslEnabled = process.env.DATABASE_SSL === 'true';
    const rejectUnauthorized =
      process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';

    const pool = new pg.Pool({
      connectionString,
      ssl: sslEnabled ? { rejectUnauthorized } : false,
    });

    const schema = resolveDatabaseSchema(connectionString);
    const adapter = new PrismaPg(pool, schema ? { schema } : undefined);
    super({ adapter });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      await this.$queryRaw`SELECT 1`;
      console.log('Database connection established.');
    } catch (error) {
      console.error('Database connection failed.');
      if (process.env.NODE_ENV === 'production') {
        throw error;
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
