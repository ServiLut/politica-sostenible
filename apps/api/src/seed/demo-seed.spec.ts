import {
  PoliticalOperationMode,
  PrismaClient,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import {
  prepareDemoIdentity,
  resolveDemoSeedConfig,
  seedDemo,
} from './demo-seed';

const secureDemoPassword = 'demo-only password with 30 bytes';

function validEnvironment(
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'development',
    DEMO_SEED_ENVIRONMENT: 'demo',
    ALLOW_DEMO_SEED: 'true',
    DEMO_SEED_DATABASE_URL:
      'postgresql://demo:secret@localhost:5432/politica_demo?schema=public',
    DEMO_SEED_USER_PASSWORD: secureDemoPassword,
    ...overrides,
  };
}

function demoUsers(tenantId: string) {
  return [
    {
      id: 'admin-id',
      email: 'demo@politicasostenible.co',
      tenantId,
      role: Role.ADMIN,
    },
    {
      id: 'andrea-id',
      email: 'andrea@demo.co',
      tenantId,
      role: Role.ZONE_COORDINATOR,
    },
    {
      id: 'miguel-id',
      email: 'miguel@demo.co',
      tenantId,
      role: Role.ZONE_COORDINATOR,
    },
    {
      id: 'sofia-id',
      email: 'sofia@demo.co',
      tenantId,
      role: Role.VOLUNTEER,
    },
    {
      id: 'diego-id',
      email: 'diego@demo.co',
      tenantId,
      role: Role.AUDITOR,
    },
  ];
}

function identityPrismaMock(options?: {
  tenant?: {
    id: string;
    name: string;
    type: TenantType;
    defaultMode: PoliticalOperationMode;
  } | null;
  users?: ReturnType<typeof demoUsers>;
}) {
  const tenant =
    options?.tenant === undefined
      ? {
          id: 'demo-tenant',
          name: 'Demo tenant',
          type: TenantType.CANDIDACY,
          defaultMode: PoliticalOperationMode.CAMPAIGN,
        }
      : options.tenant;
  const users = options?.users ?? [];
  const forbiddenUserUpdate = jest.fn();
  const userCreate = jest.fn(({ data }: { data: { email: string } }) =>
    Promise.resolve({
      id: `created-${data.email}`,
      email: data.email,
    }),
  );
  const prisma = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue(tenant),
      create: jest.fn().mockResolvedValue({
        id: 'created-demo-tenant',
        name: 'Created demo tenant',
      }),
    },
    user: {
      findMany: jest.fn().mockResolvedValue(users),
      create: userCreate,
      update: forbiddenUserUpdate,
      upsert: forbiddenUserUpdate,
      deleteMany: forbiddenUserUpdate,
    },
  };

  return { prisma, forbiddenUserUpdate, userCreate };
}

describe('resolveDemoSeedConfig', () => {
  it.each([
    ['production', 'production'],
    ['staging', 'staging'],
    ['an unset environment', undefined],
  ])('fails closed for %s NODE_ENV', (_label, nodeEnvironment) => {
    expect(() =>
      resolveDemoSeedConfig(validEnvironment({ NODE_ENV: nodeEnvironment })),
    ).toThrow('NODE_ENV=development o NODE_ENV=test');
  });

  it('requires the explicit demo environment confirmation', () => {
    expect(() =>
      resolveDemoSeedConfig(validEnvironment({ DEMO_SEED_ENVIRONMENT: 'qa' })),
    ).toThrow('DEMO_SEED_ENVIRONMENT=demo');
  });

  it('requires the explicit destructive seed authorization', () => {
    expect(() =>
      resolveDemoSeedConfig(validEnvironment({ ALLOW_DEMO_SEED: 'false' })),
    ).toThrow('ALLOW_DEMO_SEED=true');
  });

  it('does not fall back to the application DATABASE_URL', () => {
    expect(() =>
      resolveDemoSeedConfig(
        validEnvironment({
          DEMO_SEED_DATABASE_URL: undefined,
          DATABASE_URL: 'postgresql://app:secret@prod/db_production',
        }),
      ),
    ).toThrow('DEMO_SEED_DATABASE_URL es obligatorio');
  });

  it('rejects a database and schema without an explicit demo marker', () => {
    expect(() =>
      resolveDemoSeedConfig(
        validEnvironment({
          DEMO_SEED_DATABASE_URL:
            'postgresql://app:secret@db.internal/politica?schema=public',
        }),
      ),
    ).toThrow('debe incluir el segmento "demo"');
  });

  it('accepts an explicitly demo-named schema and returns it to the adapter', () => {
    const config = resolveDemoSeedConfig(
      validEnvironment({
        NODE_ENV: 'test',
        DEMO_SEED_DATABASE_URL:
          'postgresql://app:secret@localhost/politica?schema=politica_demo',
      }),
    );

    expect(config).toEqual({
      connectionString:
        'postgresql://app:secret@localhost/politica?schema=politica_demo',
      databaseSchema: 'politica_demo',
      userPassword: secureDemoPassword,
    });
  });

  it('rejects short credentials instead of supplying a built-in password', () => {
    expect(() =>
      resolveDemoSeedConfig(
        validEnvironment({ DEMO_SEED_USER_PASSWORD: 'DemoSegura2026!' }),
      ),
    ).toThrow('debe tener al menos 20 bytes');
  });

  it('can require the local seed password variable without a fallback', () => {
    const environment = validEnvironment({
      DEMO_SEED_USER_PASSWORD: undefined,
      SEED_ADMIN_PASSWORD: secureDemoPassword,
    });

    expect(
      resolveDemoSeedConfig(environment, 'SEED_ADMIN_PASSWORD').userPassword,
    ).toBe(secureDemoPassword);
  });
});

