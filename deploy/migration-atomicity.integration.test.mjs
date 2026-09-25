import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { applyGuardedLegacyMigrations, LEGACY_IMPLICIT_TRANSACTION_MIGRATIONS } from './legacy-migration-atomicity.mjs';
import { deployMigrationPrefix } from './migrate.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const api = join(root, 'apps', 'api');
const apiRequire = createRequire(join(api, 'package.json'));
const cli = join(api, 'node_modules', 'prisma', 'build', 'index.js');
const migrations = join(api, 'prisma', 'migrations');
const databaseUrl = process.env.MIGRATION_TEST_DATABASE_URL?.trim();

async function runPrisma(config) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [cli, 'migrate', 'deploy', '--config', config], {
      cwd: dirname(config),
      env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: 'true' },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (data) => { output += data; });
    child.stderr.on('data', (data) => { output += data; });
    const timer = setTimeout(() => child.kill(), 90_000);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolveResult({ code, output });
    });
  });
}

async function schemaInventory(client) {
  // Include types, functions, indexes, triggers and columns: a failed ALTER
  // TABLE must roll back just as completely as a failed CREATE TABLE.
  const { rows } = await client.query(`
    SELECT 'relation' AS kind, c.relname AS name, c.relkind::text AS detail
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'audit_atomicity'
    UNION ALL
    SELECT 'type', t.typname, t.typtype::text
      FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'audit_atomicity'
    UNION ALL
    SELECT 'function', p.proname, pg_get_functiondef(p.oid)
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'audit_atomicity'
    UNION ALL
    SELECT 'trigger', t.tgname, pg_get_triggerdef(t.oid)
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'audit_atomicity'
    UNION ALL
    SELECT 'column', c.relname || '.' || a.attname, format_type(a.atttypid, a.atttypmod)
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'audit_atomicity' AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY kind, name, detail
  `);
  return rows;
}

