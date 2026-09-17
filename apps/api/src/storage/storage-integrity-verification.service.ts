import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AuditActorType,
  AuditOutcome,
  PoliticalOperationMode,
  StorageIntegrityStatus,
  StorageObjectModule,
  StoredObjectStatus,
} from '../../prisma/generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { StorageIntegrityByteReader } from './storage-integrity-byte-reader.service';
import {
  StorageIntegrityReadError,
  type StorageIntegrityFailureCode,
  type StorageIntegrityObservation,
} from './storage-integrity-stream';

const LEASE_STALE_MS = 5 * 60_000;

interface ClaimedVerification {
  readonly tenantId: string;
  readonly storedObjectId: string;
  readonly leaseId: string;
  readonly module: StorageObjectModule;
  readonly path: string;
  readonly expectedSha256: string;
  readonly expectedSize: number;
  readonly contentType: string;
}

export class StorageIntegrityTerminalError extends Error {
  constructor(readonly code: StorageIntegrityFailureCode) {
    super(`Terminal storage integrity failure: ${code}`);
    this.name = 'StorageIntegrityTerminalError';
  }
}

@Injectable()
export class StorageIntegrityVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bytes: StorageIntegrityByteReader,
  ) {}

  async process(
    tenantId: string,
    storedObjectId: string,
    finalAttempt: boolean,
  ): Promise<'VERIFIED' | 'NO_OP' | 'BUSY'> {
    const claimed = await this.claim(tenantId, storedObjectId);
    if (claimed === 'NO_OP' || claimed === 'BUSY') return claimed;

    try {
      const observation = await this.bytes.read(claimed);
      await this.recordVerified(claimed, observation);
      return 'VERIFIED';
    } catch (error) {
      const failure =
        error instanceof StorageIntegrityReadError
          ? error
          : new StorageIntegrityReadError('INTERNAL_ERROR', true);

      if (failure.retryable && !finalAttempt) {
        await this.releaseForRetry(claimed, failure.code);
        throw failure;
      }

      await this.recordFailed(claimed, failure.code, failure.observation);
      throw new StorageIntegrityTerminalError(failure.code);
    }
  }

  async markUnexpectedTerminalFailure(
    tenantId: string,
    storedObjectId: string,
  ): Promise<void> {
    const claimed = await this.claim(tenantId, storedObjectId);
    if (claimed === 'NO_OP' || claimed === 'BUSY') return;
    await this.recordFailed(claimed, 'INTERNAL_ERROR', {});
  }

  private async claim(
    tenantId: string,
    storedObjectId: string,
  ): Promise<ClaimedVerification | 'NO_OP' | 'BUSY'> {
    const current = await this.prisma.storedObject.findFirst({
      where: { id: storedObjectId, tenantId },
      select: {
        id: true,
        tenantId: true,
        module: true,
        path: true,
        contentType: true,
        expectedSize: true,
        expectedSha256: true,
        reportedSha256: true,
        status: true,
        integrityStatus: true,
      },
    });
    if (!current) {
      throw new StorageIntegrityTerminalError('INVALID_RECORD');
    }
    if (current.integrityStatus === StorageIntegrityStatus.VERIFIED) {
      return 'NO_OP';
    }
    if (current.integrityStatus === StorageIntegrityStatus.FAILED) {
      return 'NO_OP';
    }
    if (
      current.integrityStatus !== StorageIntegrityStatus.PENDING ||
      !current.expectedSha256 ||
      current.reportedSha256 !== current.expectedSha256 ||
      ![StoredObjectStatus.CONFIRMED, StoredObjectStatus.CONSUMED].includes(
        current.status,
      )
    ) {
      throw new StorageIntegrityTerminalError('INVALID_RECORD');
    }

    const leaseId = randomUUID();
    const staleBefore = new Date(Date.now() - LEASE_STALE_MS);
    const transition = await this.prisma.storedObject.updateMany({
      where: {
        id: current.id,
        tenantId,
        expectedSha256: current.expectedSha256,
        integrityStatus: StorageIntegrityStatus.PENDING,
        OR: [
          {
            integrityVerificationStartedAt: null,
            integrityVerificationLeaseId: null,
          },
          { integrityVerificationStartedAt: { lte: staleBefore } },
        ],
      },
      data: {
        integrityVerificationStartedAt: new Date(),
        integrityVerificationLeaseId: leaseId,
        integrityVerificationAttempts: { increment: 1 },
      },
    });
    if (transition.count !== 1) return 'BUSY';

    return {
      tenantId,
      storedObjectId: current.id,
      leaseId,
      module: current.module,
      path: current.path,
      expectedSha256: current.expectedSha256,
      expectedSize: current.expectedSize,
      contentType: current.contentType.toLowerCase(),
    };
  }

  private async recordVerified(
    claim: ClaimedVerification,
    observation: Required<StorageIntegrityObservation>,
  ): Promise<void> {
    const checkedAt = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const transition = await transaction.storedObject.updateMany({
        where: {
          id: claim.storedObjectId,
          tenantId: claim.tenantId,
          integrityStatus: StorageIntegrityStatus.PENDING,
          integrityVerificationLeaseId: claim.leaseId,
          expectedSha256: observation.calculatedSha256,
          expectedSize: observation.observedSize,
        },
        data: {
          integrityStatus: StorageIntegrityStatus.VERIFIED,
          calculatedSha256: observation.calculatedSha256,
          observedSize: observation.observedSize,
          observedContentType: observation.observedContentType,
          integrityCheckedAt: checkedAt,
          integrityVerifiedAt: checkedAt,
          integrityFailureCode: null,
          integrityVerificationStartedAt: null,
          integrityVerificationLeaseId: null,
        },
      });
      if (transition.count !== 1) return;

      await transaction.auditEvent.create({
        data: {
          tenantId: claim.tenantId,
          mode: this.modeFor(claim.module),
          actorType: AuditActorType.SYSTEM,
          action: 'STORAGE_CONTENT_INTEGRITY_VERIFIED',
          resourceType: 'StorageObject',
          resourceId: claim.storedObjectId,
          outcome: AuditOutcome.SUCCESS,
          metadata: {
            algorithm: 'SHA-256',
            size: observation.observedSize,
            contentType: observation.observedContentType,
          },
        },
      });
    });
  }

  private async releaseForRetry(
    claim: ClaimedVerification,
    code: StorageIntegrityFailureCode,
  ): Promise<void> {
    await this.prisma.storedObject.updateMany({
      where: {
        id: claim.storedObjectId,
        tenantId: claim.tenantId,
        integrityStatus: StorageIntegrityStatus.PENDING,
        integrityVerificationLeaseId: claim.leaseId,
      },
      data: {
        integrityFailureCode: code,
        integrityVerificationStartedAt: null,
        integrityVerificationLeaseId: null,
      },
    });
  }

  private async recordFailed(
    claim: ClaimedVerification,
    code: StorageIntegrityFailureCode,
    observation: StorageIntegrityObservation,
  ): Promise<void> {
    const checkedAt = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const transition = await transaction.storedObject.updateMany({
        where: {
          id: claim.storedObjectId,
          tenantId: claim.tenantId,
          integrityStatus: StorageIntegrityStatus.PENDING,
          integrityVerificationLeaseId: claim.leaseId,
        },
        data: {
          integrityStatus: StorageIntegrityStatus.FAILED,
          calculatedSha256: observation.calculatedSha256 ?? null,
          observedSize: observation.observedSize ?? null,
          observedContentType: observation.observedContentType ?? null,
          integrityCheckedAt: checkedAt,
          integrityVerifiedAt: null,
          integrityFailureCode: code,
          integrityVerificationStartedAt: null,
          integrityVerificationLeaseId: null,
        },
      });
      if (transition.count !== 1) return;

      await transaction.auditEvent.create({
        data: {
          tenantId: claim.tenantId,
          mode: this.modeFor(claim.module),
          actorType: AuditActorType.SYSTEM,
          action: 'STORAGE_CONTENT_INTEGRITY_FAILED',
          resourceType: 'StorageObject',
          resourceId: claim.storedObjectId,
          outcome: AuditOutcome.FAILURE,
          metadata: { failureCode: code, algorithm: 'SHA-256' },
        },
      });
    });
  }

  private modeFor(module: StorageObjectModule): PoliticalOperationMode {
    return module === StorageObjectModule.PQRSD
      ? PoliticalOperationMode.PUBLIC_OFFICE
      : PoliticalOperationMode.CAMPAIGN;
  }
}
