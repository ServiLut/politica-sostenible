import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { createEnvironment, writeEnvironment } from './create-environment.mjs';
import { createStorageGateway } from './storage-gateway.mjs';

test('secrets are fresh, separated; signed local tokens carry limited roles and expiry', () => {
  const now = 1_700_000_000_000;
  const first = createEnvironment(now);
  const second = createEnvironment(now);
  for (const name of ['STAGING_APP_DB_PASSWORD', 'STAGING_STORAGE_DB_PASSWORD', 'STAGING_REDIS_PASSWORD', 'STAGING_APP_JWT_SECRET', 'STAGING_STORAGE_JWT_SECRET']) {
    assert.notEqual(first[name], second[name]);
    assert.match(first[name], /^[a-f0-9]{64}$/);
  }
  assert.notEqual(first.STAGING_APP_DB_PASSWORD, first.STAGING_STORAGE_DB_PASSWORD);
  for (const [name, role] of [['STAGING_STORAGE_ANON_KEY', 'anon'], ['STAGING_STORAGE_SERVICE_KEY', 'service_role']]) {
    const [header, body, signature] = first[name].split('.');
    assert.equal(signature, createHmac('sha256', first.STAGING_STORAGE_JWT_SECRET).update(`${header}.${body}`).digest('base64url'));
    const claims = JSON.parse(Buffer.from(body, 'base64url'));
    assert.equal(claims.role, role);
    assert.equal(claims.iss, 'politica-local-staging');
    assert.equal(claims.exp - claims.iat, 30 * 86400);
  }
});

test('environment creation never overwrites secrets used by existing volumes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'politica-staging-test-'));
  try {
    const file = join(directory, '.env.local');
    await writeEnvironment(file);
    const before = await readFile(file, 'utf8');
    await assert.rejects(writeEnvironment(file), { code: 'EEXIST' });
    assert.equal(await readFile(file, 'utf8'), before);
  } finally {
    await rm(directory, { recursive: true });
  }
});

test('gateway streams to fixed Storage with exact path and authorization, enforces origin and prefix', async () => {
  let requests = 0;
  const fixture = Buffer.alloc(512 * 1024, 's');
  const upstream = createServer((request, response) => {
    requests++;
    assert.equal(request.url, '/object/upload/sign/staging/sample?token=fixture-token');
    assert.equal(request.headers.authorization, 'Bearer fixture');
    assert.equal(request.headers['x-forwarded-host'], undefined);
    let size = 0;
    request.on('data', (chunk) => { size += chunk.length; });
    request.on('end', () => response.writeHead(201, { 'content-type': 'application/json', etag: 'fixture-etag' }).end(JSON.stringify({ size })));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const gateway = createStorageGateway(`http://127.0.0.1:${upstream.address().port}`);
  gateway.listen(0, '127.0.0.1');
  await once(gateway, 'listening');
  const base = `http://127.0.0.1:${gateway.address().port}`;
  try {
    const response = await fetch(`${base}/storage/v1/object/upload/sign/staging/sample?token=fixture-token`, { method: 'PUT', headers: { authorization: 'Bearer fixture', origin: 'http://127.0.0.1:5310', 'x-forwarded-host': 'remote.invalid' }, body: fixture });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).size, fixture.length);
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5310');
    assert.equal(response.headers.get('etag'), 'fixture-etag');
    const options = await fetch(`${base}/storage/v1/object/upload/sign/test`, { method: 'OPTIONS', headers: { origin: 'http://127.0.0.1:5310', 'access-control-request-method': 'PUT', 'access-control-request-headers': 'content-type,x-upsert,authorization,apikey,x-client-info,x-metadata' } });
    assert.equal(options.status, 204);
    assert.ok(options.headers.get('access-control-allow-headers').split(', ').includes('x-metadata'));
    const unsupported = await fetch(`${base}/storage/v1/object/upload/sign/test`, { method: 'OPTIONS', headers: { origin: 'http://127.0.0.1:5310', 'access-control-request-method': 'PUT', 'access-control-request-headers': 'x-unexpected-header' } });
    assert.equal(unsupported.status, 403);
    assert.equal((await fetch(`${base}/storage/v1/status`, { headers: { origin: 'https://remote.invalid' } })).status, 403);
    assert.equal((await fetch(`${base}/auth/v1/token`)).status, 404);
    assert.equal(requests, 1);
  } finally {
    gateway.closeAllConnections();
    upstream.closeAllConnections();
    await Promise.all([new Promise((done) => gateway.close(done)), new Promise((done) => upstream.close(done))]);
  }
});