describe('prepareDemoIdentity', () => {
  it.each([
    {
      type: TenantType.GSC,
      defaultMode: PoliticalOperationMode.CAMPAIGN,
    },
    {
      type: TenantType.CANDIDACY,
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    },
  ])(
    'refuses a reserved tenant with an unexpected type or mode',
    async (shape) => {
      const { prisma, userCreate } = identityPrismaMock({
        tenant: { id: 'demo-tenant', name: 'Wrong tenant', ...shape },
      });

      await expect(
        prepareDemoIdentity(prisma as never, 'new-password-hash'),
      ).rejects.toThrow('tipo o modo inesperado');
      expect(userCreate).not.toHaveBeenCalled();
    },
  );

  it('aborts before writes when a reserved email belongs to another tenant', async () => {
    const { prisma, userCreate } = identityPrismaMock({
      users: [
        {
          id: 'foreign-id',
          email: 'demo@politicasostenible.co',
          tenantId: 'foreign-tenant',
          role: Role.ADMIN,
        },
      ],
    });

    await expect(
      prepareDemoIdentity(prisma as never, 'new-password-hash'),
    ).rejects.toThrow('ya pertenece a otro tenant');
    expect(prisma.tenant.create).not.toHaveBeenCalled();
    expect(userCreate).not.toHaveBeenCalled();
  });

  it('aborts if a reserved email exists before the demo tenant exists', async () => {
    const { prisma, userCreate } = identityPrismaMock({
      tenant: null,
      users: [
        {
          id: 'orphan-collision',
          email: 'andrea@demo.co',
          tenantId: 'some-tenant',
          role: Role.ZONE_COORDINATOR,
        },
      ],
    });

    await expect(
      prepareDemoIdentity(prisma as never, 'new-password-hash'),
    ).rejects.toThrow('ya pertenece a otro tenant');
    expect(prisma.tenant.create).not.toHaveBeenCalled();
    expect(userCreate).not.toHaveBeenCalled();
  });

  it('refuses to overwrite a changed role', async () => {
    const users = demoUsers('demo-tenant');
    users[0] = { ...users[0], role: Role.VOLUNTEER };
    const { prisma, userCreate, forbiddenUserUpdate } = identityPrismaMock({
      users,
    });

    await expect(
      prepareDemoIdentity(prisma as never, 'new-password-hash'),
    ).rejects.toThrow('no sobrescribe roles ni credenciales');
    expect(userCreate).not.toHaveBeenCalled();
    expect(forbiddenUserUpdate).not.toHaveBeenCalled();
  });

  it('reuses same-tenant accounts without changing tenant, role, or password', async () => {
    const { prisma, userCreate, forbiddenUserUpdate } = identityPrismaMock({
      users: demoUsers('demo-tenant'),
    });

    const result = await prepareDemoIdentity(
      prisma as never,
      'new-password-hash',
    );

    expect(result.adminUser).toEqual({
      id: 'admin-id',
      email: 'demo@politicasostenible.co',
    });
    expect(result.teamUsers).toEqual([
      { id: 'andrea-id' },
      { id: 'miguel-id' },
      { id: 'sofia-id' },
      { id: 'diego-id' },
    ]);
    expect(userCreate).not.toHaveBeenCalled();
    expect(forbiddenUserUpdate).not.toHaveBeenCalled();
  });

  it('creates only missing accounts with the supplied hash in the demo tenant', async () => {
    const { prisma, userCreate, forbiddenUserUpdate } = identityPrismaMock({
      tenant: null,
      users: [],
    });

    const result = await prepareDemoIdentity(
      prisma as never,
      'environment-password-hash',
    );

    expect(prisma.tenant.create).toHaveBeenCalledTimes(1);
    expect(userCreate).toHaveBeenCalledTimes(5);
    for (const [call] of userCreate.mock.calls) {
      expect(call.data).toEqual(
        expect.objectContaining({
          password: 'environment-password-hash',
          tenantId: 'created-demo-tenant',
        }),
      );
    }
    expect(result.adminUser.id).toBe('created-demo@politicasostenible.co');
    expect(forbiddenUserUpdate).not.toHaveBeenCalled();
  });
});

describe('seedDemo', () => {
  it('does not start destructive cleanup when identity validation fails', async () => {
    const identity = identityPrismaMock({
      users: [
        {
          id: 'foreign-id',
          email: 'demo@politicasostenible.co',
          tenantId: 'foreign-tenant',
          role: Role.ADMIN,
        },
      ],
    });
    const financialEntryDelete = jest.fn();
    const prisma = {
      $transaction: jest.fn(
        (callback: (transaction: unknown) => Promise<unknown>) =>
          callback(identity.prisma),
      ),
      financialEntry: { deleteMany: financialEntryDelete },
    } as unknown as PrismaClient;

    await expect(
      seedDemo(prisma, {
        connectionString:
          'postgresql://demo:secret@localhost:5432/politica_demo',
        userPassword: secureDemoPassword,
      }),
    ).rejects.toThrow('ya pertenece a otro tenant');

    expect(financialEntryDelete).not.toHaveBeenCalled();
  });
});
