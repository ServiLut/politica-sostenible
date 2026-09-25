import { mkdtempSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(apiRoot, 'package.json'));
function localUrl(name, protocol) {
  const raw = process.env[name];
  if (!raw)
    throw new Error(
      `${name} is required; there is no database/environment fallback`,
    );
  const url = new URL(raw);
  if (
    url.protocol !== protocol ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  ) {
    throw new Error(`${name} must target the explicit loopback audit runtime`);
  }
  return url;
}
const database = localUrl('HTTP_INTEGRATION_DATABASE_URL', 'postgresql:');
const permittedAuditDatabase =
  database.username === 'audit_local' &&
  /^\/(politica_audit_|http_audit_)[a-z0-9_]+$/.test(database.pathname);
const permittedCiDatabase =
  database.username === 'politica_test' &&
  database.pathname === '/politica_sostenible_test';
if (
  (!permittedAuditDatabase && !permittedCiDatabase) ||
  database.searchParams.get('schema') !== 'politica-sostenible'
) {
  throw new Error(
    'Only the explicit local audit database or the fixed politica_test/politica_sostenible_test CI pair is permitted, using schema politica-sostenible',
  );
}
const redis = localUrl('HTTP_INTEGRATION_REDIS_URL', 'redis:');
if (redis.pathname !== '/14')
  throw new Error('Reserve Redis logical database 14 for the HTTP audit');
const cwd = mkdtempSync(join(tmpdir(), 'politica-http-audit-'));
const env = {};
for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP', 'TMPDIR']) {
  if (process.env[key]) env[key] = process.env[key];
}
Object.assign(env, {
  // development intentionally activates the actual BullMQ providers (test disables them).
  NODE_ENV: 'development',
  TS_NODE_PROJECT: join(apiRoot, 'tsconfig.json'),
  DATABASE_URL: database.toString(),
  DATABASE_SCHEMA: 'politica-sostenible',
  DATABASE_SSL: 'false',
  DATABASE_POOL_MAX: '5',
  PGAPPNAME: `http_audit_${randomBytes(12).toString('hex')}`,
  REDIS_URL: redis.toString(),
  JWT_SECRET: randomBytes(48).toString('hex'),
  MFA_TOTP_ACTIVE_KEY_ID: 'http-audit',
  MFA_TOTP_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  MFA_TOTP_LEGACY_PLAINTEXT_MODE: 'reject',
  SAAS_ADMIN_USER_IDS: '00000000-0000-4000-8000-000000000001',
  CONSENT_IP_SALT: randomBytes(24).toString('hex'),
  OFFLINE_SYNC_HMAC_SECRET: randomBytes(48).toString('hex'),
  SUPABASE_URL: 'https://storage.invalid',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_http_audit_synthetic_not_valid',
  SUPABASE_STORAGE_BUCKET: 'http-audit-files',
  ALLOW_PUBLIC_REGISTRATION: 'false',
  APP_REVISION: 'http-audit-local',
});
let status = 1;
try {
  const result = spawnSync(
    process.execPath,
    [
      '--require',
      require.resolve('ts-node/register'),
      '--test',
      '--test-concurrency=1',
      join(apiRoot, 'test/app-http.integration.ts'),
    ],
    { cwd, env, stdio: 'inherit', windowsHide: true, timeout: 120_000 },
  );
  if (result.error) throw result.error;
  status = result.status ?? 1;
} finally {
  // mkdtemp creates this exact directory; no repository or user files are moved.
  if (
    dirname(resolve(cwd)) !== resolve(tmpdir()) ||
    !basename(cwd).startsWith('politica-http-audit-')
  ) {
    throw new Error(
      'Refusing to remove a directory outside the generated audit workspace',
    );
  }
  // Remove only an empty directory; preserve any unexpected diagnostic files.
  rmdirSync(cwd);
}
process.exitCode = status;
