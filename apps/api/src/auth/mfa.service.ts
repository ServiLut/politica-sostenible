import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  generateSecret,
  generateURI,
  type VerifyResult,
  verifySync,
} from 'otplib';
import * as QRCode from 'qrcode';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuditActorType,
  PoliticalOperationMode,
} from '../../prisma/generated/prisma';
import { MfaSecretCipher, MfaSecretDecryptionError } from './mfa-secret-cipher';

const DUMMY_PASSWORD_HASH =
  '$2b$12$wlL6bomTWf5lMYG4AC2UmezhPHN3i2fH5RFtgvsnHe2vG/wUoHAhq';

interface DecryptedStoredSecret {
  readonly secret: string;
  readonly storedSecret: string;
}

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secretCipher: MfaSecretCipher,
  ) {}

  // Generate a new TOTP secret and QR code for enrollment
  async generateSecret(
    userId: string,
    tenantId: string,
    currentPassword: string,
  ) {
    if (Buffer.byteLength(currentPassword, 'utf8') > 72) {
      throw new BadRequestException(
        'La contraseña no puede superar 72 bytes en UTF-8.',
      );
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId, tenantId },
      select: {
        email: true,
        password: true,
        totpSecret: true,
        totpEnabledAt: true,
        tenant: { select: { defaultMode: true } },
      },
    });
    const passwordMatches = await bcrypt.compare(
      currentPassword,
      user?.password ?? DUMMY_PASSWORD_HASH,
    );
    if (!user) {
      throw new ForbiddenException('La contraseña actual no es correcta.');
    }
    if (!passwordMatches) {
      await this.auditSecurityEvent(
        userId,
        tenantId,
        user.tenant.defaultMode,
        'MFA_SETUP_REAUTHENTICATION_FAILED',
        { reason: 'INVALID_CURRENT_PASSWORD' },
      );
      throw new ForbiddenException('La contraseña actual no es correcta.');
    }
    if (user.totpEnabledAt && !user.totpSecret) {
      await this.rejectInconsistentState(
        userId,
        tenantId,
        user.tenant.defaultMode,
      );
    }
    if (user.totpEnabledAt) {
      throw new BadRequestException(
        'La autenticación de dos factores ya está habilitada.',
      );
    }

    const secret = generateSecret();
    const otpauthUrl = generateURI({
      issuer: 'Política Sostenible',
      label: user.email,
      secret,
    });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
    const encryptedSecret = this.secretCipher.encrypt(secret, {
      tenantId,
      userId,
    });

    // Store only the authenticated ciphertext while enrollment is pending.
    const stored = await this.prisma.user.updateMany({
      where: {
        id: userId,
        tenantId,
        isActive: true,
        password: user.password,
        totpSecret: user.totpSecret,
        totpEnabledAt: null,
      },
      data: { totpSecret: encryptedSecret, lastTotpTimeStep: null },
    });
    if (stored.count !== 1) {
      throw new ServiceUnavailableException(
        'La configuración de la cuenta cambió. Vuelve a iniciar sesión e inténtalo de nuevo.',
      );
    }

    await this.prisma.auditEvent.create({
      data: {
        tenantId,
        mode: user.tenant.defaultMode,
        actorType: AuditActorType.USER,
        actorUserId: userId,
        action: 'MFA_SETUP_INITIATED',
        resourceType: 'User',
        resourceId: userId,
      },
    });

    return { qrCodeDataUrl, secret };
  }

  // Verify a TOTP code and enable MFA
  async verifyAndEnable(userId: string, tenantId: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, tenantId },
      select: {
        totpSecret: true,
        totpEnabledAt: true,
        lastTotpTimeStep: true,
        tenant: { select: { defaultMode: true } },
      },
    });
    if (!user) throw new ForbiddenException();
    if (user.totpEnabledAt && !user.totpSecret) {
      await this.rejectInconsistentState(
        userId,
        tenantId,
        user.tenant.defaultMode,
      );
    }
    if (!user.totpSecret) {
      throw new BadRequestException('Primero debe generar un código QR.');
    }
    if (user.totpEnabledAt) {
      throw new BadRequestException(
        'La autenticación de dos factores ya está habilitada.',
      );
    }

    const decrypted = await this.decryptStoredSecret(
      userId,
      tenantId,
      user.totpSecret,
      user.tenant.defaultMode,
    );
    const verification = await this.verifyTotp(
      userId,
      tenantId,
      user.tenant.defaultMode,
      decrypted.secret,
      code,
      user.lastTotpTimeStep,
    );
    if (!verification.valid) {
      await this.prisma.auditEvent.create({
        data: {
          tenantId,
          mode: user.tenant.defaultMode,
          actorType: AuditActorType.USER,
          actorUserId: userId,
          action: 'MFA_VERIFICATION_FAILED',
          resourceType: 'User',
          resourceId: userId,
        },
      });
      throw new ForbiddenException('Código incorrecto. Intente de nuevo.');
    }

    const enabledAt = new Date();
    const enabled = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: {
          id: userId,
          tenantId,
          isActive: true,
          totpSecret: decrypted.storedSecret,
          totpEnabledAt: null,
          ...this.unconsumedTimeStepFilter(verification.timeStep),
        },
        data: {
          totpEnabledAt: enabledAt,
          lastTotpTimeStep: verification.timeStep,
          authVersion: { increment: 1 },
        },
      });
      if (updated.count !== 1) return false;

      await tx.auditEvent.create({
        data: {
          tenantId,
          mode: user.tenant.defaultMode,
          actorType: AuditActorType.USER,
          actorUserId: userId,
          action: 'MFA_ENABLED',
          resourceType: 'User',
          resourceId: userId,
        },
      });
      return true;
    });
    if (!enabled) {
      await this.auditTotpConsumptionConflict(
        userId,
        tenantId,
        user.tenant.defaultMode,
      );
      throw new ForbiddenException('Código incorrecto. Intente de nuevo.');
    }

    return { enabled: true };
  }

  // Verify TOTP during login
  async verifyCode(
    userId: string,
    tenantId: string,
    code: string,
  ): Promise<boolean> {
    return this.verifyStoredCode(userId, tenantId, code, false);
  }

  /**
   * Verifies a code only when MFA is currently enabled for an active user.
   * Sensitive operations must use this stricter contract instead of the login
   * helper, where an account without MFA legitimately has nothing to verify.
   */
  async verifyEnabledCode(
    userId: string,
    tenantId: string,
    code: string,
  ): Promise<boolean> {
    return this.verifyStoredCode(userId, tenantId, code, true);
  }

  private async verifyStoredCode(
    userId: string,
    tenantId: string,
    code: string,
    requireEnabled: boolean,
  ): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, tenantId },
      select: {
        isActive: true,
        totpSecret: true,
        totpEnabledAt: true,
        lastTotpTimeStep: true,
        tenantId: true,
        tenant: { select: { defaultMode: true } },
      },
    });
    if (!user) return false;
    if (requireEnabled && !user.isActive) return false;
    if (!user.totpEnabledAt) {
      return !requireEnabled; // Enrollment absent or still pending during login.
    }
    if (!user.totpSecret) {
      await this.auditSecurityEvent(
        userId,
        tenantId,
        user.tenant.defaultMode,
        'MFA_STATE_INVALID',
        { reason: 'ENABLED_WITHOUT_SECRET' },
      );
      return false;
    }

    const decrypted = await this.decryptStoredSecret(
      userId,
      tenantId,
      user.totpSecret,
      user.tenant.defaultMode,
    );
    const verification = await this.verifyTotp(
      userId,
      tenantId,
      user.tenant.defaultMode,
      decrypted.secret,
      code,
      user.lastTotpTimeStep,
    );
    if (!verification.valid) {
      await this.prisma.auditEvent.create({
        data: {
          tenantId: user.tenantId,
          mode: user.tenant.defaultMode,
          actorType: AuditActorType.USER,
          actorUserId: userId,
          action: 'MFA_VERIFICATION_FAILED',
          resourceType: 'User',
          resourceId: userId,
        },
      });
      return false;
    }

    const consumed = await this.prisma.user.updateMany({
      where: {
        id: userId,
        tenantId,
        isActive: true,
        totpSecret: decrypted.storedSecret,
        totpEnabledAt: user.totpEnabledAt,
        ...this.unconsumedTimeStepFilter(verification.timeStep),
      },
      data: { lastTotpTimeStep: verification.timeStep },
    });
    if (consumed.count !== 1) {
      await this.auditTotpConsumptionConflict(
        userId,
        tenantId,
        user.tenant.defaultMode,
      );
      return false;
    }

    return true;
  }

  // Disable MFA (requires valid code)
  async disable(userId: string, tenantId: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, tenantId },
      select: {
        totpSecret: true,
        totpEnabledAt: true,
        lastTotpTimeStep: true,
        tenant: { select: { defaultMode: true } },
      },
    });
    if (!user) throw new ForbiddenException();
    if (user.totpEnabledAt && !user.totpSecret) {
      await this.rejectInconsistentState(
        userId,
        tenantId,
        user.tenant.defaultMode,
      );
    }
    if (!user.totpSecret || !user.totpEnabledAt) {
      throw new BadRequestException(
        'La autenticación de dos factores no está habilitada.',
      );
    }

    const decrypted = await this.decryptStoredSecret(
      userId,
      tenantId,
      user.totpSecret,
      user.tenant.defaultMode,
    );
    const verification = await this.verifyTotp(
      userId,
      tenantId,
      user.tenant.defaultMode,
      decrypted.secret,
      code,
      user.lastTotpTimeStep,
    );
    if (!verification.valid) {
      await this.prisma.auditEvent.create({
        data: {
          tenantId,
          mode: user.tenant.defaultMode,
          actorType: AuditActorType.USER,
          actorUserId: userId,
          action: 'MFA_VERIFICATION_FAILED',
          resourceType: 'User',
          resourceId: userId,
        },
      });
      throw new ForbiddenException('Código incorrecto.');
    }

    const disabled = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: {
          id: userId,
          tenantId,
          isActive: true,
          totpSecret: decrypted.storedSecret,
          totpEnabledAt: user.totpEnabledAt,
          ...this.unconsumedTimeStepFilter(verification.timeStep),
        },
        data: {
          totpSecret: null,
          totpEnabledAt: null,
          lastTotpTimeStep: null,
          authVersion: { increment: 1 },
        },
      });
      if (updated.count !== 1) return false;

      await tx.auditEvent.create({
        data: {
          tenantId,
          mode: user.tenant.defaultMode,
          actorType: AuditActorType.USER,
          actorUserId: userId,
          action: 'MFA_DISABLED',
          resourceType: 'User',
          resourceId: userId,
        },
      });
      return true;
    });
    if (!disabled) {
      await this.auditTotpConsumptionConflict(
        userId,
        tenantId,
        user.tenant.defaultMode,
      );
      throw new ForbiddenException('Código incorrecto.');
    }

    return { disabled: true };
  }

  // Check if user has MFA enabled
  async hasMfaEnabled(userId: string, tenantId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, tenantId },
      select: {
        totpSecret: true,
        totpEnabledAt: true,
        tenant: { select: { defaultMode: true } },
      },
    });
    if (!user) return false;
    if (user.totpEnabledAt && !user.totpSecret) {
      await this.rejectInconsistentState(
        userId,
        tenantId,
        user.tenant.defaultMode,
      );
    }
    return !!user?.totpEnabledAt;
  }

  private async decryptStoredSecret(
    userId: string,
    tenantId: string,
    storedSecret: string,
    mode: PoliticalOperationMode,
  ): Promise<DecryptedStoredSecret> {
    let decrypted: ReturnType<MfaSecretCipher['decrypt']>;
    try {
      decrypted = this.secretCipher.decrypt(storedSecret, {
        tenantId,
        userId,
      });
    } catch (error: unknown) {
      if (!(error instanceof MfaSecretDecryptionError)) throw error;

      await this.auditSecurityEvent(
        userId,
        tenantId,
        mode,
        'MFA_SECRET_DECRYPTION_FAILED',
        { reason: 'UNREADABLE_SECRET' },
      );
      throw new ServiceUnavailableException(
        'La configuración de autenticación de dos factores requiere recuperación administrativa.',
      );
    }

    let effectiveStoredSecret = storedSecret;
    if (decrypted.requiresReencryption) {
      const encryptedSecret = this.secretCipher.encrypt(decrypted.secret, {
        tenantId,
        userId,
      });
      const migrated = await this.prisma.user.updateMany({
        where: { id: userId, tenantId, totpSecret: storedSecret },
        data: { totpSecret: encryptedSecret },
      });
      if (migrated.count === 0) {
        await this.auditSecurityEvent(
          userId,
          tenantId,
          mode,
          'MFA_SECRET_REENCRYPTION_CONFLICT',
          { reason: 'CONCURRENT_SECRET_CHANGE' },
        );
        throw new ServiceUnavailableException(
          'La configuración de autenticación de dos factores cambió durante la verificación. Intente de nuevo.',
        );
      }
      await this.auditSecurityEvent(
        userId,
        tenantId,
        mode,
        'MFA_SECRET_REENCRYPTED',
        {
          source: decrypted.source,
          ...(decrypted.sourceKeyId
            ? { sourceKeyId: decrypted.sourceKeyId }
            : {}),
        },
      );
      effectiveStoredSecret = encryptedSecret;
    }

    return {
      secret: decrypted.secret,
      storedSecret: effectiveStoredSecret,
    };
  }

  private async verifyTotp(
    userId: string,
    tenantId: string,
    mode: PoliticalOperationMode,
    secret: string,
    token: string,
    lastTimeStep: number | null | undefined,
  ): Promise<VerifyResult> {
    try {
      return verifySync({
        strategy: 'totp',
        secret,
        token,
        ...(typeof lastTimeStep === 'number'
          ? { afterTimeStep: lastTimeStep }
          : {}),
      }) as VerifyResult;
    } catch (error: unknown) {
      const errorName = error instanceof Error ? error.name : '';
      if (
        errorName === 'TokenFormatError' ||
        errorName === 'TokenLengthError'
      ) {
        return { valid: false };
      }

      const invalidTimeStep = errorName.startsWith('AfterTimeStep');
      await this.auditSecurityEvent(
        userId,
        tenantId,
        mode,
        invalidTimeStep
          ? 'MFA_TOTP_STATE_INVALID'
          : 'MFA_TOTP_VERIFIER_UNAVAILABLE',
        {
          reason: invalidTimeStep
            ? 'LAST_TIME_STEP_INVALID_OR_CLOCK_ROLLBACK'
            : 'VERIFIER_FAILURE',
        },
      );
      throw new ServiceUnavailableException(
        'No fue posible validar el código de autenticación en este momento. Intente nuevamente.',
      );
    }
  }

  private unconsumedTimeStepFilter(timeStep: number) {
    return {
      OR: [{ lastTotpTimeStep: null }, { lastTotpTimeStep: { lt: timeStep } }],
    };
  }

  private async auditTotpConsumptionConflict(
    userId: string,
    tenantId: string,
    mode: PoliticalOperationMode,
  ): Promise<void> {
    await this.auditSecurityEvent(
      userId,
      tenantId,
      mode,
      'MFA_TOTP_REPLAY_REJECTED',
      { reason: 'TIME_STEP_ALREADY_CONSUMED_OR_SECURITY_STATE_CHANGED' },
    );
  }

  private async rejectInconsistentState(
    userId: string,
    tenantId: string,
    mode: PoliticalOperationMode,
  ): Promise<never> {
    await this.auditSecurityEvent(userId, tenantId, mode, 'MFA_STATE_INVALID', {
      reason: 'ENABLED_WITHOUT_SECRET',
    });
    throw new ServiceUnavailableException(
      'La configuración de autenticación de dos factores requiere recuperación administrativa.',
    );
  }

  private async auditSecurityEvent(
    userId: string,
    tenantId: string,
    mode: PoliticalOperationMode,
    action: string,
    metadata: Record<string, string>,
  ): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        tenantId,
        mode,
        actorType: AuditActorType.USER,
        actorUserId: userId,
        action,
        resourceType: 'User',
        resourceId: userId,
        metadata,
      },
    });
  }
}
