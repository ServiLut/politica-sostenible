import { mkdirSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ORIGIN = 'https://politica-sostenible.abogadosencolombiasas.com';
export const CONFIRM = 'SYNTHETIC_TENANTS_ONLY';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const CUID = /^c[a-z0-9]{24}$/;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DESCRIPTION = 'PRUEBA SINTÉTICA CONTROLADA. Sin personas, convocatoria, envío ni compromiso real.';

function requireValue(condition, message) { if (!condition) throw new Error(message); }

export function validateManifest(input, runId) {
  requireValue(UUID.test(runId), 'runId debe ser UUID v4 minúsculo.');
  requireValue(input?.kind === 'politica-production-synthetic-audit-v1' && input.runId === runId, 'Manifiesto de auditoría inválido.');
  requireValue(input.origin === ORIGIN, 'Origen fuera de Política Sostenible.');
  requireValue(/^[a-f0-9]{40}$/.test(input.revision ?? ''), 'Falta revisión desplegada de 40 caracteres.');
  requireValue(input.operatorVerifiedSynthetic === true, 'Falta verificación del operador de las organizaciones sintéticas.');
  for (const side of ['a', 'b']) {
    const account = input.accounts?.[side];
    const slug = `ps-audit-${runId}-${side}`;
    requireValue(account && CUID.test(account.tenantId) && CUID.test(account.userId), 'Identificadores sintéticos inválidos.');
    requireValue(account.slug === slug && account.name === `PRUEBA SINTÉTICA ${slug}`, 'Nombre o slug de organización no exclusivo de la prueba.');
    requireValue(account.email === `${slug}@example.invalid`, 'Se requiere correo sintético no entregable.');
    requireValue(!('password' in account) && !('token' in account), 'El manifiesto no admite contraseñas ni tokens.');
  }
  requireValue(input.accounts.a.tenantId !== input.accounts.b.tenantId && input.accounts.a.userId !== input.accounts.b.userId, 'A y B deben ser independientes.');
  return input;
}

export function assertIdentity(user, expected) {
  requireValue(user?.id === expected.userId && user.email === expected.email && user.role === 'ADMIN' && user.mustChangePassword === false, 'Cuenta autenticada distinta de la cuenta sintética prevista.');
  const tenant = user.tenant;
  requireValue(tenant?.id === expected.tenantId && tenant.slug === expected.slug && tenant.name === expected.name, 'La organización autenticada no coincide con la sintética autorizada.');
  requireValue(tenant.type === 'CANDIDACY' && tenant.defaultMode === 'CAMPAIGN' && tenant.operationStage === null, 'La prueba requiere organización sintética sin perfil operativo.');
}

export function allowedRequest(method, path, owned = {}, mode = '--execute') {
  const url = new URL(path, ORIGIN);
  if (url.origin !== ORIGIN || path !== `${url.pathname}${url.search}` || url.hash) return false;
  if (mode === '--resume-event' && !(method === 'GET' && path === '/auth/me') && !(method === 'POST' && ['/auth/login', '/auth/logout'].includes(path)) && !(url.pathname === '/events' && method === 'GET') && !(owned.event && path === `/events/${owned.event}` && ['GET', 'PATCH', 'DELETE'].includes(method))) return false;
  if (method === 'GET' && ['/auth/me', '/operation-profile/readiness', '/command-center/briefing'].includes(path)) return true;
  if (method === 'POST' && ['/auth/login', '/auth/logout', '/tasks', '/events'].includes(path)) return true;
  if (method === 'GET' && ['/tasks', '/events'].includes(url.pathname)) {
    const keys = [...url.searchParams.keys()];
    if (new Set(keys).size !== keys.length || keys.some((key) => !['entityId', 'search', 'limit'].includes(key))) return false;
    if (url.searchParams.get('limit') !== '2') return false;
    if (url.pathname === '/tasks' && owned.task && url.searchParams.get('entityId') === owned.task && keys.length === 2) return true;
    return Boolean(owned.marker && url.searchParams.get('search') === owned.marker && keys.length === 2);
  }
  if (owned.task && CUID.test(owned.task) && method === 'PATCH' && path === `/tasks/${owned.task}`) return true;
  return Boolean(owned.event && CUID.test(owned.event) && ['GET', 'PATCH', 'DELETE'].includes(method) && path === `/events/${owned.event}`);
}

export function assertOwnedRecord(record, kind, account, marker) {
  requireValue(['task', 'event'].includes(kind), 'Tipo de registro fuera de la prueba.');
  requireValue(CUID.test(record?.id ?? ''), 'Identificador del registro sintético inválido.');
  requireValue(record[kind === 'task' ? 'title' : 'name'] === `${marker} ${kind}`, 'El registro no tiene el marcador exacto de esta ejecución.');
  if (kind === 'task') {
    requireValue(record.tenantId === account.tenantId, 'Registro fuera de la organización sintética esperada.');
    return;
  }
  // EventsService.EVENT_SELECT deliberately omits tenantId. Ownership is checked
  // through verified A's authenticated requests and B's denied lookup, not a
  // fabricated response field. Keep the fixture's public contract strict.
  requireValue(!('tenantId' in record) || record.tenantId === account.tenantId, 'Evento declara una organización distinta.');
  requireValue(record.mode === 'CAMPAIGN' && record.status === 'DRAFT', 'El evento sintético dejó de ser un borrador de campaña.');
  requireValue(record.responsibleId === account.userId && record.responsible?.id === account.userId && record.responsible.role === 'ADMIN', 'El responsable del evento no es la cuenta sintética A.');
  requireValue([DESCRIPTION, `${DESCRIPTION} Lectura posterior verificada.`].includes(record.description), 'La descripción del evento ya no corresponde a la prueba.');
}

export function selectOwnedRecord(records, kind, account, marker, expectedId, requirePresent = false) {
  requireValue(Array.isArray(records?.items) && records.items.length <= 1 && Number.isInteger(records.pagination?.total) && records.pagination.total === records.items.length, 'Búsqueda de recurso no unívoca.');
  const item = records.items[0];
  if (!item) {
    requireValue(!requirePresent, 'No se encontró el único evento pendiente; detener sin repetir el alta.');
    return null;
  }
  assertOwnedRecord(item, kind, account, marker);
  requireValue(!expectedId || item.id === expectedId, 'Registro encontrado distinto del diario.');
  return item;
}

export function validateResumeJournal(journal) {
  requireValue(journal?.intents?.event === true && journal.created?.event === undefined, 'La conciliación requiere intención pendiente de evento sin ID registrado.');
  const creates = journal.calls?.filter((call) => call.method === 'POST' && call.path === '/events');
  requireValue(creates?.length === 1 && creates[0].status === 201, 'Se requiere exactamente un alta de evento con respuesta 201.');
  requireValue(journal.lastRun?.mode === '--execute' && journal.lastRun.passed === false && typeof journal.failure === 'string', 'Se requiere el diario original de ejecución fallida.');
  requireValue(CUID.test(journal.created.task ?? '') && journal.checks?.some((check) => check.label === 'Tarea sintética conservada CANCELLED'), 'La tarea debe estar identificada y ya cancelada antes de conciliar el evento.');
  return journal;
}

export function plan() {
  return {
    origin: ORIGIN, networkInPlan: false, autoRegistration: false, parallelism: 1,
    maxRequests: 40, requestTimeoutMs: 12000, retries: 0,
    steps: ['401 sin token; revisión desplegada exacta', 'Login A/B y GET /auth/me: IDs, nombres, roles y organizaciones previstos', 'Alistamiento bloqueado sin perfil y centro de comando de A', 'Tarea: crear, leer, actualizar; B no puede leer ni modificar; cancelar y releer', 'Evento DRAFT: crear, leer, actualizar; B no puede leer ni modificar; borrar borrador y confirmar 404', 'Cerrar solo las dos sesiones sintéticas y comprobar revocación'],
    retained: ['Organizaciones y cuentas sintéticas creadas previamente por el operador', 'Tarea identificable CANCELLED', 'Historial de auditoría y registros técnicos'],
    excluded: ['Registro/términos', 'Personas reales', 'Correo/SMS/WhatsApp', 'Pagos y finanzas', 'Storage/catálogos electorales', 'Migraciones/infraestructura', 'Otros dominios o aplicaciones'],
  };
}

async function execute(mode, runId) {
  requireValue(process.env.POLITICA_PRODUCTION_SMOKE_CONFIRM === CONFIRM, 'Falta opt-in explícito SYNTHETIC_TENANTS_ONLY.');
  requireValue(UUID.test(runId ?? ''), 'Indica UUID v4 de la ejecución autorizada.');
  const folder = resolve(ROOT, '.artifacts/production-audit', runId);
  const manifest = validateManifest(JSON.parse(readFileSync(resolve(folder, 'manifest.json'), 'utf8')), runId);
  const passwords = {};
  for (const side of ['a', 'b']) {
    passwords[side] = process.env[`POLITICA_PRODUCTION_SMOKE_${side.toUpperCase()}_PASSWORD`];
    requireValue(typeof passwords[side] === 'string' && passwords[side].length >= 12 && passwords[side].length <= 128, 'Faltan credenciales sintéticas en el entorno efímero.');
  }
  const marker = `PS_AUDIT_${runId}`;
  const originalJournalPath = resolve(folder, 'journal.json');
  const journalPath = mode === '--resume-event' ? resolve(folder, 'event-reconciliation.json') : originalJournalPath;
  const lockPath = resolve(folder, 'runner.lock');
  if (mode === '--execute') requireValue(!existsSync(journalPath), 'La ejecución ya tiene diario: revisa y usa --cleanup; no se repiten altas.');
  let journal;
  if (mode === '--resume-event') {
    requireValue(!existsSync(journalPath), 'Ya existe una conciliación; revisar su diario sin repetirla.');
    const original = validateResumeJournal(JSON.parse(readFileSync(originalJournalPath, 'utf8')));
    requireValue(original.kind === manifest.kind && original.runId === runId && original.tenantId === manifest.accounts.a.tenantId && original.marker === marker, 'El diario original no corresponde al manifiesto.');
    journal = { kind: original.kind, runId, tenantId: original.tenantId, marker, created: {}, intents: { event: true }, checks: [], calls: [], sourceJournal: 'journal.json', originalFailure: original.failure };
  } else {
    journal = mode === '--cleanup'
      ? JSON.parse(readFileSync(journalPath, 'utf8'))
      : { kind: manifest.kind, runId, tenantId: manifest.accounts.a.tenantId, marker, created: {}, intents: {}, checks: [], calls: [] };
  }
  requireValue(journal.kind === manifest.kind && journal.runId === runId && journal.tenantId === manifest.accounts.a.tenantId && journal.marker === marker, 'Diario no corresponde al manifiesto.');
  for (const kind of ['task', 'event']) requireValue(!journal.created[kind] || CUID.test(journal.created[kind]), 'ID en diario inválido.');
  mkdirSync(folder, { recursive: true });
  const lock = openSync(lockPath, 'wx', 0o600);
  const tokens = {};
  const verified = new Set();
  let calls = 0;
  let failed = false;
  let cleanupEligible = mode !== '--resume-event';
  function save() {
    const tmp = `${journalPath}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(journal, null, 2)}\n`, { mode: 0o600 });
    renameSync(tmp, journalPath);
  }
  function pass(label) { journal.checks.push({ label, at: new Date().toISOString() }); save(); console.log(`PASS ${label}`); }
  async function request(method, path, side, body, expected = 200) {
    requireValue(allowedRequest(method, path, { ...journal.created, marker }, mode), 'Petición fuera de la lista permitida.');
    requireValue(++calls <= (mode === '--resume-event' ? 20 : 40), 'Límite de peticiones alcanzado. Revisa el diario antes de continuar.');
    const row = { method, path, at: new Date().toISOString(), status: null };
    journal.calls.push(row);
    save();
    let response;
    try {
      response = await fetch(`${ORIGIN}/api${path}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(12000),
        headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}), ...(side && tokens[side] ? { authorization: `Bearer ${tokens[side]}` } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch { throw new Error(`Fallo de red en ${method} ${path}; no hay reintento automático.`); }
    row.status = response.status;
    save();
    requireValue(response.headers.get('x-app-revision') === manifest.revision, 'La revisión desplegada cambió o no coincide.');
    const accepted = Array.isArray(expected) ? expected : [expected];
    requireValue(accepted.includes(response.status), `Estado inesperado en ${method} ${path}: ${response.status}; esperado ${accepted.join('/')}.`);
    if (response.status >= 400) { await response.body?.cancel(); return null; }
    let envelope;
    try { envelope = await response.json(); } catch { throw new Error(`Respuesta no JSON en ${method} ${path}.`); }
    requireValue(envelope?.statusCode === response.status && 'data' in envelope, `Contrato de respuesta inválido en ${method} ${path}.`);
    return envelope.data;
  }
  async function findOwned(kind) {
    const id = journal.created[kind];
    if (kind === 'event' && id) {
      const item = await request('GET', `/events/${id}`, 'a', undefined, [200, 404]);
      if (!item) return null;
      requireValue(item.id === id, 'Evento encontrado distinto del diario.');
      assertOwnedRecord(item, kind, manifest.accounts.a, marker);
      return item;
    }
    const records = await request('GET', `/${kind === 'task' ? 'tasks' : 'events'}?${id ? `entityId=${id}` : `search=${marker}`}&limit=2`, 'a');
    const item = selectOwnedRecord(records, kind, manifest.accounts.a, marker, id, mode === '--resume-event' && kind === 'event');
    if (!item) return null;
    journal.created[kind] = item.id;
    save();
    if (kind === 'event') {
      // Reconcile a successful POST whose response was not recorded locally.
      // The recovered ID only grants access to this exact detail route.
      const detail = await request('GET', `/events/${item.id}`, 'a');
      requireValue(detail?.id === item.id, 'Evento reconciliado distinto del listado.');
      assertOwnedRecord(detail, kind, manifest.accounts.a, marker);
      return detail;
    }
    return item;
  }
  async function cleanup() {
    requireValue(verified.has('a'), 'No se limpia sin identidad A verificada.');
    for (const kind of ['task', 'event']) {
      if (!journal.intents[kind]) continue;
      const item = await findOwned(kind);
      if (!item) { requireValue(kind === 'event' || !journal.created[kind], 'Tarea retenida desapareció; requiere revisión.'); continue; }
      if (kind === 'task') {
        if (item.status !== 'CANCELLED') await request('PATCH', `/tasks/${item.id}`, 'a', { status: 'CANCELLED' });
        const cancelled = await findOwned('task');
        requireValue(cancelled?.status === 'CANCELLED', 'Cancelación no persistida.');
        pass('Tarea sintética conservada CANCELLED');
      } else {
        requireValue(item.status === 'DRAFT', 'No se elimina un evento que dejó de ser borrador.');
        requireValue(verified.has('b'), 'No se elimina sin verificar la identidad B y el aislamiento del evento.');
        await request('GET', `/events/${item.id}`, 'b', undefined, 404);
        await request('DELETE', `/events/${item.id}`, 'a');
        await request('GET', `/events/${item.id}`, 'a', undefined, 404);
        pass('Borrador sintético eliminado y ausencia confirmada');
      }
    }
    journal.cleanedAt = new Date().toISOString(); save();
  }
  try {
    save();
    await request('GET', '/auth/me', undefined, undefined, 401);
    pass('Sin token se recibe 401; revisión desplegada coincide');
    for (const side of ['a', 'b']) {
      const login = await request('POST', '/auth/login', undefined, { email: manifest.accounts[side].email, password: passwords[side] }, 201);
      requireValue(!login?.requiresMfa && typeof login?.access_token === 'string', 'Login exige MFA o no emite sesión; detener sin eludir controles.');
      tokens[side] = login.access_token;
      assertIdentity(login.user, manifest.accounts[side]);
      const me = await request('GET', '/auth/me', side);
      assertIdentity(me?.user, manifest.accounts[side]);
      verified.add(side);
    }
    pass('Identidades A/B comprobadas con sesión real');
    if (mode === '--execute') {
      const readiness = await request('GET', '/operation-profile/readiness', 'a');
      requireValue(readiness?.stage === null && readiness.overall === 'BLOCKED' && Object.values(readiness.sections ?? {}).flat().some((check) => check.code === 'PROFILE_CONFIGURED' && check.status === 'BLOCK'), 'Alistamiento no refleja ausencia de perfil.');
      const briefing = await request('GET', '/command-center/briefing', 'a');
      const serialized = JSON.stringify(briefing);
      requireValue(serialized.includes(manifest.accounts.a.tenantId) && !serialized.includes(manifest.accounts.b.tenantId), 'Centro de comando no corresponde a A.');
      pass('Alistamiento y centro de comando responden desde la organización A');
      for (const kind of ['task', 'event']) {
        requireValue(await findOwned(kind) === null, 'Ya existe el marcador: no se crea un duplicado.');
        journal.intents[kind] = true; save();
        const path = kind === 'task' ? '/tasks' : '/events';
        const created = await request('POST', path, 'a', kind === 'task'
          ? { title: `${marker} task`, description: DESCRIPTION, assigneeId: manifest.accounts.a.userId }
          : { name: `${marker} event`, description: DESCRIPTION, startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 90000000).toISOString(), responsibleId: manifest.accounts.a.userId }, 201);
        assertOwnedRecord(created, kind, manifest.accounts.a, marker);
        journal.created[kind] = created.id; save();
        requireValue((await findOwned(kind))?.id === created.id, 'Alta no confirmada por una consulta posterior.');
        if (kind === 'task') {
          const other = await request('GET', `/tasks?entityId=${created.id}&limit=2`, 'b');
          requireValue(other?.items?.length === 0 && other.pagination?.total === 0, 'B puede consultar la tarea de A.');
        } else await request('GET', `/events/${created.id}`, 'b', undefined, 404);
        const updatedDescription = `${DESCRIPTION} Lectura posterior verificada.`;
        await request('PATCH', `${path}/${created.id}`, 'b', { description: `${DESCRIPTION} Escritura que debe rechazarse.` }, 404);
        await request('PATCH', `${path}/${created.id}`, 'a', { description: updatedDescription, ...(kind === 'task' ? { status: 'IN_PROGRESS' } : {}) });
        const readback = await findOwned(kind);
        requireValue(readback?.description === updatedDescription && readback.status === (kind === 'task' ? 'IN_PROGRESS' : 'DRAFT'), 'Actualización no persistida o estado no permitido.');
        pass(`${kind}: creación, lectura, actualización y aislamiento A/B`);
      }
    } else if (mode === '--resume-event') {
      const event = await findOwned('event');
      requireValue(event !== null, 'No se encontró el evento pendiente; no se repetirá el alta.');
      await request('GET', `/events/${event.id}`, 'b', undefined, 404);
      await request('PATCH', `/events/${event.id}`, 'b', { description: `${DESCRIPTION} Escritura que debe rechazarse.` }, 404);
      cleanupEligible = true;
      const updatedDescription = `${DESCRIPTION} Lectura posterior verificada.`;
      await request('PATCH', `/events/${event.id}`, 'a', { description: updatedDescription });
      const readback = await findOwned('event');
      requireValue(readback?.description === updatedDescription && readback.status === 'DRAFT', 'Actualización del evento conciliado no persistida.');
      pass('event: alta 201 previa conciliada, lectura, actualización y aislamiento A/B');
    }
  } catch (error) {
    failed = true;
    journal.failure = error.message;
    console.error(`FAIL ${error.message}`);
  } finally {
    try { if (verified.has('a') && cleanupEligible) await cleanup(); }
    catch (error) { failed = true; journal.cleanupFailure = error.message; console.error(`CLEANUP PENDIENTE ${error.message}`); }
    for (const side of ['a', 'b']) {
      if (!tokens[side] || !verified.has(side)) continue;
      try {
        await request('POST', '/auth/logout', side, undefined, 201);
        await request('GET', '/auth/me', side, undefined, 401);
        pass(`Sesión sintética ${side.toUpperCase()} revocada`);
      } catch (error) { failed = true; journal.logoutFailure = true; console.error(`No se confirmó cierre de sesión ${side.toUpperCase()}: ${error.message}`); }
    }
    journal.lastRun = { mode, at: new Date().toISOString(), requests: calls, passed: !failed };
    save(); closeSync(lock); unlinkSync(lockPath);
  }
  if (failed) process.exitCode = 1;
}

export async function main(args = process.argv.slice(2)) {
  if (args.length === 0 || (args.length === 1 && args[0] === '--plan')) { console.log(JSON.stringify(plan(), null, 2)); return; }
  requireValue(args.length === 2 && ['--execute', '--cleanup', '--resume-event'].includes(args[0]), 'Uso: --plan | --execute UUID | --cleanup UUID | --resume-event UUID');
  await execute(args[0], args[1]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('No se inició o completó el runner. Revisa opt-in, manifiesto, credenciales, bloqueo local y diario; no se imprimen secretos.'); process.exitCode = 1; });
}
