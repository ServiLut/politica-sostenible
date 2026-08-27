import { BadRequestException } from '@nestjs/common';
import { AuditOutcome } from '../../../prisma/generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';

export const STORAGE_UPLOAD_CONFIRMED_ACTION = 'STORAGE_UPLOAD_CONFIRMED';
export const STORAGE_OBJECT_RESOURCE_TYPE = 'StorageObject';

export async function assertConfirmedStorageUpload(
  prisma: PrismaService,
  tenantId: string,
  path: string,
): Promise<void> {
  const receipt = await prisma.auditEvent.findFirst({
    where: {
      tenantId,
      action: STORAGE_UPLOAD_CONFIRMED_ACTION,
      resourceType: STORAGE_OBJECT_RESOURCE_TYPE,
      resourceId: path,
      outcome: AuditOutcome.SUCCESS,
    },
    select: { id: true },
  });

  if (!receipt) {
    throw new BadRequestException(
      'El archivo debe completarse y verificarse en almacenamiento antes de asociarlo',
    );
  }
}
