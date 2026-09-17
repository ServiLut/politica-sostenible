import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OfflineSyncOperationType,
  Prisma,
} from '../../../prisma/generated/prisma';

const MINIMUM_SECRET_BYTES = 32;
const MAXIMUM_FUTURE_SKEW_MS = 5 * 60 * 1000;
const CAPTURE_TIMESTAMP_WITH_TIMEZONE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

const OFFLINE_SYNC_RECEIPT_SELECT = {
  id: true,
  tenantId: true,
  actorUserId: true,
  clientOperationId: true,
  operationType: true,
  payloadHmac: true,
  capturedAt: true,
  receivedAt: true,
} satisfies Prisma.OfflineSyncReceiptSelect;

export type OfflineSyncReceiptRecord = Prisma.OfflineSyncReceiptGetPayload<{
  select: typeof OFFLINE_SYNC_RECEIPT_SELECT;
}>;

export interface OfflineSyncDescriptor {
  clientOperationId: string;
  operationType: OfflineSyncOperationType;
  payloadHmac: string;
  capturedAt: Date;
}

export interface OfflineSyncResponse {
  received: true;
  receiptId: string;
  clientOperationId: string;
  operationType: OfflineSyncOperationType;
  status: 'APPLIED' | 'DUPLICATE';
  capturedAt: string;
  receivedAt: string;
}

type OfflineSyncTransaction = Pick<
  Prisma.TransactionClient,
  '$queryRaw' | 'offlineSyncReceipt'
>;

@Injectable()
export class OfflineSyncService {
  private readonly hmacSecret: Buffer;

  constructor(configService: ConfigService) {
    const configuredSecret = configService
      .get<string>('OFFLINE_SYNC_HMAC_SECRET')
      ?.trim();

    if (
      !configuredSecret ||
      Buffer.byteLength(configuredSecret, 'utf8') < MINIMUM_SECRET_BYTES
    ) {
      throw new Error(
        `OFFLINE_SYNC_HMAC_SECRET es obligatorio y debe tener al menos ${MINIMUM_SECRET_BYTES} bytes`,
      );
    }

    this.hmacSecret = Buffer.from(configuredSecret, 'utf8');
  }

  prepare(
    operationType: OfflineSyncOperationType,
    clientOperationId: string,
    capturedAtValue: string,
    payload: Record<string, unknown>,
  ): OfflineSyncDescriptor {
    if (!CAPTURE_TIMESTAMP_WITH_TIMEZONE_PATTERN.test(capturedAtValue)) {
      throw new BadRequestException(
        'capturedAt debe incluir fecha, hora y zona horaria ISO 8601',
      );
    }
    const capturedAt = new Date(capturedAtValue);
    if (Number.isNaN(capturedAt.getTime())) {
      throw new BadRequestException('capturedAt no es una fecha valida');
    }
    if (capturedAt.getTime() > Date.now() + MAXIMUM_FUTURE_SKEW_MS) {
      throw new BadRequestException(
        'capturedAt no puede estar mas de cinco minutos en el futuro',
      );
    }

    const canonicalPayload = this.canonicalize({
      version: 1,
      operationType,
      capturedAt: capturedAt.toISOString(),
      payload,
    });
    const payloadHmac = createHmac('sha256', this.hmacSecret)
      .update(canonicalPayload)
      .digest('hex');

    return {
      clientOperationId,
      operationType,
      payloadHmac,
      capturedAt,
    };
  }

  async lockAndFindDuplicate(
    transaction: OfflineSyncTransaction,
    tenantId: string,
    actorUserId: string,
    descriptor: OfflineSyncDescriptor,
  ): Promise<OfflineSyncReceiptRecord | null> {
    const lockKey = `offline-sync:${tenantId}:${descriptor.clientOperationId.toLowerCase()}`;
    await transaction.$queryRaw<Array<{ locked: boolean }>>(
      Prisma.sql`
        WITH offline_sync_lock AS MATERIALIZED (
          SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
        )
        SELECT TRUE AS "locked" FROM offline_sync_lock
      `,
    );

    const receipt = await transaction.offlineSyncReceipt.findUnique({
      where: {
        tenantId_clientOperationId: {
          tenantId,
          clientOperationId: descriptor.clientOperationId,
        },
      },
      select: OFFLINE_SYNC_RECEIPT_SELECT,
    });

    if (!receipt) return null;

    if (
      receipt.actorUserId !== actorUserId ||
      receipt.operationType !== descriptor.operationType ||
      !this.hmacMatches(receipt.payloadHmac, descriptor.payloadHmac)
    ) {
      throw new ConflictException(
        'clientOperationId ya fue utilizado con una operacion diferente',
      );
    }

    return receipt;
  }

  createReceipt(
    transaction: OfflineSyncTransaction,
    tenantId: string,
    actorUserId: string,
    descriptor: OfflineSyncDescriptor,
    resourceType: 'Voter' | 'WitnessReport' | 'IssueCase',
    resourceId: string,
    receivedAt: Date,
    payloadSha256?: string,
  ): Promise<OfflineSyncReceiptRecord> {
    return transaction.offlineSyncReceipt.create({
      data: {
        tenantId,
        actorUserId,
        clientOperationId: descriptor.clientOperationId,
        operationType: descriptor.operationType,
        payloadHmac: descriptor.payloadHmac,
        payloadSha256,
        resourceType,
        resourceId,
        capturedAt: descriptor.capturedAt,
        receivedAt,
      },
      select: OFFLINE_SYNC_RECEIPT_SELECT,
    });
  }

  present(
    receipt: OfflineSyncReceiptRecord,
    status: OfflineSyncResponse['status'],
  ): OfflineSyncResponse {
    return {
      received: true,
      receiptId: receipt.id,
      clientOperationId: receipt.clientOperationId,
      operationType: receipt.operationType,
      status,
      capturedAt: receipt.capturedAt.toISOString(),
      receivedAt: receipt.receivedAt.toISOString(),
    };
  }

  private hmacMatches(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, 'hex');
    const rightBuffer = Buffer.from(right, 'hex');
    return (
      leftBuffer.length === rightBuffer.length &&
      leftBuffer.length > 0 &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }

  private canonicalize(value: unknown): string {
    if (value === null || typeof value === 'string') {
      return JSON.stringify(value);
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new BadRequestException(
          'El payload offline contiene un numero no valido',
        );
      }
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.canonicalize(item)).join(',')}]`;
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        // Code-unit ordering is deterministic across hosts and locales. A
        // locale-aware comparator could change an HMAC after a deployment.
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
      return `{${entries
        .map(
          ([key, item]) => `${JSON.stringify(key)}:${this.canonicalize(item)}`,
        )
        .join(',')}}`;
    }

    throw new BadRequestException(
      'El payload offline contiene un valor no serializable',
    );
  }
}
