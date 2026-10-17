import {
  PrismaService,
  resolveDatabaseConnectionString,
  resolveDatabaseSchema,
  resolveDatabaseSearchPathOptions,
  resolveDatabaseSsl,
} from './prisma.service';
import pg from 'pg';
import type { PeerCertificate } from 'node:tls';

describe('PrismaService lifecycle', () => {
  it('disconnects the pool when Nest receives a shutdown signal', async () => {
    const service = Object.create(PrismaService.prototype) as PrismaService;
    const disconnect = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(service, '$disconnect', { value: disconnect });

    await service.onModuleDestroy();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});

describe('resolveDatabaseSchema', () => {
  it('reads the schema used by Prisma from DATABASE_URL', () => {
    expect(
      resolveDatabaseSchema(
        'postgresql://user:password@db.example.com:5432/postgres?schema=politica-sostenible',
        undefined,
      ),
    ).toBe('politica-sostenible');
  });

  it('prefers an explicit DATABASE_SCHEMA', () => {
    expect(
      resolveDatabaseSchema(
        'postgresql://user:password@db.example.com/postgres?schema=public',
        'campaign_data',
      ),
    ).toBe('campaign_data');
  });

  it('uses the adapter default when no schema is configured', () => {
    expect(
      resolveDatabaseSchema(
        'postgresql://user:password@db.example.com/postgres',
        undefined,
      ),
    ).toBeUndefined();
  });

  it('rejects malformed URLs and unsafe schema names', () => {
    expect(() => resolveDatabaseSchema('not-a-url', undefined)).toThrow(
      'DATABASE_URL must be a valid PostgreSQL URL',
    );
    expect(() =>
      resolveDatabaseSchema(
        'postgresql://user:password@db.example.com/postgres',
        'public; DROP SCHEMA public',
      ),
    ).toThrow('DATABASE_SCHEMA contains an invalid PostgreSQL identifier');
  });
});

describe('resolveDatabaseSearchPathOptions', () => {
  it('pins raw SQL to the same validated custom schema as Prisma', () => {
    expect(resolveDatabaseSearchPathOptions('politica-sostenible')).toBe(
      '-c search_path="politica-sostenible",pg_catalog',
    );
    expect(resolveDatabaseSearchPathOptions(undefined)).toBeUndefined();
    expect(() =>
      resolveDatabaseSearchPathOptions('public,attacker_schema'),
    ).toThrow('DATABASE_SCHEMA contains an invalid PostgreSQL identifier');
  });
});

describe('resolveDatabaseSsl', () => {
  it.each([
    ['127.0.0.1', 'DNS:localhost', false],
    ['127.0.0.1', 'IP Address:127.0.0.1', true],
    ['[::1]', 'DNS:localhost', false],
    ['[::1]', 'IP Address:0:0:0:0:0:0:0:1', true],
    ['db.example.test', 'DNS:another.example.test', false],
    ['db.example.test', 'DNS:db.example.test', true],
  ])('verifies URL host %s against certificate %s', (host, san, accepted) => {
    const ssl = resolveDatabaseSsl({
      NODE_ENV: 'production',
      DATABASE_SSL: 'true',
      DATABASE_SSL_REJECT_UNAUTHORIZED: 'true',
      DATABASE_URL: `postgresql://fixture@${host}/test?sslmode=verify-full`,
    });
    if (!ssl || !ssl.checkServerIdentity) throw new Error('Identity check absent');
    const result = ssl.checkServerIdentity('localhost', {
      subjectaltname: san,
      subject: {},
    } as PeerCertificate);
    if (accepted) expect(result).toBeUndefined();
    else expect(result).toMatchObject({ code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
  });

  it('requires verified TLS in production by default', () => {
    expect(
      resolveDatabaseSsl({
        NODE_ENV: 'production',
        DATABASE_SSL: 'true',
        DATABASE_SSL_REJECT_UNAUTHORIZED: 'true',
      }),
    ).toEqual({ rejectUnauthorized: true });

    expect(() =>
      resolveDatabaseSsl({
        NODE_ENV: 'production',
        DATABASE_SSL: 'false',
        DATABASE_SSL_REJECT_UNAUTHORIZED: 'false',
      }),
    ).toThrow('PostgreSQL TLS is mandatory');
  });

  it('allows plain PostgreSQL only with the explicit evaluation profile', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(
      resolveDatabaseSsl({
        NODE_ENV: 'production',
        DEPLOYMENT_PROFILE: 'evaluation',
        ALLOW_INSECURE_DATABASE_CONNECTION: 'true',
        DATABASE_SSL: 'false',
        DATABASE_SSL_REJECT_UNAUTHORIZED: 'false',
      }),
    ).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('insecure evaluation profile'),
    );

    warn.mockRestore();
  });

  it('rejects a contradictory evaluation TLS configuration', () => {
    expect(() =>
      resolveDatabaseSsl({
        NODE_ENV: 'production',
        DEPLOYMENT_PROFILE: 'evaluation',
        ALLOW_INSECURE_DATABASE_CONNECTION: 'true',
        DATABASE_SSL: 'true',
        DATABASE_SSL_REJECT_UNAUTHORIZED: 'true',
      }),
    ).toThrow('evaluation database exception requires');
  });
});

describe('verified PostgreSQL URL transport', () => {
  const environment = {
    NODE_ENV: 'production',
    DATABASE_SSL: 'true',
    DATABASE_SSL_REJECT_UNAUTHORIZED: 'true',
  };
  const base = 'postgresql://fixture@db.example.test/politica?schema=campaign';
  function effectiveSsl(connectionString: string | undefined) {
    const client = new pg.Client({
      connectionString,
      ssl: resolveDatabaseSsl(environment),
    });
    return (client as unknown as { connectionParameters: { ssl: unknown } })
      .connectionParameters.ssl;
  }

  it.each(['https://db.example.test/politica', 'file:///tmp/fixture'])(
    'rejects a non-PostgreSQL protocol before constructing the pool: %s',
    (url) => {
      expect(() => resolveDatabaseConnectionString(url, environment)).toThrow(
        'must be a valid PostgreSQL URL',
      );
    },
  );

  it.each(['', '&sslmode=verify-full'])(
    'retains explicit certificate verification in the real pg parser: %s',
    (suffix) => {
      const normalized = resolveDatabaseConnectionString(
        base + suffix,
        environment,
      );
      expect(normalized).not.toContain('sslmode');
      expect(new URL(normalized!).searchParams.get('schema')).toBe('campaign');
      expect(effectiveSsl(normalized)).toEqual({ rejectUnauthorized: true });
    },
  );

  it.each([
    'sslmode=disable',
    'sslmode=no-verify',
    'sslmode=require',
    'sslmode=verify-full&sslmode=disable',
    'sslmode=disable&sslmode=verify-full',
    'sslmode=verify-full&sslmode=verify-full',
    'sslmode=verify-full&ssl=0',
    'sslmode=verify-full&uselibpqcompat=true',
    'ssl=0',
    'ssl=1',
    'ssl=no-verify',
    'sslmode=verify-full&sslrootcert=unread-fixture.pem',
    'sslmode=verify-full&sslcert=unread-fixture.pem',
    'sslmode=verify-full&sslkey=unread-fixture.pem',
    'SSLMODE=verify-full',
    'sslmode=VERIFY-FULL',
    'sslmode=verify-full&sslnegotiation=direct',
    'sslmode=verify-full&%73slmode=disable',
  ])('rejects URL overrides before pg can apply them: %s', (query) => {
    expect(() =>
      resolveDatabaseConnectionString(`${base}&${query}`, environment),
    ).toThrow('cannot override verified');
  });

  it('reproduces the unprotected pg override and preserves explicit evaluation behavior', () => {
    expect(effectiveSsl(`${base}&sslmode=verify-full&sslmode=disable`)).toBe(
      false,
    );
    expect(effectiveSsl(`${base}&sslmode=no-verify`)).toEqual({
      rejectUnauthorized: false,
    });
    expect(
      resolveDatabaseConnectionString(`${base}&sslmode=disable`, {
        NODE_ENV: 'production',
        DEPLOYMENT_PROFILE: 'evaluation',
        ALLOW_INSECURE_DATABASE_CONNECTION: 'true',
      }),
    ).toBe(`${base}&sslmode=disable`);
    expect(() =>
      resolveDatabaseConnectionString(`${base}&sslmode=disable`, {
        ...environment,
        DEPLOYMENT_PROFILE: 'evaluation',
      }),
    ).toThrow('cannot override verified');
  });
});
