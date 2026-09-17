import {
  PrismaService,
  resolveDatabaseSchema,
  resolveDatabaseSearchPathOptions,
  resolveDatabaseSsl,
} from './prisma.service';

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