for (const [name, checksum] of Object.entries(LEGACY_IMPLICIT_TRANSACTION_MIGRATIONS)) {
  for (const failurePoint of ['after-ddl', 'after-history', 'native-prisma']) {
    const guarded = failurePoint !== 'native-prisma';
    test(`PostgreSQL y Prisma reales: ${name} ${guarded ? `guard revierte ${failurePoint} y permite reintento` : 'control Prisma sin guard detecta restos'}`, {
      skip: !databaseUrl,
      timeout: 180_000,
    }, async () => {
      const url = new URL(databaseUrl);
      assert.match(url.pathname, /(?:test|audit|ci)/i, 'Solo se permite una base de integración explícita');
      const { Client } = apiRequire('pg');
      const admin = new Client({ connectionString: url.toString() });
      const ownedDatabase = `audit_atomicity_${randomBytes(10).toString('hex')}`;
      const work = await mkdtemp(join(tmpdir(), 'politica-prisma-atomicity-'));
      let client;
      let created = false;
      try {
        await admin.connect();
        assert.match((await admin.query('SHOW server_version')).rows[0].server_version, /^16\./);
        await admin.query(`CREATE DATABASE "${ownedDatabase}"`);
        created = true;
        url.pathname = `/${ownedDatabase}`;
        url.searchParams.set('schema', 'audit_atomicity');
        client = new Client({ connectionString: url.toString() });
        await client.connect();
        const fixture = join(work, 'migrations');
        await mkdir(fixture);
        await cp(join(migrations, 'migration_lock.toml'), join(fixture, 'migration_lock.toml'));
        const prior = (await readdir(migrations, { withFileTypes: true }))
          .filter((entry) => entry.isDirectory() && entry.name < name)
          .map((entry) => entry.name).sort();
        for (const previous of prior) {
          await cp(join(migrations, previous), join(fixture, previous), { recursive: true });
        }
        const config = join(work, 'prisma.config.mjs');
        await writeFile(config, `export default ${JSON.stringify({
          schema: join(api, 'prisma', 'schema.prisma'),
          datasource: { url: url.toString() },
          migrations: { path: fixture },
        })};\n`);
        const baseline = await runPrisma(config);
        assert.equal(baseline.code, 0, baseline.output);
        const before = await schemaInventory(client);
        const original = await readFile(join(migrations, name, 'migration.sql'));
        assert.equal(createHash('sha256').update(original).digest('hex'), checksum);
        const environment = { ...process.env, DIRECT_URL: url.toString() };
        const deployPrefix = (beforeMigration) => deployMigrationPrefix(beforeMigration, environment);
        if (guarded) {
          // The checksum-checked production helper sees the original SQL. Only
          // the test transport injects a real server-side fault after its DDL.
          const faultingClient = { query: async (sql, params) => {
            if (failurePoint === 'after-ddl' && sql === original.toString('utf8')) {
              return client.query(`${sql}\nSELECT 1 / 0;`);
            }
            const result = await client.query(sql, params);
            if (failurePoint === 'after-history' && typeof sql === 'string' &&
                sql.includes('INSERT INTO "audit_atomicity"."_prisma_migrations"') && params?.[2] === name) {
              await client.query('SELECT 1 / 0');
            }
            return result;
          } };
          await assert.rejects(
            applyGuardedLegacyMigrations({ client: faultingClient, schema: 'audit_atomicity', deployPrefix }),
            /division by zero/i,
          );
        } else {
          await mkdir(join(fixture, name));
          await writeFile(join(fixture, name, 'migration.sql'), Buffer.concat([
            original, Buffer.from('\nSELECT 1 / 0;\n'),
          ]));
          const failure = await runPrisma(config);
          assert.notEqual(failure.code, 0, 'El error inyectado debe fallar');
          assert.match(failure.output, /division by zero|22012/i);
        }
        const after = await schemaInventory(client);
        if (!guarded) assert.notDeepEqual(after, before, 'El control debe detectar DDL persistido');
        else assert.deepEqual(after, before, 'Ningún objeto o columna de la migración fallida debe persistir');
        const history = (await client.query(`
          SELECT migration_name, finished_at, rolled_back_at FROM "audit_atomicity"."_prisma_migrations"
        `)).rows;
        assert.equal(history.filter((row) => row.finished_at && !row.rolled_back_at).length, prior.length);
        const failed = history.filter((row) => row.migration_name === name);
        if (guarded) {
          assert.equal(failed.length, 0, 'La inserción de historia revierte junto al DDL');
          await applyGuardedLegacyMigrations({ client, schema: 'audit_atomicity', deployPrefix });
          const applied = await client.query(`SELECT checksum, finished_at FROM "audit_atomicity"."_prisma_migrations" WHERE migration_name = $1`, [name]);
          assert.equal(applied.rowCount, 1);
          assert.equal(applied.rows[0].checksum, checksum);
          assert.ok(applied.rows[0].finished_at);
          const stable = await schemaInventory(client);
          await applyGuardedLegacyMigrations({ client, schema: 'audit_atomicity', deployPrefix });
          assert.deepEqual(await schemaInventory(client), stable, 'El reintento no vuelve a ejecutar DDL');
          // Finish via the actual Prisma executor: canonical checksums and its
          // normal history/status semantics must remain compatible.
          await cp(migrations, fixture, { recursive: true });
          const finished = await runPrisma(config);
          assert.equal(finished.code, 0, finished.output);
        } else {
          assert.equal(failed.length, 1);
          assert.equal(failed[0].finished_at, null);
          assert.equal(failed[0].rolled_back_at, null);
        }
        assert.equal(createHash('sha256').update(await readFile(join(migrations, name, 'migration.sql'))).digest('hex'), checksum);
      } finally {
        await client?.end();
        if (created) {
          // Only a database created by this invocation can reach this cleanup.
          assert.match(ownedDatabase, /^audit_atomicity_[a-f0-9]{20}$/);
          await admin.query(`DROP DATABASE "${ownedDatabase}"`);
        }
        await admin.end();
        assert.equal(dirname(resolve(work)), resolve(tmpdir()));
        assert.ok(resolve(work).startsWith(join(resolve(tmpdir()), 'politica-prisma-atomicity-')));
        await rm(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      }
    });
  }
}
