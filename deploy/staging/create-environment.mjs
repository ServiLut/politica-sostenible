import { createHmac, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export function createEnvironment(now = Date.now()) {
  const secret = () => randomBytes(32).toString('hex');
  const storageSecret = secret();
  const jwt = (role) => {
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ iss: 'politica-local-staging', role, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 30 * 86400 })}`;
    return `${body}.${createHmac('sha256', storageSecret).update(body).digest('base64url')}`;
  };
  return {
    COMPOSE_PROJECT_NAME: 'politica-local-staging',
    APP_REVISION: 'unknown',
    STAGING_APP_DB_PASSWORD: secret(),
    STAGING_STORAGE_DB_PASSWORD: secret(),
    STAGING_REDIS_PASSWORD: secret(),
    STAGING_STORAGE_JWT_SECRET: storageSecret,
    STAGING_STORAGE_ANON_KEY: jwt('anon'),
    STAGING_STORAGE_SERVICE_KEY: jwt('service_role'),
    STAGING_APP_JWT_SECRET: secret(),
    STAGING_CONSENT_IP_SALT: secret(),
    STAGING_OFFLINE_SYNC_HMAC_SECRET: secret(),
    STAGING_MFA_KEY: randomBytes(32).toString('base64'),
  };
}

export async function writeEnvironment(file = resolve('.artifacts/staging/.env.local')) {
  await mkdir(dirname(file), { recursive: true });
  const environment = createEnvironment();
  await writeFile(file, Object.entries(environment).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
  return file;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const file = await writeEnvironment();
    console.log(`Credenciales locales nuevas guardadas en ${file}; no se imprimen. Caducidad JWT Storage: 30 días. No se sobrescriben credenciales existentes.`);
  } catch (error) {
    console.error(error.code === 'EEXIST' ? 'El archivo local ya existe. Se conserva; usa sus credenciales con sus volúmenes existentes.' : error.message);
    process.exitCode = 1;
  }
}
