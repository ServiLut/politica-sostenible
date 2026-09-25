import { createServer, request } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PUBLIC_ORIGIN = 'http://127.0.0.1:5310';
const HOP_HEADERS = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);
const ALLOWED_HEADERS = new Set(['authorization', 'apikey', 'content-type', 'x-client-info', 'x-upsert', 'x-metadata', 'cache-control', 'content-range', 'range', 'if-none-match', 'if-modified-since']);

export function createStorageGateway(upstream = 'http://storage:5000') {
  const target = new URL(upstream);
  if (target.protocol !== 'http:' || !['storage', '127.0.0.1'].includes(target.hostname) || target.pathname !== '/' || target.username || target.password) throw new Error('Storage upstream must be the isolated local service');
  return createServer((incoming, outgoing) => {
    const origin = incoming.headers.origin;
    if (origin && origin !== PUBLIC_ORIGIN) {
      outgoing.writeHead(403).end();
      return;
    }
    if (origin) {
      outgoing.setHeader('Access-Control-Allow-Origin', PUBLIC_ORIGIN);
      outgoing.setHeader('Vary', 'Origin');
      outgoing.setHeader('Access-Control-Expose-Headers', 'content-range, range, etag, content-length, content-type, cache-control, last-modified');
    }
    if (!incoming.url?.startsWith('/storage/v1/')) {
      outgoing.writeHead(404).end();
      return;
    }
    if (incoming.method === 'OPTIONS') {
      const headers = String(incoming.headers['access-control-request-headers'] ?? '').toLowerCase().split(',').map((value) => value.trim()).filter(Boolean);
      const method = incoming.headers['access-control-request-method'];
      if (!['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(method) || headers.some((header) => !ALLOWED_HEADERS.has(header))) {
        outgoing.writeHead(403).end();
        return;
      }
      outgoing.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, DELETE, PATCH, OPTIONS');
      outgoing.setHeader('Access-Control-Allow-Headers', [...ALLOWED_HEADERS].join(', '));
      outgoing.setHeader('Access-Control-Max-Age', '600');
      outgoing.writeHead(204).end();
      return;
    }
    const headers = Object.fromEntries(Object.entries(incoming.headers).filter(([name]) => !HOP_HEADERS.has(name) && !name.startsWith('x-forwarded-') && name !== 'host'));
    const forwarded = request({ hostname: target.hostname, port: target.port, path: incoming.url.slice('/storage/v1'.length), method: incoming.method, headers, timeout: 120_000 }, (response) => {
      for (const [name, value] of Object.entries(response.headers)) if (value !== undefined && !HOP_HEADERS.has(name) && !name.startsWith('access-control-') && name !== 'vary') outgoing.setHeader(name, value);
      outgoing.writeHead(response.statusCode ?? 502);
      response.pipe(outgoing);
      response.on('error', () => outgoing.destroy());
    });
    forwarded.on('timeout', () => forwarded.destroy());
    forwarded.on('error', () => {
      if (!outgoing.headersSent) outgoing.writeHead(502).end();
      else outgoing.destroy();
    });
    incoming.on('aborted', () => forwarded.destroy());
    outgoing.on('close', () => { if (!outgoing.writableFinished) forwarded.destroy(); });
    incoming.pipe(forwarded);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = createStorageGateway();
  server.listen(5800, '0.0.0.0', () => console.log('Local Storage gateway listening on 5800'));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
}
