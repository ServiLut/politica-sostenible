import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORIGIN, allowedRequest, assertIdentity, assertOwnedRecord, main, plan, selectOwnedRecord, validateManifest, validateResumeJournal } from './controlled-http-smoke.mjs';

const runId = '11111111-1111-4111-8111-111111111111';
const marker = `PS_AUDIT_${runId}`;
const id = (letter) => `c${letter.repeat(24)}`;
const manifest = (fixtureRunId = runId) => ({
  kind: 'politica-production-synthetic-audit-v1', runId: fixtureRunId, origin: ORIGIN,
  revision: 'a'.repeat(40), operatorVerifiedSynthetic: true,
  accounts: Object.fromEntries(['a', 'b'].map((side) => {
    const slug = `ps-audit-${fixtureRunId}-${side}`;
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

// Public EventsService.EVENT_SELECT shape: tenantId intentionally is not selected.
const eventResponse = (account = manifest().accounts.a, eventMarker = marker) => ({
  id: id('f'), mode: 'CAMPAIGN', name: `${eventMarker} event`,
  description: 'PRUEBA SINTÉTICA CONTROLADA. Sin personas, convocatoria, envío ni compromiso real.',
  startsAt: '2026-09-26T12:00:00.000Z', endsAt: '2026-09-26T13:00:00.000Z',
  location: null, status: 'DRAFT', capacity: null,
  responsibleId: account.userId,
  responsible: { id: account.userId, name: 'Cuenta sintética A', role: 'ADMIN' },
  createdAt: '2026-09-25T12:00:00.000Z', updatedAt: '2026-09-25T12:00:00.000Z',
});

test('admite el contrato público de evento sin inventar tenantId y conserva guardas de pertenencia', () => {
  const account = manifest().accounts.a;
  const event = eventResponse();
  assert.equal('tenantId' in event, false);
  assertOwnedRecord(event, 'event', account, marker);
  for (const patch of [
    { tenantId: manifest().accounts.b.tenantId }, { responsibleId: id('z') },
    { responsible: { id: id('z'), role: 'ADMIN' } }, { responsible: null },
    { status: 'SCHEDULED' }, { mode: 'PUBLIC_OFFICE' },
    { name: `${marker} event suffix` }, { description: 'Contenido ajeno a la prueba' },
  ]) assert.throws(() => assertOwnedRecord({ ...event, ...patch }, 'event', account, marker));
  assert.throws(() => assertOwnedRecord({ id: id('e'), title: `${marker} task` }, 'task', account, marker));
});

test('la conciliación requiere una única coincidencia exacta, rechaza vacío, duplicados y total inconsistente', () => {
  const account = manifest().accounts.a;
  const event = eventResponse();
  assert.equal(selectOwnedRecord({ items: [event], pagination: { total: 1 } }, 'event', account, marker, undefined, true).id, event.id);
  for (const records of [
    { items: [], pagination: { total: 0 } },
    { items: [event, event], pagination: { total: 2 } },
    { items: [event], pagination: { total: 0 } },
    { items: [event], pagination: { total: '1' } },
  ]) assert.throws(() => selectOwnedRecord(records, 'event', account, marker, undefined, true));
  assert.throws(() => selectOwnedRecord({ items: [event], pagination: { total: 1 } }, 'event', account, marker, id('z'), true));
});

const failedJournal = (value = manifest()) => ({
  kind: value.kind, runId: value.runId, tenantId: value.accounts.a.tenantId,
  marker: `PS_AUDIT_${value.runId}`, created: { task: id('e') }, intents: { task: true, event: true },
  checks: [{ label: 'Tarea sintética conservada CANCELLED' }],
  calls: [{ method: 'POST', path: '/events', status: 201 }],
  failure: 'Registro fuera de la organización sintética esperada.',
  lastRun: { mode: '--execute', passed: false },
});

test('no reanuda sin alta201 única, intención pendiente, ID ausente y tarea cancelada', () => {
  validateResumeJournal(failedJournal());
  for (const patch of [
    { calls: [] }, { calls: [{ method: 'POST', path: '/events', status: null }] },
    { calls: [{ method: 'POST', path: '/events', status: 201 }, { method: 'POST', path: '/events', status: 201 }] },
    { created: { task: id('e'), event: id('f') } }, { intents: { event: false } },
    { checks: [] }, { lastRun: { mode: '--cleanup', passed: false } },
  ]) assert.throws(() => validateResumeJournal({ ...failedJournal(), ...patch }));
});

test('modo resume-event prohíbe cualquier alta y todo acceso a tareas, aunque el ID figure en diario', () => {
  const owned = { marker, task: id('e'), event: id('f') };
  for (const [method, path] of [
    ['POST', '/events'], ['POST', '/tasks'], ['GET', `/tasks?entityId=${owned.task}&limit=2`],
    ['PATCH', `/tasks/${owned.task}`], ['GET', '/operation-profile/readiness'],
  ]) assert.equal(allowedRequest(method, path, owned, '--resume-event'), false);
  assert.equal(allowedRequest('GET', `/events?search=${marker}&limit=2`, owned, '--resume-event'), true);
  assert.equal(allowedRequest('PATCH', `/events/${owned.event}`, owned, '--resume-event'), true);
  assert.equal(allowedRequest('DELETE', `/events/${id('z')}`, owned, '--resume-event'), false);
});

for (const scenario of ['ok', 'zero', 'multiple', 'foreign', 'wrong-marker']) {
  test(`resume-event ${scenario}: ejecutor completo sin red, conserva diario original y nunca repite alta`, async () => {
    const fixtureRunId = randomUUID();
    const folder = resolve(dirname(fileURLToPath(import.meta.url)), '../../.artifacts/production-audit', fixtureRunId);
    const value = manifest(fixtureRunId);
    const original = `${JSON.stringify(failedJournal(value))}\n`;
    mkdirSync(folder); // Fails if another process already owns this random directory.
    writeFileSync(resolve(folder, 'manifest.json'), JSON.stringify(value), { flag: 'wx' });
    writeFileSync(resolve(folder, 'journal.json'), original, { flag: 'wx' });
    const previous = { fetch: globalThis.fetch, log: console.log, error: console.error, exitCode: process.exitCode };
    const envNames = ['POLITICA_PRODUCTION_SMOKE_CONFIRM', 'POLITICA_PRODUCTION_SMOKE_A_PASSWORD', 'POLITICA_PRODUCTION_SMOKE_B_PASSWORD'];
    const oldEnv = envNames.map((name) => process.env[name]);
    process.env[envNames[0]] = 'SYNTHETIC_TENANTS_ONLY';
    process.env[envNames[1]] = process.env[envNames[2]] = 'unit-test-synthetic-password';
    const calls = [];
    const revoked = new Set();
    let deleted = false;
    const event = eventResponse(value.accounts.a, `PS_AUDIT_${fixtureRunId}`);
    console.log = console.error = () => {};
    globalThis.fetch = async (target, options) => {
      assert.equal(new URL(target).origin, ORIGIN);
      const path = new URL(target).pathname.replace(/^\/api/, '') + new URL(target).search;
      const side = options.headers.authorization?.replace('Bearer unit-', '');
      calls.push({ method: options.method, path, side });
      assert.ok(!path.startsWith('/tasks'), 'No toca la tarea cancelada');
      assert.ok(options.method !== 'POST' || ['/auth/login', '/auth/logout'].includes(path), 'Nunca repite el alta');
      const response = (status, data) => new Response(JSON.stringify({ statusCode: status, data }), { status, headers: { 'x-app-revision': value.revision, 'content-type': 'application/json' } });
      const user = (account) => ({ id: account.userId, email: account.email, role: 'ADMIN', mustChangePassword: false, tenant: { id: account.tenantId, slug: account.slug, name: account.name, type: 'CANDIDACY', defaultMode: 'CAMPAIGN', operationStage: null } });
      if (path === '/auth/login') {
        const accountSide = JSON.parse(options.body).email === value.accounts.a.email ? 'a' : 'b';
        return response(201, { access_token: `unit-${accountSide}`, user: user(value.accounts[accountSide]) });
      }
      if (path === '/auth/me') return side && !revoked.has(side) ? response(200, { user: user(value.accounts[side]) }) : response(401, null);
      if (path === '/auth/logout') { revoked.add(side); return response(201, {}); }
      if (path.startsWith('/events?')) {
        const item = scenario === 'foreign' ? { ...event, responsibleId: value.accounts.b.userId }
          : scenario === 'wrong-marker' ? { ...event, name: `${event.name} altered` } : event;
        const items = scenario === 'zero' ? [] : scenario === 'multiple' ? [item, item] : [item];
        return response(200, { items, pagination: { total: items.length } });
      }
      assert.equal(path, `/events/${event.id}`);
      if (side === 'b' || deleted) return response(404, null);
      if (options.method === 'PATCH') event.description = JSON.parse(options.body).description;
      if (options.method === 'DELETE') { deleted = true; return response(200, { id: event.id, deleted: true }); }
      return response(200, event);
    };
    try {
      await main(['--resume-event', fixtureRunId]);
      assert.equal(readFileSync(resolve(folder, 'journal.json'), 'utf8'), original);
      const result = JSON.parse(readFileSync(resolve(folder, 'event-reconciliation.json'), 'utf8'));
      assert.equal(result.lastRun.passed, scenario === 'ok');
      assert.deepEqual([...revoked].sort(), ['a', 'b']);
      assert.ok(calls.length <= 20);
      assert.equal(deleted, scenario === 'ok');
      if (scenario === 'ok') {
        assert.equal(calls.length, 19);
        assert.ok(calls.some((call) => call.method === 'PATCH' && call.side === 'b'));
        assert.ok(result.checks.some((check) => check.label.includes('actualización y aislamiento A/B')));
      } else {
        assert.ok(calls.every((call) => call.path.startsWith('/auth/') || call.method === 'GET'));
        assert.equal(calls.filter((call) => call.path.startsWith('/events?')).length, 1);
      }
    } finally {
      globalThis.fetch = previous.fetch; console.log = previous.log; console.error = previous.error; process.exitCode = previous.exitCode;
      envNames.forEach((name, index) => { if (oldEnv[index] === undefined) delete process.env[name]; else process.env[name] = oldEnv[index]; });
      // Only remove the exact files generated in this test's exclusive UUID directory.
      for (const filename of ['manifest.json', 'journal.json', 'event-reconciliation.json', 'event-reconciliation.json.tmp', 'runner.lock']) {
        const path = resolve(folder, filename);
        assert.equal(dirname(path), folder);
        if (existsSync(path)) unlinkSync(path);
      }
      rmdirSync(folder);
    }
  });
}
