import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ORIGIN, allowedRequest, assertIdentity, assertOwnedRecord, main, plan, validateManifest } from './controlled-http-smoke.mjs';

const runId = '11111111-1111-4111-8111-111111111111';
const marker = `PS_AUDIT_${runId}`;
const id = (letter) => `c${letter.repeat(24)}`;
const manifest = () => ({
  kind: 'politica-production-synthetic-audit-v1', runId, origin: ORIGIN,
  revision: 'a'.repeat(40), operatorVerifiedSynthetic: true,
  accounts: Object.fromEntries(['a', 'b'].map((side) => {
    const slug = `ps-audit-${runId}-${side}`;
    return [side, { tenantId: id(side), userId: id(side === 'a' ? 'c' : 'd'), slug, name: `PRUEBA SINTÉTICA ${slug}`, email: `${slug}@example.invalid` }];
  })),
});
const identity = () => {
  const account = manifest().accounts.a;
  return { id: account.userId, email: account.email, role: 'ADMIN', mustChangePassword: false, tenant: { id: account.tenantId, slug: account.slug, name: account.name, type: 'CANDIDACY', defaultMode: 'CAMPAIGN', operationStage: null } };
};

test('el plan no usa red, no lee credenciales y no inicia ejecución', async () => {
  const previousFetch = globalThis.fetch;
  const previousLog = console.log;
  let printed = '';
  globalThis.fetch = () => { throw new Error('No debe invocarse'); };
  console.log = (message) => { printed += message; };
  try { await main(['--plan']); } finally { globalThis.fetch = previousFetch; console.log = previousLog; }
  assert.equal(JSON.parse(printed).networkInPlan, false);
  assert.equal(plan().maxRequests, 40);
  assert.equal(plan().retries, 0);
});

test('ejecutar sin opt-in falla antes de leer archivos o llamar red', async () => {
  const previous = process.env.POLITICA_PRODUCTION_SMOKE_CONFIRM;
  delete process.env.POLITICA_PRODUCTION_SMOKE_CONFIRM;
  try { await assert.rejects(main(['--execute', runId]), /opt-in/); }
  finally { if (previous !== undefined) process.env.POLITICA_PRODUCTION_SMOKE_CONFIRM = previous; }
});

test('solo acepta el origen exacto y UUID de la ejecución', () => {
  assert.equal(validateManifest(manifest(), runId).origin, ORIGIN);
  for (const origin of ['http://politica-sostenible.abogadosencolombiasas.com', `${ORIGIN}/`, 'https://otra-app.abogadosencolombiasas.com', `${ORIGIN}.evil.invalid`]) {
    assert.throws(() => validateManifest({ ...manifest(), origin }, runId), /Origen/);
  }
  assert.throws(() => validateManifest(manifest(), '../escape'), /UUID/);
});

test('rechaza organizaciones reales, correos entregables y secretos en manifiesto', () => {
  for (const patch of [{ slug: 'organizacion-real' }, { name: 'Organización real' }, { email: 'persona@example.com' }, { password: 'never-write-secrets' }, { token: 'never-write-tokens' }]) {
    const value = manifest();
    Object.assign(value.accounts.a, patch);
    assert.throws(() => validateManifest(value, runId));
  }
});

test('exige organizaciones independientes, revisión exacta y verificación del operador', () => {
  const value = manifest(); value.accounts.b.tenantId = value.accounts.a.tenantId;
  assert.throws(() => validateManifest(value, runId), /independientes/);
  assert.throws(() => validateManifest({ ...manifest(), revision: 'unknown' }, runId), /revisión/);
  assert.throws(() => validateManifest({ ...manifest(), operatorVerifiedSynthetic: false }, runId), /operador/);
});

test('identidad autenticada debe coincidir y no tener perfil operativo', () => {
  assertIdentity(identity(), manifest().accounts.a);
  for (const patch of [{ id: id('z') }, { role: 'VOLUNTEER' }, { mustChangePassword: true }]) {
    assert.throws(() => assertIdentity({ ...identity(), ...patch }, manifest().accounts.a));
  }
  for (const patch of [{ id: id('z') }, { type: 'PUBLIC_OFFICE' }, { operationStage: 'CAMPAIGN' }]) {
    const value = identity(); Object.assign(value.tenant, patch);
    assert.throws(() => assertIdentity(value, manifest().accounts.a));
  }
});

test('la lista de rutas excluye registro, correos, pagos, archivos y cualquier otro dominio', () => {
  const owned = { marker, task: id('e'), event: id('f') };
  for (const path of ['/auth/register', '/team/invitations', '/finance', '/storage/upload-url', '/billing/checkout', `${ORIGIN}/auth/login`, 'https://evil.invalid/auth/login', '//evil.invalid/auth/login']) {
    assert.equal(allowedRequest('POST', path, owned), false, path);
  }
  assert.equal(allowedRequest('POST', '/auth/login', owned), true);
  assert.equal(allowedRequest('POST', '/events', owned), true);
});

test('no permite borrado de tareas ni tocar IDs fuera del diario', () => {
  const owned = { marker, task: id('e'), event: id('f') };
  assert.equal(allowedRequest('DELETE', `/tasks/${owned.task}`, owned), false);
  assert.equal(allowedRequest('DELETE', `/events/${id('z')}`, owned), false);
  assert.equal(allowedRequest('PATCH', `/tasks/${id('z')}`, owned), false);
  assert.equal(allowedRequest('DELETE', `/events/${owned.event}`, owned), true);
  assert.equal(allowedRequest('PATCH', `/tasks/${owned.task}`, owned), true);
});

test('consultas limitadas a dos registros y al marcador o ID de la ejecución', () => {
  const owned = { marker, task: id('e'), event: id('f') };
  assert.equal(allowedRequest('GET', `/tasks?entityId=${owned.task}&limit=2`, owned), true);
  assert.equal(allowedRequest('GET', `/events?search=${marker}&limit=2`, owned), true);
  for (const path of ['/tasks', '/events?limit=100', `/tasks?search=${marker}&limit=2&tenantId=${id('b')}`, `/tasks?search=${marker}&search=other&limit=2`, `/tasks?entityId=${id('z')}&limit=2`]) {
    assert.equal(allowedRequest('GET', path, owned), false, path);
  }
});

test('limpieza exige marcador completo y pertenencia al tenant esperado', () => {
  const account = manifest().accounts.a;
  const record = { id: id('e'), tenantId: account.tenantId, title: `${marker} task` };
  assertOwnedRecord(record, 'task', account, marker);
  assert.throws(() => assertOwnedRecord({ ...record, tenantId: manifest().accounts.b.tenantId }, 'task', account, marker));
  assert.throws(() => assertOwnedRecord({ ...record, title: `${marker} task modified by somebody` }, 'task', account, marker));
  assert.throws(() => assertOwnedRecord({ ...record, id: '../escape' }, 'task', account, marker));
});
