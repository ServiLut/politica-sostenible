import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../../prisma/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

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

    const adapter = new PrismaPg(pool);
    super({ adapter });
  }

  async onModuleInit() {
    try {
      await this.$connect();
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
