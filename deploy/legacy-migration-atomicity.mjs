import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';

// Published SQL must retain its checksum. Prisma 7.9.1 does NOT roll these
// scripts back as a unit. The deployment runner applies their canonical bytes
// and a NEW history entry in the SAME PostgreSQL transaction. Existing history
// is never edited. Future scripts must still contain explicit BEGIN/COMMIT.
export const LEGACY_IMPLICIT_TRANSACTION_MIGRATIONS = Object.freeze({
  '20260909320000_transition_handover_reports':
    '1567ca8c531e0d3927ef5d7020878602524ac59d2381bd9f5d36c863a9ea8550',
  '20260917350000_voter_election_day_tracking':
    '1067a7f12e6e3a1aad8b57bcb7ba7b19789ce914dc5b6c4a7bc50ae01496a17e',
});

const migrationsDirectory = new URL('../apps/api/prisma/migrations/', import.meta.url);
const identifier = /^[\p{L}_][\p{L}\p{N}_-]{0,62}$/u;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function canonicalMigrations() {
  const directories = (await readdir(migrationsDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  return Promise.all(directories.map(async (name) => {
    const sql = await readFile(new URL(`${name}/migration.sql`, migrationsDirectory));
    return { name, sql, checksum: sha256(sql) };
  }));
}

function completed(row) {
  return row.finished_at !== null && row.rolled_back_at === null;
}

function verifyApplied(rows, migration) {
  const attempts = rows.filter((row) => row.migration_name === migration.name);
  if (attempts.some((row) => row.finished_at === null && row.rolled_back_at === null)) {
    throw new Error(`${migration.name}: intento incompleto; se requiere revisión manual`);
  }
  const applied = attempts.filter(completed);
  if (applied.length > 1 || (applied.length === 1 && applied[0].checksum !== migration.checksum)) {
    throw new Error(`${migration.name}: historial o checksum incompatible; no se modifica`);
  }
  return applied.length === 1;
}

async function history(client, schema) {
  const exists = await client.query('SELECT to_regclass($1) AS relation', [`"${schema}"."_prisma_migrations"`]);
  if (exists.rows[0].relation === null) return [];
  return (await client.query(`SELECT migration_name, checksum, finished_at, rolled_back_at FROM "${schema}"."_prisma_migrations"`)).rows;
}

export async function applyGuardedLegacyMigrations({ client, schema, deployPrefix }) {
  if (!identifier.test(schema)) throw new Error('Schema de migración inválido');
  const canonical = await canonicalMigrations();
  for (const [name, checksum] of Object.entries(LEGACY_IMPLICIT_TRANSACTION_MIGRATIONS)) {
    const migration = canonical.find((entry) => entry.name === name);
    if (!migration || migration.checksum !== checksum) {
      throw new Error(`${name}: cambió el SQL histórico protegido; se detuvo el despliegue`);
    }
    if (verifyApplied(await history(client, schema), migration)) continue;

    // Prisma runs in another session; never hold its lock while invoking it.
    await deployPrefix(name);
    await client.query('BEGIN');
    try {
      // Same advisory key as Prisma's PostgreSQL schema engine. A transaction
      // lock releases on rollback, disconnect or commit, including a crash.
      const lock = await client.query('SELECT pg_try_advisory_xact_lock(72707369) AS acquired');
      if (lock.rows[0]?.acquired !== true) throw new Error('Otro proceso Prisma está migrando; reintenta al terminar');
      await client.query(`LOCK TABLE "${schema}"."_prisma_migrations" IN EXCLUSIVE MODE`);
      const current = await history(client, schema);
      if (verifyApplied(current, migration)) {
        await client.query('COMMIT');
        continue;
      }
      if (current.some((row) => row.finished_at === null && row.rolled_back_at === null)) {
        throw new Error('Hay una migración incompleta; no se aplica el tramo histórico');
      }
      for (const prior of canonical.filter((entry) => entry.name < name)) {
        if (!verifyApplied(current, prior)) throw new Error(`Falta el prefijo canónico ${prior.name}`);
      }
      if (current.some((row) => completed(row) && row.migration_name > name)) {
        throw new Error(`${name}: historial fuera de orden; se requiere revisión manual`);
      }
      await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`);
      await client.query(migration.sql.toString('utf8'));
      await client.query(`
        INSERT INTO "${schema}"."_prisma_migrations"
          (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
        VALUES ($1, $2, CURRENT_TIMESTAMP, $3, NULL, NULL, CURRENT_TIMESTAMP, 1)
      `, [randomUUID(), checksum, name]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  }
}
