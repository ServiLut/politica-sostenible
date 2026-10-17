import {
  assertRuntimeDatabaseRole,
  runtimeDatabaseRoleGuardRequired,
  runtimeDatabaseRoleQuery,
  type RuntimeDatabaseRoleState,
} from './runtime-database-role';
import { PrismaService } from './prisma.service';

const safe = (): RuntimeDatabaseRoleState => ({
  active_schema: 'campaign',
  schema_exists: true,
  schema_usage: true,
  superuser: false,
  bypass_rls: false,
  create_role: false,
  create_database: false,
  replication: false,
  database_owner: false,
  schema_owner: false,
  relation_owner: false,
  database_create: false,
  schema_create: false,
  privileged_membership: false,
  outside_schema_access: false,
  privileged_function_access: false,
});

describe('runtime database role guard', () => {
  it('requires the guard in production unless evaluation is explicit', () => {
    for (const profile of [undefined, '', 'production', 'evaluation-typo']) {
      expect(
        runtimeDatabaseRoleGuardRequired({
          NODE_ENV: 'production',
          DEPLOYMENT_PROFILE: profile,
        }),
      ).toBe(true);
    }
    expect(
      runtimeDatabaseRoleGuardRequired({
        NODE_ENV: 'production',
        DEPLOYMENT_PROFILE: ' Evaluation ',
      }),
    ).toBe(false);
    expect(runtimeDatabaseRoleGuardRequired({ NODE_ENV: 'test' })).toBe(false);
  });

  it('accepts only one complete least-privilege metadata result for the exact schema', () => {
    expect(() => assertRuntimeDatabaseRole([safe()], 'campaign')).not.toThrow();
    for (const rows of [[], [safe(), safe()]])
      expect(() => assertRuntimeDatabaseRole(rows, 'campaign')).toThrow(
        'METADATA_INVALID',
      );
    expect(() => assertRuntimeDatabaseRole([safe()], undefined)).toThrow(
      'METADATA_INVALID',
    );
    expect(() => assertRuntimeDatabaseRole([safe()], 'another_schema')).toThrow(
      'UNSAFE',
    );
    expect(() =>
      assertRuntimeDatabaseRole(
        [{ ...safe(), schema_usage: false }],
        'campaign',
      ),
    ).toThrow('UNSAFE');
  });

  it.each([
    'superuser',
    'bypass_rls',
    'create_role',
    'create_database',
    'replication',
    'database_owner',
    'schema_owner',
    'relation_owner',
    'database_create',
    'schema_create',
    'privileged_membership',
    'outside_schema_access',
    'privileged_function_access',
  ] as const)(
    'rejects %s, including incomplete/nonboolean evidence',
    (field) => {
      for (const value of [true, undefined, 'false']) {
        expect(() =>
          assertRuntimeDatabaseRole(
            [{ ...safe(), [field]: value }] as RuntimeDatabaseRoleState[],
            'campaign',
          ),
        ).toThrow('UNSAFE');
      }
    },
  );

  it('binds the schema as a parameter and queries metadata only', () => {
    const value = "unsafe'; DROP SCHEMA public;--";
    const query = runtimeDatabaseRoleQuery(value);
    expect(query.text).not.toContain(value);
    expect(query.values).toEqual([value, value, value]);
    expect(query.text).toContain(
      "pg_has_role(me.oid, inherited.oid, 'MEMBER')",
    );
    expect(query.text).not.toMatch(/FROM\s+"(?:Voter|User|Tenant)"/i);
  });
});

describe('PrismaService startup privilege check', () => {
  const environment = { ...process.env };
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.DEPLOYMENT_PROFILE = 'production';
    process.env.DATABASE_SCHEMA = 'campaign';
    delete process.env.DATABASE_URL;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    process.env = { ...environment };
    jest.restoreAllMocks();
  });
  function serviceWith(rows: RuntimeDatabaseRoleState[]) {
    const service = Object.create(PrismaService.prototype) as PrismaService;
    const connect = jest.fn().mockResolvedValue(undefined);
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ '?column?': 1 }])
      .mockResolvedValue(rows);
    const disconnect = jest.fn().mockResolvedValue(undefined);
    Object.defineProperties(service, {
      $connect: { value: connect },
      $queryRaw: { value: query },
      $disconnect: { value: disconnect },
    });
    return { service, connect, query, disconnect };
  }
  it('checks privileges after connection and before announcing readiness', async () => {
    const { service, query } = serviceWith([safe()]);
    await service.onModuleInit();
    expect(query).toHaveBeenCalledTimes(2);
    expect(console.log).toHaveBeenCalledWith(
      'Database connection established.',
    );
  });
  it('fails production startup and closes its pool for a broad runtime role', async () => {
    const { service, disconnect } = serviceWith([
      { ...safe(), bypass_rls: true },
    ]);
    await expect(service.onModuleInit()).rejects.toThrow(
      'RUNTIME_DATABASE_ROLE_UNSAFE',
    );
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(console.log).not.toHaveBeenCalled();
  });
  it('preserves the existing explicit evaluation startup without a new privilege query', async () => {
    process.env.DEPLOYMENT_PROFILE = 'evaluation';
    const { service, query } = serviceWith([{ ...safe(), bypass_rls: true }]);
    await service.onModuleInit();
    expect(query).toHaveBeenCalledTimes(1);
  });
});
