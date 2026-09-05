import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { verifySync } from 'otplib';
import * as crypto from 'crypto';

@Injectable()
export class ElectronicSignatureService {
  constructor(private readonly prisma: PrismaService) {}

  async signDocument(
    tenantId: string,
    documentId: string,
    userId: string,
    otpCode: string,
    ipAddress?: string,
  ) {
    const document = await this.prisma.storedObject.findUnique({
      where: { id_tenantId: { id: documentId, tenantId } },
    });

    if (!document) {
      throw new NotFoundException('Documento no encontrado');
    }

    const user = await this.prisma.user.findUnique({
      where: { id_tenantId: { id: userId, tenantId } },
    });

    if (!user || !user.totpEnabledAt || !user.totpSecret) {
      throw new ForbiddenException('Usuario no tiene habilitado el segundo factor de autenticación');
    }

    const isValidOtp = verifySync({ token: otpCode, secret: user.totpSecret });
    if (!isValidOtp) {
      throw new ForbiddenException('Código OTP inválido');
    }

    const timestamp = Date.now().toString();
    const dataToHash = `${document.id}${document.path}${document.expectedSize}${timestamp}`;
    const hash = crypto.createHash('sha256').update(dataToHash).digest('hex');

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    const mode = tenant?.defaultMode || 'CAMPAIGN';

    return this.prisma.$transaction(async (tx) => {
      const signature = await tx.electronicSignature.create({
        data: {
          tenantId,
          documentId,
          signerId: userId,
          documentHash: hash,
          ipAddress,
        },
      });

      await tx.auditEvent.create({
        data: {
          tenantId,
          mode: mode,
          actorType: 'USER',
          actorUserId: userId,
          action: 'DOCUMENT_SIGNED',
          resourceType: 'ElectronicSignature',
          resourceId: signature.id,
          sourceIpHash: ipAddress ? crypto.createHash('sha256').update(ipAddress).digest('hex') : null,
          metadata: { documentId },
        },
      });

      return signature;
    });
  }

  async verifySignature(tenantId: string, signatureId: string) {
    const signature = await this.prisma.electronicSignature.findUnique({
      where: { id: signatureId },
      include: {
        signer: {
          select: { id: true, name: true, email: true },
        },
        document: {
          select: { id: true, path: true, expectedSize: true },
        },
      },
    });

    if (!signature || signature.tenantId !== tenantId) {
      throw new NotFoundException('Firma no encontrada');
    }

    return signature;
  }
}
