import {
  Prisma,
  StorageIntegrityStatus,
  StorageObjectModule,
  StoredObjectStatus,
} from '../../prisma/generated/prisma';
import { lockOperationLifecycleSnapshot } from '../common/utils/operation-lifecycle-fence.util';

export type StorageOrphanCandidate = Readonly<{
  id: string;
  status: StoredObjectStatus;
  module: StorageObjectModule;
  path: string;
}>;

/** The caller commits this claim before removing bytes from private Storage. */
export async function claimStorageOrphan(
  tx: Prisma.TransactionClient,
  tenantId: string,
  candidate: StorageOrphanCandidate,
  now: Date,
  confirmedBefore: Date,
): Promise<boolean> {
  // Import reservation, staging and consumption use this same tenant key.
  // Re-read protection only after acquiring it, never from a stale candidate list.
  await lockOperationLifecycleSnapshot(tx, tenantId);
  if (
    candidate.module === StorageObjectModule.CONSENT ||
    candidate.module === StorageObjectModule.PERSON_IMPORT
  ) {
    const [result] = await tx.$queryRaw<Array<{ protected: boolean }>>(
      Prisma.sql`
        SELECT EXISTS (
          SELECT 1 FROM "PersonImportJob" j
          WHERE j."tenantId" = ${tenantId}
          AND (
            j."sourceArtifactPath" = ${candidate.path}
            OR (
              ${candidate.module === StorageObjectModule.CONSENT}
              AND (
                j."status" IN ('QUEUED', 'VALIDATING')
                OR (j."status" = 'FAILED'
                    AND j."lastErrorCode" IS DISTINCT FROM 'INVALID_FILE'
                    AND j."importRequestedAt" IS NULL)
                OR (
                  (j."status" IN ('READY', 'IMPORT_QUEUED', 'IMPORTING')
                   OR (j."status" = 'FAILED'
                       AND j."lastErrorCode" IS DISTINCT FROM 'INVALID_FILE'))
                  AND EXISTS (
                    SELECT 1 FROM "PersonImportRowResult" r
                    WHERE r."tenantId" = ${tenantId}
                    AND r."jobId" = j."id"
                    AND r."proofPath" = ${candidate.path}
                  )
                )
              )
            )
          )
        ) AS "protected"
      `,
    );
    if (!result || typeof result.protected !== 'boolean')
      throw new Error('No fue posible verificar la reserva del archivo');
    if (result.protected) return false;
  }

  const transition = await tx.storedObject.updateMany({
    where: {
      id: candidate.id,
      tenantId,
      path: candidate.path,
      module: candidate.module,
      status: candidate.status,
      consumedAt: null,
      // A live/recoverable byte verification still owns this object.
      integrityStatus: { not: StorageIntegrityStatus.PENDING },
      ...(candidate.status === StoredObjectStatus.EXPIRED
        ? {}
        : candidate.status === StoredObjectStatus.ISSUED
          ? { expiresAt: { lte: now } }
          : { confirmedAt: { lte: confirmedBefore } }),
    },
    data: {
      // Verified byte observations are immutable in PostgreSQL. Expiration
      // revokes consumption; it must not erase or rewrite that observation.
      status: StoredObjectStatus.EXPIRED,
      confirmedAt: null,
    },
  });
  return transition.count === 1;
}
