import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');
const environment = Object.fromEntries((await readFile(new URL('../../.artifacts/staging/.env.local', import.meta.url), 'utf8')).trim().split(/\r?\n/).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
assert.equal(environment.COMPOSE_PROJECT_NAME, 'politica-local-staging');
const base = 'http://127.0.0.1:5800';
const bucket = 'politica-local-staging-private';
const client = createClient(base, environment.STAGING_STORAGE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const anonymous = createClient(base, environment.STAGING_STORAGE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const path = `synthetic-audit/staging/${randomUUID()}.txt`;
const bytes = Buffer.from('Synthetic staging verification only. No personal or production data.\n');
let uploadAttempted = false;
let failed;
try {
  const check = await client.storage.getBucket(bucket);
  assert.equal(check.error, null);
  assert.equal(check.data.public, false);
  const denied = await anonymous.storage.from(bucket).upload(path, bytes);
  assert.ok(denied.error, 'Anonymous unsigned writes must be denied');
  const signed = await client.storage.from(bucket).createSignedUploadUrl(path, { upsert: false });
  assert.equal(signed.error, null);
  assert.equal(new URL(signed.data.signedUrl).origin, base);
  uploadAttempted = true;
  const upload = await fetch(signed.data.signedUrl, { method: 'PUT', headers: { 'content-type': 'text/plain', 'x-upsert': 'false', Origin: 'http://127.0.0.1:5310' }, body: bytes });
  assert.equal(upload.ok, true, `Signed direct PUT returned HTTP ${upload.status}`);
  assert.equal(upload.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5310');
  const deniedRead = await anonymous.storage.from(bucket).download(path);
  assert.ok(deniedRead.error, 'Anonymous unsigned reads must be denied');
  const download = await client.storage.from(bucket).createSignedUrl(path, 30);
  assert.equal(download.error, null);
  assert.equal(new URL(download.data.signedUrl).origin, base);
  const fetched = await fetch(download.data.signedUrl);
  assert.equal(fetched.ok, true);
  assert.equal(createHash('sha256').update(Buffer.from(await fetched.arrayBuffer())).digest('hex'), createHash('sha256').update(bytes).digest('hex'));
} catch (error) {
  failed = error;
} finally {
  if (uploadAttempted) {
    const cleanup = await client.storage.from(bucket).remove([path]);
    if (cleanup.error) throw new AggregateError([...(failed ? [failed] : []), cleanup.error], 'Owned synthetic object cleanup failed');
  }
}
if (failed) throw failed;
const removed = await client.storage.from(bucket).download(path);
assert.ok(removed.error, 'Owned synthetic object must be absent after cleanup');
console.log('PASS: real private Supabase Storage; anonymous read/write denied; signed direct PUT and signed download match SHA-256; exact local CORS; owned synthetic object removed and absence verified.');
