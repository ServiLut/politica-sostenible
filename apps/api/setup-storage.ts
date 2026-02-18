import pg from 'pg';
import fs from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

// Limpiar params de SSL para evitar errores de certificado en dev
let connectionString = process.env.DATABASE_URL || '';
try {
  const urlObj = new URL(connectionString);
  urlObj.searchParams.delete('sslmode');
  connectionString = urlObj.toString();
} catch (e) {}

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const sqlPath = path.join(__dirname, 'prisma/migrations/storage_setup.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  
  console.log('📦 Configurando Storage en Supabase...');
  try {
    await pool.query(sql);
    console.log('✅ Storage configurado correctamente.');
  } catch (error) {
    // Ignorar error si las políticas ya existen
    if (error.code === '42710') {
      console.log('⚠️ Las políticas ya existían.');
    } else {
      console.error('❌ Error:', error.message);
    }
  } finally {
    await pool.end();
  }
}

main();
