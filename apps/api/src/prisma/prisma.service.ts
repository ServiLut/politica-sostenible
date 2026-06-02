import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../../prisma/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly pool: pg.Pool;

  constructor() {
    const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

    if (!connectionString) {
      console.warn(
        '⚠️ No se encontró DATABASE_URL o DIRECT_URL. Asegúrate de configurar las variables de entorno.',
      );
    }

    const useSsl = process.env.DATABASE_SSL === 'true';
    const rejectUnauthorized =
      process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';
    const sslConfig = useSsl ? { rejectUnauthorized } : undefined;

    const pool = new pg.Pool({
      connectionString,
      ...(sslConfig ? { ssl: sslConfig } : {}),
    });

    const adapter = new PrismaPg(pool);
    super({ adapter });
    this.pool = pool;
  }

  async onModuleInit() {
    try {
      await this.$connect();
      console.log('✅ Conexión a la base de datos electoral establecida.');
    } catch (error) {
      console.error('❌ Error conectando a la base de datos:', error);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}
