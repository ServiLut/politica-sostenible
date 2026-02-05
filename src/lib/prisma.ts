import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: pg.Pool | undefined;
};

// Prisma 7 requires a driver adapter for direct connections.
// We use pg.Pool with SSL disabled validation for Supabase compatibility.
const getPool = () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return new pg.Pool();
  
  return new pg.Pool({ 
    connectionString: connectionString.replace('sslmode=require', 'sslmode=no-verify'),
    ssl: { rejectUnauthorized: false }
  });
};

const pool = globalForPrisma.pgPool ?? getPool();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.pgPool = pool;
}

const adapter = new PrismaPg(pool);

const prismaClientSingleton = () => {
  return new PrismaClient({ adapter });
};

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}