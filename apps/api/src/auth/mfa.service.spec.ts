import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { generateSecret, verifySync } from 'otplib';
import * as bcrypt from 'bcrypt';
import { PoliticalOperationMode } from '../../prisma/generated/prisma';
import type { PrismaService } from '../prisma/prisma.service';
import { MfaSecretCipher } from './mfa-secret-cipher';
import { MfaService } from './mfa.service';

jest.mock('otplib', () => ({
  generateSecret: jest.fn(),
  generateURI: jest.fn(() => 'otpauth://totp/test-fixture'),
  verifySync: jest.fn(() => ({
    valid: true,
    delta: 0,
    epoch: 1_800_000_000,
    timeStep: 60_000_000,
  })),
}));

const generateOtpSecret = generateSecret as jest.MockedFunction<
  typeof generateSecret
>;
const verifyOtp = verifySync as jest.MockedFunction<typeof verifySync>;

jest.mock('qrcode', () => ({
  toDataURL: jest.fn(() => Promise.resolve('data:image/png;base64,qr')),
}));

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

const tenantMode = PoliticalOperationMode.CAMPAIGN;
const secretContext = { tenantId: 'tenant-a', userId: 'user-a' };
const verifiedTimeStep = 60_000_000;
const validTotpResult = {
  valid: true as const,
  delta: 0,
  epoch: 1_800_000_000,
  timeStep: verifiedTimeStep,
};

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function randomSecret(): string {
  return randomBytes(24).toString('base64url');
}

function buildCipher(legacyPlaintextMode: 'migrate' | 'reject' = 'migrate') {
  return new MfaSecretCipher({
    activeKeyId: 'test-current',
    activeKey: Buffer.alloc(32, 7),
    legacyPlaintextMode,
  });
}

function encryptedSecret(cipher = buildCipher()): string {
  return cipher.encrypt(randomSecret(), secretContext);
}

