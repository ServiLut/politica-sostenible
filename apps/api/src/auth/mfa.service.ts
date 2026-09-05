import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { generateSecret, generateURI, verifySync } from 'otplib';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { AuditActorType } from '../../prisma/generated/prisma';

@Injectable()
export class MfaService {
  constructor(private readonly prisma: PrismaService) {}

  // Generate a new TOTP secret and QR code for enrollment
  async generateSecret(userId: string, tenantId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, tenantId },
      select: { email: true, totpSecret: true, tenant: { select: { defaultMode: true } } },
    });
    if (!user) throw new ForbiddenException();
    if (user.totpSecret) {
      throw new BadRequestException('La autenticación de dos factores ya está habilitada.');
    }

    const secret = generateSecret();
    const otpauthUrl = generateURI({ issuer: 'Política Sostenible', label: user.email, secret });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    // Store secret temporarily (not enabled yet until verified)
    await this.prisma.user.update({
      where: { id: userId, tenantId },
      data: { totpSecret: secret },
    });

    await this.prisma.auditEvent.create({
      data: {
        tenantId,
        mode: user.tenant.defaultMode,
        actorType: AuditActorType.USER,
        actorUserId: userId,
        action: 'MFA_SETUP_INITIATED',
        resourceType: 'User',
        resourceId: userId,
      }
    });

    return { qrCodeDataUrl, secret };
  }

  // Verify a TOTP code and enable MFA
  async verifyAndEnable(userId: string, tenantId: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, tenantId },
      select: { totpSecret: true, totpEnabledAt: true, tenant: { select: { defaultMode: true } } },
    });
    if (!user?.totpSecret) {
      throw new BadRequestException('Primero debe generar un código QR.');
    }
    if (user.totpEnabledAt) {
      throw new BadRequestException('La autenticación de dos factores ya está habilitada.');
    }

    const isValid = verifySync({ token: code, secret: user.totpSecret });
    if (!isValid) {
      await this.prisma.auditEvent.create({
        data: {
          tenantId,
          mode: user.tenant.defaultMode,
          actorType: AuditActorType.USER,
          actorUserId: userId,
          action: 'MFA_VERIFICATION_FAILED',
          resourceType: 'User',
          resourceId: userId,
        }
      });
      throw new ForbiddenException('Código incorrecto. Intente de nuevo.');
    }

    await this.prisma.user.update({
      where: { id: userId, tenantId },
      data: { totpEnabledAt: new Date() },
    });

    await this.prisma.auditEvent.create({
      data: {
        tenantId,
        mode: user.tenant.defaultMode,
        actorType: AuditActorType.USER,
        actorUserId: userId,
        action: 'MFA_ENABLED',
        resourceType: 'User',
        resourceId: userId,
      }
    });

    return { enabled: true };
  }

  // Verify TOTP during login
  async verifyCode(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { totpSecret: true, totpEnabledAt: true, tenantId: true, tenant: { select: { defaultMode: true } } },
    });
    if (!user?.totpSecret || !user.totpEnabledAt) return true; // MFA not enabled
    
    const isValid = verifySync({ token: code, secret: user.totpSecret });
    if (!isValid) {
      await this.prisma.auditEvent.create({
        data: {
          tenantId: user.tenantId,
          mode: user.tenant.defaultMode,
          actorType: AuditActorType.USER,
          actorUserId: userId,
          action: 'MFA_VERIFICATION_FAILED',
          resourceType: 'User',
          resourceId: userId,
        }
      });
    }
    return !!isValid;
  }

  // Disable MFA (requires valid code)
  async disable(userId: string, tenantId: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, tenantId },
      select: { totpSecret: true, totpEnabledAt: true, tenant: { select: { defaultMode: true } } },
    });
    if (!user?.totpSecret || !user.totpEnabledAt) {
      throw new BadRequestException('La autenticación de dos factores no está habilitada.');
    }

    const isValid = verifySync({ token: code, secret: user.totpSecret });
    if (!isValid) {
      await this.prisma.auditEvent.create({
        data: {
          tenantId,
          mode: user.tenant.defaultMode,
          actorType: AuditActorType.USER,
          actorUserId: userId,
          action: 'MFA_VERIFICATION_FAILED',
          resourceType: 'User',
          resourceId: userId,
        }
      });
      throw new ForbiddenException('Código incorrecto.');
    }

    await this.prisma.user.update({
      where: { id: userId, tenantId },
      data: { totpSecret: null, totpEnabledAt: null },
    });

    await this.prisma.auditEvent.create({
      data: {
        tenantId,
        mode: user.tenant.defaultMode,
        actorType: AuditActorType.USER,
        actorUserId: userId,
        action: 'MFA_DISABLED',
        resourceType: 'User',
        resourceId: userId,
      }
    });

    return { disabled: true };
  }

  // Check if user has MFA enabled
  async hasMfaEnabled(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { totpEnabledAt: true },
    });
    return !!user?.totpEnabledAt;
  }
}
