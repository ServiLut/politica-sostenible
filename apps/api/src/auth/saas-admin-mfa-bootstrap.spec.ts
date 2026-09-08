import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as bcrypt from 'bcrypt';
import { generateSecret, verifySync } from 'otplib';
import { PoliticalOperationMode } from '../../prisma/generated/prisma';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthController } from './auth.controller';
import { MfaSecretCipher } from './mfa-secret-cipher';
import { MfaService } from './mfa.service';
import { PlanLimitsGuard, PlanLimitsService } from './guards/plan-limits.guard';
import { SaasAdminGuard } from './guards/saas-admin.guard';

jest.mock('otplib', () => ({
  generateSecret: jest.fn(() => 'JBSWY3DPEHPK3PXP'),
  generateURI: jest.fn(() => 'otpauth://totp/test-fixture'),
  verifySync: jest.fn(() => ({
    valid: true,
    delta: 0,
    epoch: 1_800_000_000,
    timeStep: 60_000_000,
  })),
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn(() => Promise.resolve('data:image/png;base64,qr')),
}));

jest.mock('bcrypt', () => ({
  compare: jest.fn(() => Promise.resolve(true)),
}));

const ADMIN_USER_ID = `c${'1'.repeat(24)}`;
const TENANT_ID = 'legacy-tenant-without-subscription';

interface UserState {
  id: string;
  tenantId: string;
  email: string;
  password: string;
  isActive: boolean;
  totpSecret: string | null;
  totpEnabledAt: Date | null;
  lastTotpTimeStep: number | null;
  authVersion: number;
  tenant: { defaultMode: PoliticalOperationMode };
}

function contextFor(
  handler: AuthController['setupMfa'] | AuthController['verifyMfa'],
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => AuthController,
    switchToHttp: () => ({
      getRequest: () => ({
        user: { userId: ADMIN_USER_ID, tenantId: TENANT_ID },
      }),
    }),
  } as unknown as ExecutionContext;
}

function matchesSecurityState(
  state: UserState,
  where: Record<string, unknown>,
): boolean {
  if (where.id !== state.id || where.tenantId !== state.tenantId) return false;
  if ('isActive' in where && where.isActive !== state.isActive) return false;
  if ('password' in where && where.password !== state.password) return false;
  if ('totpSecret' in where && where.totpSecret !== state.totpSecret) {
    return false;
  }
  if ('totpEnabledAt' in where && where.totpEnabledAt !== state.totpEnabledAt) {
    return false;
  }

  if (Array.isArray(where.OR)) {
    const allowsNull = where.OR.some(
      (condition) =>
        typeof condition === 'object' &&
        condition !== null &&
        'lastTotpTimeStep' in condition &&
        condition.lastTotpTimeStep === null &&
        state.lastTotpTimeStep === null,
    );
    const allowsEarlier = where.OR.some((condition) => {
      if (
        typeof condition !== 'object' ||
        condition === null ||
        !('lastTotpTimeStep' in condition) ||
        typeof condition.lastTotpTimeStep !== 'object' ||
        condition.lastTotpTimeStep === null ||
        !('lt' in condition.lastTotpTimeStep)
      ) {
        return false;
      }
      const limit = condition.lastTotpTimeStep.lt;
      return (
        typeof limit === 'number' &&
        typeof state.lastTotpTimeStep === 'number' &&
        state.lastTotpTimeStep < limit
      );
    });
    if (!allowsNull && !allowsEarlier) return false;
  }

  return true;
}