test('actual Supabase SDK byte and browser File upload headers pass the local preflight', async () => {
  const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
  const { createClient } = require('@supabase/supabase-js');
  const received = [];
  const upstream = createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      received.push({ headers: request.headers, body: Buffer.concat(chunks) });
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ Key: 'staging/fixture.txt' }));
    });
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const gateway = createStorageGateway(`http://127.0.0.1:${upstream.address().port}`);
  gateway.listen(0, '127.0.0.1');
  await once(gateway, 'listening');
  const base = `http://127.0.0.1:${gateway.address().port}`;
  const exactHeaders = [];
  const metadata = { contentSha256: 'a'.repeat(64) };
  try {
    const client = createClient(base, createEnvironment().STAGING_STORAGE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async (url, options) => {
        const headers = new Headers(options.headers);
        const names = [...headers.keys()].sort();
        exactHeaders.push(names);
        const preflight = await fetch(url, { method: 'OPTIONS', headers: {
          origin: 'http://127.0.0.1:5310',
          'access-control-request-method': options.method,
          'access-control-request-headers': names.join(','),
        } });
        assert.equal(preflight.status, 204);
        const allowed = preflight.headers.get('access-control-allow-headers').split(', ');
        for (const name of names) assert.ok(allowed.includes(name), `CORS must allow SDK header ${name}`);
        headers.set('origin', 'http://127.0.0.1:5310');
        return fetch(url, { ...options, headers });
      } },
    });
    for (const body of [Buffer.from('fixture'), new File(['fixture'], 'fixture.txt', { type: 'text/plain' })]) {
      const result = await client.storage.from('staging').uploadToSignedUrl('fixture.txt', 'fixture-token', body, { contentType: 'text/plain', metadata });
      assert.equal(result.error, null);
    }
    assert.deepEqual(exactHeaders[0], ['apikey', 'authorization', 'cache-control', 'content-type', 'x-client-info', 'x-metadata', 'x-upsert']);
    assert.deepEqual(exactHeaders[1], ['apikey', 'authorization', 'x-client-info', 'x-upsert']);
    assert.deepEqual(JSON.parse(Buffer.from(received[0].headers['x-metadata'], 'base64')), metadata);
    assert.equal(received[0].body.toString(), 'fixture');
    assert.match(received[1].headers['content-type'], /^multipart\/form-data; boundary=/);
    assert.ok(received[1].body.toString().includes(JSON.stringify(metadata)));
  } finally {
    gateway.closeAllConnections();
    upstream.closeAllConnections();
    await Promise.all([new Promise((done) => gateway.close(done)), new Promise((done) => upstream.close(done))]);
  }
});

test('Compose resolves to isolated services, loopback ports and no production secrets', () => {
  const docker = process.env.STAGING_TEST_DOCKER || (process.platform === 'win32' ? 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe' : 'docker');
  const result = spawnSync(docker, ['compose', '-f', resolve('deploy/staging/compose.yml'), 'config', '--format', 'json'], { encoding: 'utf8', env: { ...process.env, ...createEnvironment() } });
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.equal(config.name, 'politica-local-staging');
  assert.equal(config.networks.default.internal, true);
  assert.equal(config.networks.frontend.internal ?? false, false);
  const services = config.services;
  assert.deepEqual(Object.keys(services).sort(), ['api', 'app-db', 'catalog-worker', 'migrate', 'redis', 'storage', 'storage-db', 'storage-gateway', 'storage-init', 'web']);
  for (const name of ['app-db', 'storage-db', 'redis', 'storage']) {
    assert.equal(services[name].ports, undefined);
    assert.deepEqual(Object.keys(services[name].networks), ['default']);
  }
  for (const name of ['web', 'storage-gateway']) for (const port of services[name].ports) assert.equal(port.host_ip, '127.0.0.1');
  assert.equal(services.api.network_mode, 'service:storage-gateway');
  assert.equal(services['catalog-worker'].network_mode, 'service:storage-gateway');
  assert.equal(services.api.environment.SUPABASE_URL, 'http://127.0.0.1:5800');
  assert.equal(services.api.environment.DEPLOYMENT_PROFILE, 'evaluation');
  assert.equal(services.api.environment.ALLOW_LOCAL_STAGING_BUILD, 'true');
  assert.equal(services.api.environment.DATABASE_SSL_REJECT_UNAUTHORIZED, 'false');
  assert.equal(services.migrate.environment.DIRECT_URL, services.api.environment.DATABASE_URL);
  assert.equal(services.api.environment.SUPABASE_STORAGE_BUCKET, 'politica-local-staging-private');
  assert.match(services.api.environment.DATABASE_URL, /@app-db:5432\/politica_staging\?schema=politica-staging&sslmode=disable$/);
  assert.match(services.storage.environment.DATABASE_URL, /@storage-db:5432\/politica_storage_metadata$/);
  assert.equal(services.storage.environment.DB_INSTALL_ROLES, 'true');
  assert.equal(services.storage.environment.STORAGE_BACKEND, 'file');
  assert.equal(services.web.environment.SUPABASE_SERVICE_ROLE_KEY, undefined);
  assert.equal(services.web.environment.DATABASE_URL, undefined);
  assert.equal(services.web.environment.NESTJS_API_URL, 'http://storage-gateway:4000');
  assert.equal(services.web.environment.DEPLOYMENT_PROFILE, 'evaluation');
  assert.equal(services.web.environment.ALLOW_LOCAL_STAGING_BUILD, 'true');
  assert.deepEqual(Object.keys(services.web.networks), ['frontend']);
  for (const service of Object.values(services)) if (service.image) assert.match(service.image, /@sha256:[a-f0-9]{64}$/);
  for (const volume of Object.values(config.volumes)) assert.equal(volume.external, undefined);
  assert.equal(JSON.stringify(config).includes('supabase.co'), false);
});
