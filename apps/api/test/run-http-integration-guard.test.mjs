import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const script = join(
  dirname(fileURLToPath(import.meta.url)),
  'run-http-integration.mjs',
);
const base = {
  HTTP_INTEGRATION_DATABASE_URL:
    'postgresql://audit_local@127.0.0.1:55440/politica_audit_guard?schema=politica-sostenible',
  HTTP_INTEGRATION_REDIS_URL: 'redis://127.0.0.1:56380/14',
};
function reject(env, message) {
  const result = spawnSync(process.execPath, [script], {
    env: { ...base, ...env },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 5000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, message);
}

test('no hereda DATABASE_URL como respaldo del destino explícito', () => {
  reject(
    {
      HTTP_INTEGRATION_DATABASE_URL: '',
      DATABASE_URL: base.HTTP_INTEGRATION_DATABASE_URL,
    },
    /HTTP_INTEGRATION_DATABASE_URL is required/,
  );
});
test('rechaza destino remoto incluso si usuario y nombre parecen de auditoría', () => {
  reject(
    {
      HTTP_INTEGRATION_DATABASE_URL:
        'postgresql://audit_local@production.invalid/politica_audit_guard?schema=politica-sostenible',
    },
    /explicit loopback audit runtime/,
  );
});
test('no admite otra pareja de rol/base local ni el schema público', () => {
  reject(
    {
      HTTP_INTEGRATION_DATABASE_URL:
        'postgresql://politica_test@127.0.0.1/customer_database?schema=politica-sostenible',
    },
    /Only the explicit local audit database/,
  );
  reject(
    {
      HTTP_INTEGRATION_DATABASE_URL:
        'postgresql://audit_local@127.0.0.1/politica_audit_guard?schema=public',
    },
    /Only the explicit local audit database/,
  );
});
test('no usa la base Redis compartida por defecto', () => {
  reject(
    { HTTP_INTEGRATION_REDIS_URL: 'redis://127.0.0.1:56380/0' },
    /Reserve Redis logical database 14/,
  );
});
