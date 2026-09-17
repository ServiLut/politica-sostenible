import { BadRequestException } from '@nestjs/common';
import {
  Prisma,
  StorageIntegrityStatus,
  StorageObjectModule,
  StoredObjectStatus,
} from '../../../prisma/generated/prisma';
import { assertPlanQuotaInTransaction } from '../../auth/guards/plan-limits.guard';

export const STORAGE_UPLOAD_CONFIRMED_ACTION = 'STORAGE_UPLOAD_CONFIRMED';
export const STORAGE_OBJECT_RESOURCE_TYPE = 'StorageObject';

const BYTE_VERIFIED_EVIDENCE_MODULES = new Set<StorageObjectModule>([
  StorageObjectModule.FINANCE,
  StorageObjectModule.E14,
  StorageObjectModule.SCRUTINY,
  StorageObjectModule.ELECTORAL_CALENDAR,
  StorageObjectModule.SIGNATURE_COLLECTION,
  StorageObjectModule.PQRSD,
]);

type StoredObjectClient = Pick<
  Prisma.TransactionClient,
  | '$queryRaw'
  | 'storedObject'
  | 'subscriptionPlan'
  | 'tenantSubscription'
  | 'user'
  | 'voter'
>;

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
  integrity?: { readonly expectedSha256: string },
): Promise<void> {
  const requiresIndependentIntegrity =
    BYTE_VERIFIED_EVIDENCE_MODULES.has(module);
  const transition = await client.storedObject.updateMany({
    where: {
      tenantId,
      path,
      module,
      ...(uploaderId ? { uploaderId } : {}),
      ...(integrity || requiresIndependentIntegrity
        ? {
            expectedSha256: integrity
              ? integrity.expectedSha256
              : { not: null },
            reportedSha256: integrity
              ? integrity.expectedSha256
              : { not: null },
            calculatedSha256: integrity
              ? integrity.expectedSha256
              : { not: null },
            integrityStatus: StorageIntegrityStatus.VERIFIED,
          }
        : {
            expectedSha256: null,
            reportedSha256: null,
          }),
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
      'El archivo debe estar confirmado, no haberse asociado antes y, si declara SHA-256, haber superado la verificación independiente de bytes',
    );
  }

  if (
    module === StorageObjectModule.CONSENT &&
    resourceType === 'VoterConsent'
  ) {
    // ImportService creates the voter immediately before consuming its proof.
    // Validate current usage (increment 0) in that exact transaction so a
    // batch or concurrent import rolls back instead of exceeding maxVoters.
    await assertPlanQuotaInTransaction(client, tenantId, 'voters', 0);
  }
}

/** Read-only check retained for callers that only need validation. */
export async function assertConfirmedStorageUpload(
  client: Pick<Prisma.TransactionClient, 'storedObject'>,
  tenantId: string,
  path: string,
  module?: StorageObjectModule,
): Promise<void> {
  const requiresIndependentIntegrity =
    module !== undefined && BYTE_VERIFIED_EVIDENCE_MODULES.has(module);
  const receipt = await client.storedObject.findFirst({
    where: {
      tenantId,
      path,
      ...(module ? { module } : {}),
      status: StoredObjectStatus.CONFIRMED,
      consumedAt: null,
      ...(requiresIndependentIntegrity
        ? {
            expectedSha256: { not: null },
            reportedSha256: { not: null },
            calculatedSha256: { not: null },
            integrityStatus: StorageIntegrityStatus.VERIFIED,
          }
        : {
            OR: [
              { expectedSha256: null, reportedSha256: null },
              {
                expectedSha256: { not: null },
                reportedSha256: { not: null },
                calculatedSha256: { not: null },
                integrityStatus: StorageIntegrityStatus.VERIFIED,
              },
            ],
          }),
    },
    select: { id: true },
  });

  if (!receipt) {
    throw new BadRequestException(
      'El archivo debe estar confirmado y toda huella declarada debe estar verificada independientemente antes de asociarlo',
    );
  }
}
