import type { ExecutionContext } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequest } from '../interfaces/authenticated-user.interface';
import {
  isConfiguredSaasAdminUserId,
  loadSaasAdminIdentityConfig,
  SaasAdminConfigurationError,
  SaasAdminGuard,
  type SaasAdminIdentityConfig,
} from './saas-admin.guard';

const ADMIN_USER_ID = `c${'1'.repeat(24)}`;
const SECOND_ADMIN_USER_ID = '22222222-2222-4222-8222-222222222222';
const MEMBER_USER_ID = `c${'3'.repeat(24)}`;

function contextFor(
  user?: Partial<AuthenticatedRequest['user']>,
): ExecutionContext {
  const request = {
    user: user
      ? {
          userId: user.userId ?? ADMIN_USER_ID,
          tenantId: user.tenantId ?? 'tenant-a',
          email: user.email,
        }
      : undefined,
  } as unknown as AuthenticatedRequest;

  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function identityConfig(...userIds: string[]): SaasAdminIdentityConfig {
  return { userIds };
}

function buildPrisma(
  currentUser: {
    id: string;
    isActive: boolean;
    totpSecret: string | null;
    totpEnabledAt: Date | null;
  } | null,
) {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(currentUser),
    },
  };
}

describe('loadSaasAdminIdentityConfig', () => {
  it('acepta CUID actual y UUID futuro explícitos, y los normaliza', () => {
    expect(
      loadSaasAdminIdentityConfig({
        SAAS_ADMIN_USER_IDS: ` ${ADMIN_USER_ID},${SECOND_ADMIN_USER_ID.toUpperCase()} `,
      }),
    ).toEqual({
      userIds: [ADMIN_USER_ID, SECOND_ADMIN_USER_ID],
    });
  });

  it.each<[string, string]>([
    ['', 'lista ausente'],
    ['not-an-immutable-id', 'identificador no canónico'],
    [`${ADMIN_USER_ID},`, 'entrada vacía'],
    [`${ADMIN_USER_ID},${ADMIN_USER_ID.toUpperCase()}`, 'duplicado'],
  ])('rechaza %s como %s', (configuredIds) => {
    expect(() =>
      loadSaasAdminIdentityConfig({
        SAAS_ADMIN_USER_IDS: configuredIds,
      }),
    ).toThrow(SaasAdminConfigurationError);
  });

  it('rechaza la allowlist heredada por correo incluso junto a IDs válidos', () => {
    expect(() =>
      loadSaasAdminIdentityConfig({
        SAAS_ADMIN_USER_IDS: ADMIN_USER_ID,
        SAAS_ADMIN_EMAILS: 'owner@example.test',
      }),
    ).toThrow(SaasAdminConfigurationError);
  });

  it('rechaza allowlists desproporcionadas', () => {
    const userIds = Array.from(
      { length: 33 },
      (_, index) => `c${index.toString(36).padStart(24, '0')}`,
    );

    expect(() =>
      loadSaasAdminIdentityConfig({
        SAAS_ADMIN_USER_IDS: userIds.join(','),
      }),
    ).toThrow(SaasAdminConfigurationError);
  });
});

describe('isConfiguredSaasAdminUserId', () => {
  it('solo reconoce IDs inmutables canónicos presentes en la allowlist', () => {
    const config = identityConfig(ADMIN_USER_ID, SECOND_ADMIN_USER_ID);

    expect(isConfiguredSaasAdminUserId(ADMIN_USER_ID, config)).toBe(true);
    expect(
      isConfiguredSaasAdminUserId(SECOND_ADMIN_USER_ID.toUpperCase(), config),
    ).toBe(true);
    expect(isConfiguredSaasAdminUserId(MEMBER_USER_ID, config)).toBe(false);
    expect(isConfiguredSaasAdminUserId('owner@example.test', config)).toBe(
      false,
    );
    expect(isConfiguredSaasAdminUserId(undefined, config)).toBe(false);
  });
});

