import {
  PoliticalOperationMode,
  PrismaClient,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import {
  prepareLocalSeedIdentity,
  seedLocalDevelopment,
} from '../../prisma/seed';

function localSeedPrismaMock(options?: {
  tenant?: {
    id: string;
    type: TenantType;
    defaultMode: PoliticalOperationMode;
  } | null;
  user?: {
    id: string;
    email: string;
    tenantId: string;
    role: Role;
    isActive: boolean;
  } | null;
}) {
  const tenant =
    options?.tenant === undefined
      ? {
          id: 'local-tenant',
          type: TenantType.GSC,
          defaultMode: PoliticalOperationMode.CAMPAIGN,
        }
      : options.tenant;
  const user = options?.user ?? null;
  const forbiddenUserMutation = jest.fn();
  const userCreate = jest.fn(({ data }: { data: { email: string } }) =>
    Promise.resolve({ email: data.email }),
  );
  const prisma = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue(tenant),
      create: jest.fn().mockResolvedValue({ id: 'created-local-tenant' }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      create: userCreate,
      update: forbiddenUserMutation,
      upsert: forbiddenUserMutation,
      updateMany: forbiddenUserMutation,
      deleteMany: forbiddenUserMutation,
    },
  };

  return { prisma, forbiddenUserMutation, userCreate };
}

const identityOptions = {
  email: 'admin@politica-sostenible.test',
  documentId: 'DEV-ADMIN',
  passwordHash: 'environment-password-hash',
};

describe('prepareLocalSeedIdentity', () => {
  it.each([
    {
      type: TenantType.CANDIDACY,
      defaultMode: PoliticalOperationMode.CAMPAIGN,
    },
    {
      type: TenantType.GSC,
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    },
  ])('refuses an unexpected reserved tenant shape', async (shape) => {
    const { prisma, userCreate } = localSeedPrismaMock({
      tenant: { id: 'local-tenant', ...shape },
    });

    await expect(
      prepareLocalSeedIdentity(prisma as never, identityOptions),
    ).rejects.toThrow('tipo o modo inesperado');
    expect(userCreate).not.toHaveBeenCalled();
  });

  it('aborts before writes when the configured email belongs to another tenant', async () => {
    const { prisma, userCreate, forbiddenUserMutation } = localSeedPrismaMock({
      user: {
        id: 'foreign-user',
        email: identityOptions.email,
        tenantId: 'foreign-tenant',
        role: Role.ADMIN,
        isActive: true,
      },
    });

    await expect(
      prepareLocalSeedIdentity(prisma as never, identityOptions),
    ).rejects.toThrow('ya pertenece a otro tenant');
    expect(prisma.tenant.create).not.toHaveBeenCalled();
    expect(userCreate).not.toHaveBeenCalled();
    expect(forbiddenUserMutation).not.toHaveBeenCalled();
  });

  it('aborts if the email exists before the reserved tenant exists', async () => {
    const { prisma, userCreate } = localSeedPrismaMock({
      tenant: null,
      user: {
        id: 'collision',
        email: identityOptions.email,
        tenantId: 'some-tenant',
        role: Role.ADMIN,
        isActive: true,
      },
    });

    await expect(
      prepareLocalSeedIdentity(prisma as never, identityOptions),
    ).rejects.toThrow('ya pertenece a otro tenant');
    expect(prisma.tenant.create).not.toHaveBeenCalled();
    expect(userCreate).not.toHaveBeenCalled();
  });

  it.each([
    { role: Role.VOLUNTEER, isActive: true },
    { role: Role.ADMIN, isActive: false },
  ])('does not overwrite a mismatched local identity', async (identity) => {
    const { prisma, userCreate, forbiddenUserMutation } = localSeedPrismaMock({
      user: {
        id: 'existing-user',
        email: identityOptions.email,
        tenantId: 'local-tenant',
        ...identity,
      },
    });

    await expect(
      prepareLocalSeedIdentity(prisma as never, identityOptions),
    ).rejects.toThrow('no sobrescribe rol ni estado');
    expect(userCreate).not.toHaveBeenCalled();
    expect(forbiddenUserMutation).not.toHaveBeenCalled();
  });

  it('preserves an existing same-tenant admin without changing its password', async () => {
    const { prisma, userCreate, forbiddenUserMutation } = localSeedPrismaMock({
      user: {
        id: 'existing-admin',
        email: identityOptions.email,
        tenantId: 'local-tenant',
        role: Role.ADMIN,
        isActive: true,
      },
    });

    await expect(
      prepareLocalSeedIdentity(prisma as never, identityOptions),
    ).resolves.toEqual({ email: identityOptions.email, wasCreated: false });
    expect(userCreate).not.toHaveBeenCalled();
    expect(forbiddenUserMutation).not.toHaveBeenCalled();
  });

  it('creates a missing admin with the explicitly supplied hash', async () => {
    const { prisma, userCreate, forbiddenUserMutation } = localSeedPrismaMock({
      tenant: null,
      user: null,
    });

    await expect(
      prepareLocalSeedIdentity(prisma as never, identityOptions),
    ).resolves.toEqual({ email: identityOptions.email, wasCreated: true });
    expect(prisma.tenant.create).toHaveBeenCalledTimes(1);
    expect(userCreate).toHaveBeenCalledWith({
      data: {
        email: identityOptions.email,
        password: identityOptions.passwordHash,
        name: 'Administración local',
        role: Role.ADMIN,
        documentId: identityOptions.documentId,
        tenantId: 'created-local-tenant',
      },
      select: { email: true },
    });
    expect(forbiddenUserMutation).not.toHaveBeenCalled();
  });
});

describe('seedLocalDevelopment', () => {
  it('performs identity preparation through a serializable transaction', async () => {
    const identity = localSeedPrismaMock({ user: null });
    const transaction = jest.fn(
      (callback: (client: unknown) => Promise<unknown>) =>
        callback(identity.prisma),
    );
    const prisma = { $transaction: transaction } as unknown as PrismaClient;
    const consoleLog = jest.spyOn(console, 'log').mockImplementation();

    try {
      await seedLocalDevelopment(
        prisma,
        {
          connectionString: 'postgresql://demo:secret@localhost/politica_demo',
          userPassword: 'demo-only password with 30 bytes',
        },
        { SEED_ADMIN_EMAIL: identityOptions.email },
      );
    } finally {
      consoleLog.mockRestore();
    }

    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
      maxWait: 10_000,
      timeout: 30_000,
    });
  });
});