describe('SaaS administrator MFA bootstrap', () => {
  beforeEach(() => {
    jest.mocked(generateSecret).mockReturnValue('JBSWY3DPEHPK3PXP');
    jest.mocked(verifySync).mockReturnValue({
      valid: true,
      delta: 0,
      epoch: 1_800_000_000,
      timeStep: 60_000_000,
    });
    jest.mocked(bcrypt.compare).mockResolvedValue(true as never);
  });

  it('permite enrolar al ID allowlisted sin suscripción y solo entonces concede acceso SaaS', async () => {
    const state: UserState = {
      id: ADMIN_USER_ID,
      tenantId: TENANT_ID,
      email: 'saas-admin@example.test',
      password: 'stored-password-hash',
      isActive: true,
      totpSecret: null,
      totpEnabledAt: null,
      lastTotpTimeStep: null,
      authVersion: 0,
      tenant: { defaultMode: PoliticalOperationMode.CAMPAIGN },
    };
    const auditCreate = jest.fn().mockResolvedValue({ id: 'audit-event' });
    const transactionClient = {
      user: {
        findUnique: jest.fn(() => Promise.resolve({ ...state })),
        updateMany: jest.fn(
          ({ where, data }: Record<string, Record<string, unknown>>) => {
            if (!matchesSecurityState(state, where)) {
              return Promise.resolve({ count: 0 });
            }

            if ('totpSecret' in data) {
              state.totpSecret = data.totpSecret as string | null;
            }
            if ('totpEnabledAt' in data) {
              state.totpEnabledAt = data.totpEnabledAt as Date | null;
            }
            if ('lastTotpTimeStep' in data) {
              state.lastTotpTimeStep = data.lastTotpTimeStep as number | null;
            }
            if (
              typeof data.authVersion === 'object' &&
              data.authVersion !== null &&
              'increment' in data.authVersion
            ) {
              state.authVersion += data.authVersion.increment as number;
            }
            return Promise.resolve({ count: 1 });
          },
        ),
      },
      auditEvent: { create: auditCreate },
    };
    const prisma = {
      ...transactionClient,
      $transaction: jest.fn(
        async (
          callback: (client: typeof transactionClient) => Promise<unknown>,
        ) => callback(transactionClient),
      ),
    };
    const identityConfig = { userIds: [ADMIN_USER_ID] };
    const planLimits = {
      assertFeature: jest
        .fn()
        .mockRejectedValue(
          new ForbiddenException('El tenant no tiene suscripción con MFA.'),
        ),
    };
    const planGuard = new PlanLimitsGuard(
      new Reflector(),
      planLimits as unknown as PlanLimitsService,
      identityConfig,
    );
    const saasAdminGuard = new SaasAdminGuard(
      prisma as unknown as PrismaService,
      identityConfig,
    );
    const mfaService = new MfaService(
      prisma as unknown as PrismaService,
      new MfaSecretCipher({
        activeKeyId: 'bootstrap-test',
        activeKey: Buffer.alloc(32, 7),
        legacyPlaintextMode: 'reject',
      }),
    );

    const setupContext = contextFor(AuthController.prototype.setupMfa);
    const verifyContext = contextFor(AuthController.prototype.verifyMfa);

    await expect(saasAdminGuard.canActivate(setupContext)).resolves.toBe(false);
    await expect(planGuard.canActivate(setupContext)).resolves.toBe(true);

    await expect(
      mfaService.generateSecret(
        ADMIN_USER_ID,
        TENANT_ID,
        'correct-current-password',
      ),
    ).resolves.toEqual({
      qrCodeDataUrl: 'data:image/png;base64,qr',
      secret: 'JBSWY3DPEHPK3PXP',
    });
    expect(state.totpSecret).toMatch(/^totp:v1:bootstrap-test:/u);
    expect(state.totpEnabledAt).toBeNull();

    await expect(planGuard.canActivate(verifyContext)).resolves.toBe(true);
    await expect(
      mfaService.verifyAndEnable(ADMIN_USER_ID, TENANT_ID, '123456'),
    ).resolves.toEqual({ enabled: true });

    expect(state.totpEnabledAt).toBeInstanceOf(Date);
    expect(state.lastTotpTimeStep).toBe(60_000_000);
    expect(state.authVersion).toBe(1);
    await expect(saasAdminGuard.canActivate(verifyContext)).resolves.toBe(true);

    expect(planLimits.assertFeature).not.toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'MFA_SETUP_INITIATED' }),
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'MFA_ENABLED' }),
    });
    for (const call of transactionClient.user.findUnique.mock.calls) {
      expect(call[0]).toEqual(
        expect.objectContaining({
          where: { id: ADMIN_USER_ID, tenantId: TENANT_ID },
        }),
      );
    }
  });
});