describe('SaasAdminGuard', () => {
  it('autoriza un ID allowlisted únicamente si el usuario actual sigue activo en su tenant', async () => {
    const prisma = buildPrisma({
      id: ADMIN_USER_ID,
      isActive: true,
      totpSecret: 'totp:v1:test:key:ciphertext',
      totpEnabledAt: new Date('2026-09-07T12:00:00.000Z'),
    });
    const guard = new SaasAdminGuard(
      prisma as unknown as PrismaService,
      identityConfig(ADMIN_USER_ID),
    );

    await expect(
      guard.canActivate(
        contextFor({
          userId: ADMIN_USER_ID,
          tenantId: 'tenant-a',
          email: 'changed-address@example.test',
        }),
      ),
    ).resolves.toBe(true);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: ADMIN_USER_ID, tenantId: 'tenant-a' },
      select: {
        id: true,
        isActive: true,
        totpSecret: true,
        totpEnabledAt: true,
      },
    });
  });

  it('no permite apropiarse del privilegio registrando un correo antes allowlisted', async () => {
    const prisma = buildPrisma({
      id: MEMBER_USER_ID,
      isActive: true,
      totpSecret: 'totp:v1:test:key:ciphertext',
      totpEnabledAt: new Date('2026-09-07T12:00:00.000Z'),
    });
    const guard = new SaasAdminGuard(
      prisma as unknown as PrismaService,
      identityConfig(ADMIN_USER_ID),
    );

    await expect(
      guard.canActivate(
        contextFor({
          userId: MEMBER_USER_ID,
          email: 'owner@example.test',
        }),
      ),
    ).resolves.toBe(false);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it.each<[Parameters<typeof buildPrisma>[0], string]>([
    [
      {
        id: ADMIN_USER_ID,
        isActive: false,
        totpSecret: 'totp:v1:test:key:ciphertext',
        totpEnabledAt: new Date('2026-09-07T12:00:00.000Z'),
      },
      'usuario inactivo',
    ],
    [null, 'usuario ausente o perteneciente a otro tenant'],
  ])('falla cerrado para %s: %s', async (currentUser) => {
    const prisma = buildPrisma(currentUser);
    const guard = new SaasAdminGuard(
      prisma as unknown as PrismaService,
      identityConfig(ADMIN_USER_ID),
    );

    await expect(
      guard.canActivate(
        contextFor({ userId: ADMIN_USER_ID, tenantId: 'tenant-a' }),
      ),
    ).resolves.toBe(false);
  });

  it.each<[string | null, Date | null, string]>([
    [null, null, 'MFA no configurado'],
    ['totp:v1:test:key:ciphertext', null, 'activacion incompleta'],
    [null, new Date('2026-09-07T12:00:00.000Z'), 'secreto ausente'],
  ])('falla cerrado con %s/%s: %s', async (totpSecret, totpEnabledAt) => {
    const prisma = buildPrisma({
      id: ADMIN_USER_ID,
      isActive: true,
      totpSecret,
      totpEnabledAt,
    });
    const guard = new SaasAdminGuard(
      prisma as unknown as PrismaService,
      identityConfig(ADMIN_USER_ID),
    );

    await expect(
      guard.canActivate(
        contextFor({ userId: ADMIN_USER_ID, tenantId: 'tenant-a' }),
      ),
    ).resolves.toBe(false);
  });

  it('falla cerrado sin identidad autenticada y ante errores de base de datos', async () => {
    const prisma = buildPrisma(null);
    const guard = new SaasAdminGuard(
      prisma as unknown as PrismaService,
      identityConfig(ADMIN_USER_ID),
    );

    await expect(guard.canActivate(contextFor())).resolves.toBe(false);
    prisma.user.findUnique.mockRejectedValueOnce(new Error('database down'));
    await expect(
      guard.canActivate(contextFor({ userId: ADMIN_USER_ID })),
    ).rejects.toThrow('database down');
  });
});
