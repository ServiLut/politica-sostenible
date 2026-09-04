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
    throw new Error(
      'DATABASE_SCHEMA contains an invalid PostgreSQL identifier',
    );
  }

  return schema;
}

export function resolveDatabaseSsl(
  environment: NodeJS.ProcessEnv = process.env,
): false | { rejectUnauthorized: boolean } {
  const sslEnabled = environment.DATABASE_SSL === 'true';
  const rejectUnauthorized =
    environment.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';
  const production = environment.NODE_ENV === 'production';
  const insecureEvaluation =
    production &&
    environment.DEPLOYMENT_PROFILE?.trim().toLowerCase() === 'evaluation' &&
    environment.ALLOW_INSECURE_DATABASE_CONNECTION === 'true';

  if (production && !insecureEvaluation) {
    if (!sslEnabled || !rejectUnauthorized) {
      throw new Error(
        'PostgreSQL TLS is mandatory outside the explicit evaluation profile',
      );
    }
  }

  if (insecureEvaluation) {
    if (sslEnabled || rejectUnauthorized) {
      throw new Error(
        'The evaluation database exception requires DATABASE_SSL=false and DATABASE_SSL_REJECT_UNAUTHORIZED=false',
      );
    }
    console.warn(
      'PostgreSQL is using the explicit insecure evaluation profile; do not use it with real data.',
    );
    return false;
  }

  return sslEnabled ? { rejectUnauthorized } : false;
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

    const pool = new pg.Pool({
      connectionString,
      ssl: resolveDatabaseSsl(),
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
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
