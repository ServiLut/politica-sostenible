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
    const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

    if (!connectionString) {
      console.warn(
        '⚠️ No se encontró DATABASE_URL o DIRECT_URL. Asegúrate de configurar las variables de entorno.',
      );
    }

    const pool = new pg.Pool({
      connectionString,
      ssl: false, // Deshabilitado para tu conexión actual de PostgreSQL
    });

    const adapter = new PrismaPg(pool);
    super({ adapter });
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
  }
}