function buildPrisma(user: Record<string, unknown>) {
  const transactionClient = {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue({ id: 'user-a' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    auditEvent: {
      create: jest.fn().mockResolvedValue({ id: 'audit-a' }),
    },
  };
  return {
    ...transactionClient,
    $transaction: jest.fn(
      async (
        callback: (client: typeof transactionClient) => Promise<unknown>,
      ) => callback(transactionClient),
    ),
  };
}

function buildService(
  prisma: ReturnType<typeof buildPrisma>,
  cipher = buildCipher(),
) {
  return new MfaService(prisma as unknown as PrismaService, cipher);
}

describe('MfaService enrollment lifecycle', () => {
  let generatedSecret: string;

  beforeEach(() => {
    generatedSecret = randomSecret();
    generateOtpSecret.mockReset();
    generateOtpSecret.mockReturnValue(generatedSecret);
    verifyOtp.mockReset();
    verifyOtp.mockReturnValue(validTotpResult);
    jest.mocked(bcrypt.compare).mockReset();
    jest.mocked(bcrypt.compare).mockResolvedValue(true as never);
  });

  it('rota un enrolamiento abandonado y persiste únicamente el cifrado autenticado', async () => {
    const cipher = buildCipher();
    const prisma = buildPrisma({
      email: 'admin@example.test',
      password: 'stored-password-hash',
      totpSecret: encryptedSecret(cipher),
      totpEnabledAt: null,
      tenant: { defaultMode: tenantMode },
    });
    const service = buildService(prisma, cipher);

    const result = await service.generateSecret(
      'user-a',
      'tenant-a',
      'current-password',
    );
    const storedSecret = prisma.user.updateMany.mock.calls[0]?.[0]?.data
      .totpSecret as string;

    expect(result.qrCodeDataUrl).toBe('data:image/png;base64,qr');
    expect(digest(result.secret)).toBe(digest(generatedSecret));
    expect(storedSecret).toMatch(/^totp:v1:test-current:/u);
    expect(digest(cipher.decrypt(storedSecret, secretContext).secret)).toBe(
      digest(generatedSecret),
    );
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-a', tenantId: 'tenant-a' },
      }),
    );
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'user-a',
        tenantId: 'tenant-a',
        isActive: true,
        password: 'stored-password-hash',
        totpSecret: expect.any(String),
        totpEnabledAt: null,
      },
      data: {
        totpSecret: expect.stringMatching(/^totp:v1:test-current:/u),
        lastTotpTimeStep: null,
      },
    });
  });

  it('no rota el secreto de un segundo factor habilitado', async () => {
    const prisma = buildPrisma({
      email: 'admin@example.test',
      password: 'stored-password-hash',
      totpSecret: encryptedSecret(),
      totpEnabledAt: new Date('2026-09-07T12:00:00.000Z'),
      tenant: { defaultMode: tenantMode },
    });
    const service = buildService(prisma);

    await expect(
      service.generateSecret('user-a', 'tenant-a', 'current-password'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('no entrega un secreto MFA sin reautenticar la contraseña actual', async () => {
    const prisma = buildPrisma({
      email: 'admin@example.test',
      password: 'stored-password-hash',
      totpSecret: null,
      totpEnabledAt: null,
      tenant: { defaultMode: tenantMode },
    });
    const service = buildService(prisma);
    jest.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(
      service.generateSecret('user-a', 'tenant-a', 'wrong-password'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(generateOtpSecret).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'MFA_SETUP_REAUTHENTICATION_FAILED',
        metadata: { reason: 'INVALID_CURRENT_PASSWORD' },
      }),
    });
  });

  it('comprueba código y estado dentro del tenant autenticado cuando MFA está deshabilitado', async () => {
    const prisma = buildPrisma({
      totpSecret: null,
      totpEnabledAt: null,
      tenantId: 'tenant-a',
      tenant: { defaultMode: tenantMode },
    });
    const service = buildService(prisma);

    await expect(
      service.verifyCode('user-a', 'tenant-a', '123456'),
    ).resolves.toBe(true);
    await expect(service.hasMfaEnabled('user-a', 'tenant-a')).resolves.toBe(
      false,
    );

    expect(prisma.user.findUnique).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'user-a', tenantId: 'tenant-a' },
      }),
    );
    expect(prisma.user.findUnique).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: 'user-a', tenantId: 'tenant-a' },
        select: expect.objectContaining({
          totpSecret: true,
          totpEnabledAt: true,
        }),
      }),
    );
  });

  it('rechaza el resultado inválido de otplib durante el login', async () => {
    const cipher = buildCipher();
    const prisma = buildPrisma({
      totpSecret: encryptedSecret(cipher),
      totpEnabledAt: new Date('2026-09-07T12:00:00.000Z'),
      tenantId: 'tenant-a',
      tenant: { defaultMode: tenantMode },
    });
    const service = buildService(prisma, cipher);
    verifyOtp.mockReturnValue({ valid: false });

    await expect(
      service.verifyCode('user-a', 'tenant-a', '000000'),
    ).resolves.toBe(false);

    expect(prisma.auditEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('verifica operaciones sensibles sólo con MFA habilitado, usuario activo y secreto descifrado', async () => {
    const cipher = buildCipher();
    const plaintextSecret = randomSecret();
    const storedSecret = cipher.encrypt(plaintextSecret, secretContext);
    const enabledAt = new Date('2026-09-07T12:00:00.000Z');
    const prisma = buildPrisma({
      isActive: true,
      totpSecret: storedSecret,
      totpEnabledAt: enabledAt,
      lastTotpTimeStep: verifiedTimeStep - 1,
      tenantId: 'tenant-a',
      tenant: { defaultMode: tenantMode },
    });
    const service = buildService(prisma, cipher);

    await expect(
      service.verifyEnabledCode('user-a', 'tenant-a', '123456'),
    ).resolves.toBe(true);

    expect(digest(verifyOtp.mock.calls[0]?.[0]?.secret)).toBe(
      digest(plaintextSecret),
    );
    expect(verifyOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        strategy: 'totp',
        token: '123456',
        afterTimeStep: verifiedTimeStep - 1,
      }),
    );
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'user-a',
        tenantId: 'tenant-a',
        isActive: true,
        totpSecret: storedSecret,
        totpEnabledAt: enabledAt,
        OR: [
          { lastTotpTimeStep: null },
          { lastTotpTimeStep: { lt: verifiedTimeStep } },
        ],
      },
      data: { lastTotpTimeStep: verifiedTimeStep },
    });
  });

  it('no omite MFA en una operación sensible cuando el enrolamiento no está habilitado', async () => {
    const prisma = buildPrisma({
      isActive: true,
      totpSecret: null,
      totpEnabledAt: null,
      tenantId: 'tenant-a',
      tenant: { defaultMode: tenantMode },
    });
    const service = buildService(prisma);

    await expect(
      service.verifyEnabledCode('user-a', 'tenant-a', '123456'),
    ).resolves.toBe(false);
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('no habilita MFA cuando otplib devuelve un resultado inválido', async () => {
    const cipher = buildCipher();
    const prisma = buildPrisma({
      totpSecret: encryptedSecret(cipher),
      totpEnabledAt: null,
      tenant: { defaultMode: tenantMode },
    });
    const service = buildService(prisma, cipher);
    verifyOtp.mockReturnValue({ valid: false });

    await expect(
      service.verifyAndEnable('user-a', 'tenant-a', '000000'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.auditEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('habilita MFA únicamente después de verificar el secreto descifrado', async () => {
    const cipher = buildCipher();
    const plaintextSecret = randomSecret();
    const storedSecret = cipher.encrypt(plaintextSecret, secretContext);
    const prisma = buildPrisma({
      totpSecret: storedSecret,
      totpEnabledAt: null,
      lastTotpTimeStep: null,
      tenant: { defaultMode: tenantMode },
    });
    const service = buildService(prisma, cipher);

    await expect(
      service.verifyAndEnable('user-a', 'tenant-a', '123456'),
    ).resolves.toEqual({ enabled: true });

    const verifiedSecret = verifyOtp.mock.calls[0]?.[0]?.secret;
    expect(digest(verifiedSecret)).toBe(digest(plaintextSecret));
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'user-a',
        tenantId: 'tenant-a',
        isActive: true,
        totpSecret: storedSecret,
        totpEnabledAt: null,
        OR: [
          { lastTotpTimeStep: null },
          { lastTotpTimeStep: { lt: verifiedTimeStep } },
        ],
      },
      data: {
        totpEnabledAt: expect.any(Date),
        lastTotpTimeStep: verifiedTimeStep,
        authVersion: { increment: 1 },
      },
    });
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'MFA_ENABLED' }),
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('no deshabilita MFA cuando otplib devuelve un resultado inválido', async () => {
    const cipher = buildCipher();
    const prisma = buildPrisma({
      totpSecret: encryptedSecret(cipher),
      totpEnabledAt: new Date('2026-09-07T12:00:00.000Z'),
      tenant: { defaultMode: tenantMode },
    });
    const service = buildService(prisma, cipher);
    verifyOtp.mockReturnValue({ valid: false });

    await expect(
      service.disable('user-a', 'tenant-a', '000000'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.auditEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('deshabilita MFA y elimina el secreto únicamente con un código válido', async () => {
    const cipher = buildCipher();
    const plaintextSecret = randomSecret();
    const storedSecret = cipher.encrypt(plaintextSecret, secretContext);
    const enabledAt = new Date('2026-09-07T12:00:00.000Z');
    const prisma = buildPrisma({
      totpSecret: storedSecret,
      totpEnabledAt: enabledAt,
      lastTotpTimeStep: verifiedTimeStep - 1,
      tenant: { defaultMode: tenantMode },
    });
    const service = buildService(prisma, cipher);

    await expect(
      service.disable('user-a', 'tenant-a', '123456'),
    ).resolves.toEqual({ disabled: true });

    const verifiedSecret = verifyOtp.mock.calls[0]?.[0]?.secret;
    expect(digest(verifiedSecret)).toBe(digest(plaintextSecret));
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'user-a',
        tenantId: 'tenant-a',
        isActive: true,
        totpSecret: storedSecret,
        totpEnabledAt: enabledAt,
        OR: [
          { lastTotpTimeStep: null },
          { lastTotpTimeStep: { lt: verifiedTimeStep } },
        ],
      },
      data: {
        totpSecret: null,
        totpEnabledAt: null,
        lastTotpTimeStep: null,
        authVersion: { increment: 1 },
      },
    });
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'MFA_DISABLED' }),
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('falla cerrado y audita enabledAt sin secreto durante el login', async () => {
    const prisma = buildPrisma({
      totpSecret: null,
      totpEnabledAt: new Date('2026-09-07T12:00:00.000Z'),
      tenantId: 'tenant-a',
      tenant: { defaultMode: tenantMode },
    });
    const service = buildService(prisma);

    await expect(
      service.verifyCode('user-a', 'tenant-a', '123456'),
    ).resolves.toBe(false);

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        actorUserId: 'user-a',
        action: 'MFA_STATE_INVALID',
        metadata: { reason: 'ENABLED_WITHOUT_SECRET' },
      }),
    });
  });

  it('bloquea configuración y estado ante enabledAt sin secreto', async () => {
    const prisma = buildPrisma({
      email: 'admin@example.test',
      password: 'stored-password-hash',
      totpSecret: null,
      totpEnabledAt: new Date('2026-09-07T12:00:00.000Z'),
      tenant: { defaultMode: tenantMode },
    });
    const service = buildService(prisma);

    await expect(
      service.generateSecret('user-a', 'tenant-a', 'current-password'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      service.hasMfaEnabled('user-a', 'tenant-a'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(prisma.auditEvent.create).toHaveBeenCalledTimes(2);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('bloquea y audita activación y desactivación ante enabledAt sin secreto', async () => {
    const prisma = buildPrisma({
      totpSecret: null,
      totpEnabledAt: new Date('2026-09-07T12:00:00.000Z'),
      tenant: { defaultMode: tenantMode },
    });
    const service = buildService(prisma);

    await expect(
      service.verifyAndEnable('user-a', 'tenant-a', '123456'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      service.disable('user-a', 'tenant-a', '123456'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).toHaveBeenCalledTimes(2);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('rechaza por afterTimeStep la reutilización secuencial sin auditar código ni secreto', async () => {
    const cipher = buildCipher();
    const plaintextSecret = randomSecret();
    const prisma = buildPrisma({
      isActive: true,
      totpSecret: cipher.encrypt(plaintextSecret, secretContext),
      totpEnabledAt: new Date('2026-09-07T12:00:00.000Z'),
      lastTotpTimeStep: verifiedTimeStep,
      tenantId: 'tenant-a',
      tenant: { defaultMode: tenantMode },
    });
    const service = buildService(prisma, cipher);
    verifyOtp.mockReturnValue({ valid: false });

    await expect(
      service.verifyCode('user-a', 'tenant-a', '654321'),
    ).resolves.toBe(false);

    expect(verifyOtp).toHaveBeenCalledWith(
      expect.objectContaining({ afterTimeStep: verifiedTimeStep }),
    );
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'MFA_VERIFICATION_FAILED' }),
    });
    const auditPayload = JSON.stringify(prisma.auditEvent.create.mock.calls);
    expect(auditPayload).not.toContain('654321');
    expect(auditPayload).not.toContain(plaintextSecret);
  });

  it('normaliza una excepción de formato de otplib como verificación fallida', async () => {
    const cipher = buildCipher();
    const prisma = buildPrisma({
      isActive: true,
      totpSecret: encryptedSecret(cipher),
      totpEnabledAt: new Date('2026-09-07T12:00:00.000Z'),
      lastTotpTimeStep: null,
      tenantId: 'tenant-a',
      tenant: { defaultMode: tenantMode },
    });
    const service = buildService(prisma, cipher);
    verifyOtp.mockImplementation(() => {
      const error = new Error('test-only invalid token');
      error.name = 'TokenFormatError';
      throw error;
    });

    await expect(
      service.verifyCode('user-a', 'tenant-a', 'abcdef'),
    ).resolves.toBe(false);

    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'MFA_VERIFICATION_FAILED' }),
    });
    expect(JSON.stringify(prisma.auditEvent.create.mock.calls)).not.toContain(
      'abcdef',
    );
  });

  it('falla con 503 y audita un lastTimeStep incompatible con el reloj sin datos sensibles', async () => {
    const cipher = buildCipher();
    const plaintextSecret = randomSecret();
    const prisma = buildPrisma({
      isActive: true,
      totpSecret: cipher.encrypt(plaintextSecret, secretContext),
      totpEnabledAt: new Date('2026-09-07T12:00:00.000Z'),
      lastTotpTimeStep: verifiedTimeStep + 100,
      tenantId: 'tenant-a',
      tenant: { defaultMode: tenantMode },
    });
    const service = buildService(prisma, cipher);
    verifyOtp.mockImplementation(() => {
      const error = new Error('test-only clock rollback');
      error.name = 'AfterTimeStepRangeExceededError';
      throw error;
    });

    await expect(
      service.verifyEnabledCode('user-a', 'tenant-a', '123456'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'MFA_TOTP_STATE_INVALID',
        metadata: {
          reason: 'LAST_TIME_STEP_INVALID_OR_CLOCK_ROLLBACK',
        },
      }),
    });
    const auditPayload = JSON.stringify(prisma.auditEvent.create.mock.calls);
    expect(auditPayload).not.toContain('123456');
    expect(auditPayload).not.toContain(plaintextSecret);
  });

  it('falla cerrado ante dos consumos concurrentes del mismo timeStep y audita sin secretos', async () => {
    const cipher = buildCipher();
    const plaintextSecret = randomSecret();
    const prisma = buildPrisma({
      isActive: true,
      totpSecret: cipher.encrypt(plaintextSecret, secretContext),
      totpEnabledAt: new Date('2026-09-07T12:00:00.000Z'),
      lastTotpTimeStep: verifiedTimeStep - 1,
      tenantId: 'tenant-a',
      tenant: { defaultMode: tenantMode },
    });
    prisma.user.updateMany.mockResolvedValue({ count: 0 });
    const service = buildService(prisma, cipher);

    await expect(
      service.verifyEnabledCode('user-a', 'tenant-a', '123456'),
    ).resolves.toBe(false);

    expect(prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          OR: [
            { lastTotpTimeStep: null },
            { lastTotpTimeStep: { lt: verifiedTimeStep } },
          ],
        }),
      }),
    );
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'MFA_TOTP_REPLAY_REJECTED',
        metadata: {
          reason: 'TIME_STEP_ALREADY_CONSUMED_OR_SECURITY_STATE_CHANGED',
        },
      }),
    });
    const auditPayload = JSON.stringify(prisma.auditEvent.create.mock.calls);
    expect(auditPayload).not.toContain('123456');
    expect(auditPayload).not.toContain(plaintextSecret);
  });

  it('recifra y audita un secreto heredado antes de verificarlo', async () => {
    const legacySecret = randomSecret();
    const prisma = buildPrisma({
      totpSecret: legacySecret,
      totpEnabledAt: new Date('2026-09-07T12:00:00.000Z'),
      tenantId: 'tenant-a',
      tenant: { defaultMode: tenantMode },
    });
    const service = buildService(prisma, buildCipher('migrate'));

    await expect(
      service.verifyCode('user-a', 'tenant-a', '123456'),
    ).resolves.toBe(true);

    const migration = prisma.user.updateMany.mock.calls[0]?.[0];
    expect(migration.where.id).toBe('user-a');
    expect(migration.where.tenantId).toBe('tenant-a');
    expect(migration.where.totpSecret === legacySecret).toBe(true);
    expect(migration.data.totpSecret).toMatch(/^totp:v1:test-current:/u);
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'MFA_SECRET_REENCRYPTED',
        metadata: { source: 'legacy-plaintext' },
      }),
    });
    expect(JSON.stringify(prisma.auditEvent.create.mock.calls)).not.toContain(
      legacySecret,
    );
  });

  it('falla cerrado y audita si el secreto cambia durante la recodificación', async () => {
    const prisma = buildPrisma({
      totpSecret: randomSecret(),
      totpEnabledAt: new Date('2026-09-07T12:00:00.000Z'),
      tenantId: 'tenant-a',
      tenant: { defaultMode: tenantMode },
    });
    prisma.user.updateMany.mockResolvedValue({ count: 0 });
    const service = buildService(prisma, buildCipher('migrate'));

    await expect(
      service.verifyCode('user-a', 'tenant-a', '123456'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'MFA_SECRET_REENCRYPTION_CONFLICT',
        metadata: { reason: 'CONCURRENT_SECRET_CHANGE' },
      }),
    });
  });

  it('recifra con la clave activa un sobre creado con una clave anterior', async () => {
    const oldKey = Buffer.alloc(32, 8);
    const currentKey = Buffer.alloc(32, 9);
    const oldCipher = new MfaSecretCipher({
      activeKeyId: 'test-old',
      activeKey: oldKey,
      legacyPlaintextMode: 'reject',
    });
    const rotatingCipher = new MfaSecretCipher({
      activeKeyId: 'test-current',
      activeKey: currentKey,
      previousKeys: new Map([['test-old', oldKey]]),
      legacyPlaintextMode: 'reject',
    });
    const plaintextSecret = randomSecret();
    const prisma = buildPrisma({
      totpSecret: oldCipher.encrypt(plaintextSecret, secretContext),
      totpEnabledAt: new Date('2026-09-07T12:00:00.000Z'),
      tenantId: 'tenant-a',
      tenant: { defaultMode: tenantMode },
    });
    const service = buildService(prisma, rotatingCipher);

    await expect(
      service.verifyCode('user-a', 'tenant-a', '123456'),
    ).resolves.toBe(true);

    const rotatedSecret = prisma.user.updateMany.mock.calls[0]?.[0]?.data
      .totpSecret as string;
    expect(rotatedSecret).toMatch(/^totp:v1:test-current:/u);
    expect(
      digest(rotatingCipher.decrypt(rotatedSecret, secretContext).secret),
    ).toBe(digest(plaintextSecret));
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'MFA_SECRET_REENCRYPTED',
        metadata: { source: 'encrypted', sourceKeyId: 'test-old' },
      }),
    });
  });

  it('bloquea y audita texto plano cuando el modo heredado es reject', async () => {
    const prisma = buildPrisma({
      totpSecret: randomSecret(),
      totpEnabledAt: new Date('2026-09-07T12:00:00.000Z'),
      tenantId: 'tenant-a',
      tenant: { defaultMode: tenantMode },
    });
    const service = buildService(prisma, buildCipher('reject'));

    await expect(
      service.verifyCode('user-a', 'tenant-a', '123456'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'MFA_SECRET_DECRYPTION_FAILED',
        metadata: { reason: 'UNREADABLE_SECRET' },
      }),
    });
  });

  it('bloquea y audita un sobre cifrado alterado sin registrarlo', async () => {
    const cipher = buildCipher('reject');
    const encrypted = encryptedSecret(cipher);
    const lastCharacter = encrypted.at(-1);
    const tampered = `${encrypted.slice(0, -1)}${lastCharacter === 'A' ? 'B' : 'A'}`;
    const prisma = buildPrisma({
      totpSecret: tampered,
      totpEnabledAt: new Date('2026-09-07T12:00:00.000Z'),
      tenantId: 'tenant-a',
      tenant: { defaultMode: tenantMode },
    });
    const service = buildService(prisma, cipher);

    await expect(
      service.verifyCode('user-a', 'tenant-a', '123456'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'MFA_SECRET_DECRYPTION_FAILED',
        metadata: { reason: 'UNREADABLE_SECRET' },
      }),
    });
    expect(JSON.stringify(prisma.auditEvent.create.mock.calls)).not.toContain(
      tampered,
    );
  });
});
