import { BadRequestException } from '@nestjs/common';
import {
  Prisma,
  StorageObjectModule,
  StoredObjectStatus,
} from '../../../prisma/generated/prisma';

export const STORAGE_UPLOAD_CONFIRMED_ACTION = 'STORAGE_UPLOAD_CONFIRMED';
export const STORAGE_OBJECT_RESOURCE_TYPE = 'StorageObject';

type StoredObjectClient = Pick<Prisma.TransactionClient, 'storedObject'>;

/**
 * Consumes a confirmed upload exactly once and links it to the domain record
 * inside the caller's transaction. Audit events are evidence, not authority.
 */
export async function consumeConfirmedStorageUpload(
  client: StoredObjectClient,
  tenantId: string,
  path: string,
  module: StorageObjectModule,
  resourceType: string,
  resourceId: string,
  uploaderId?: string,
): Promise<void> {
  const transition = await client.storedObject.updateMany({
    where: {
      tenantId,
      path,
      module,
      ...(uploaderId ? { uploaderId } : {}),
      status: StoredObjectStatus.CONFIRMED,
      consumedAt: null,
    },
    data: {
      status: StoredObjectStatus.CONSUMED,
      consumedAt: new Date(),
      consumedByType: resourceType,
      consumedById: resourceId,
    },
  });

  if (transition.count !== 1) {
    throw new BadRequestException(
      'El archivo debe estar confirmado, pertenecer al módulo y no haber sido asociado antes',
    );
  }
}

/** Read-only check retained for callers that only need validation. */
export async function assertConfirmedStorageUpload(
  client: StoredObjectClient,
  tenantId: string,
  path: string,
  module?: StorageObjectModule,
): Promise<void> {
  const receipt = await client.storedObject.findFirst({
    where: {
      tenantId,
      path,
      ...(module ? { module } : {}),
      status: StoredObjectStatus.CONFIRMED,
      consumedAt: null,
    },
    select: { id: true },
  });

  if (!receipt) {
    throw new BadRequestException(
      'El archivo debe completarse y verificarse en almacenamiento antes de asociarlo',
    );
  }
}
