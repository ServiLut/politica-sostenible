import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OfflineSyncOperationType } from '../../../prisma/generated/prisma';
import { OfflineSyncService } from './offline-sync.service';

const SECRET = 'test-offline-sync-secret-with-at-least-thirty-two-bytes';

function config(secret: string | undefined): ConfigService {
  return {
    get: jest.fn((key: string) =>
      key === 'OFFLINE_SYNC_HMAC_SECRET' ? secret : undefined,
    ),
  } as unknown as ConfigService;
}

describe('OfflineSyncService', () => {
  it.each([undefined, '', 'too-short'])(
    'rejects a missing or short dedicated HMAC secret',
    (secret) => {
      expect(() => new OfflineSyncService(config(secret))).toThrow(
        'OFFLINE_SYNC_HMAC_SECRET es obligatorio',
      );
    },
  );

  it('creates a stable HMAC over canonical payloads without retaining PII', () => {
    const service = new OfflineSyncService(config(SECRET));
    const first = service.prepare(
      OfflineSyncOperationType.VOTER_CAPTURE,
      '11111111-1111-4111-8111-111111111111',
      '2026-09-01T12:00:00.000Z',
      { name: 'Persona sensible', nested: { b: 2, a: 1 } },
    );
    const reordered = service.prepare(
      OfflineSyncOperationType.VOTER_CAPTURE,
      '11111111-1111-4111-8111-111111111111',
      '2026-09-01T12:00:00.000Z',
      { nested: { a: 1, b: 2 }, name: 'Persona sensible' },
    );

    expect(first.payloadHmac).toMatch(/^[a-f0-9]{64}$/);
    expect(first.payloadHmac).toBe(reordered.payloadHmac);
    expect(JSON.stringify(first)).not.toContain('Persona sensible');
  });

  it('returns the same tenant-scoped receipt only for the same actor and payload', async () => {
    const service = new OfflineSyncService(config(SECRET));
    const descriptor = service.prepare(
      OfflineSyncOperationType.E14_REPORT,
      '11111111-1111-4111-8111-111111111111',
      '2026-09-01T12:00:00.000Z',
      { mesa: 1, votes: 10 },
    );
    const receipt = {
      id: 'receipt-a',
      tenantId: 'tenant-a',
      actorUserId: 'actor-a',
      clientOperationId: descriptor.clientOperationId,
      operationType: descriptor.operationType,
      payloadHmac: descriptor.payloadHmac,
      capturedAt: descriptor.capturedAt,
      receivedAt: new Date('2026-09-01T12:01:00.000Z'),
    };
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
      offlineSyncReceipt: {
        findUnique: jest.fn().mockResolvedValue(receipt),
        create: jest.fn(),
      },
    };

    await expect(
      service.lockAndFindDuplicate(
        transaction as never,
        'tenant-a',
        'actor-a',
        descriptor,
      ),
    ).resolves.toEqual(receipt);
    expect(transaction.offlineSyncReceipt.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_clientOperationId: {
            tenantId: 'tenant-a',
            clientOperationId: descriptor.clientOperationId,
          },
        },
      }),
    );

    const changed = service.prepare(
      OfflineSyncOperationType.E14_REPORT,
      descriptor.clientOperationId,
      '2026-09-01T12:00:00.000Z',
      { mesa: 1, votes: 11 },
    );
    await expect(
      service.lockAndFindDuplicate(
        transaction as never,
        'tenant-a',
        'actor-a',
        changed,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('presents a non-disclosing receipt', () => {
    const service = new OfflineSyncService(config(SECRET));
    const descriptor = service.prepare(
      OfflineSyncOperationType.VOTER_CAPTURE,
      '11111111-1111-4111-8111-111111111111',
      '2026-09-01T12:00:00.000Z',
      { documentId: '1012345678' },
    );
    const presented = service.present(
      {
        id: 'receipt-a',
        tenantId: 'tenant-a',
        actorUserId: 'actor-a',
        clientOperationId: descriptor.clientOperationId,
        operationType: descriptor.operationType,
        payloadHmac: descriptor.payloadHmac,
        capturedAt: descriptor.capturedAt,
        receivedAt: new Date('2026-09-01T12:01:00.000Z'),
      },
      'DUPLICATE',
    );

    expect(presented).toEqual({
      received: true,
      receiptId: 'receipt-a',
      clientOperationId: descriptor.clientOperationId,
      operationType: OfflineSyncOperationType.VOTER_CAPTURE,
      status: 'DUPLICATE',
      capturedAt: '2026-09-01T12:00:00.000Z',
      receivedAt: '2026-09-01T12:01:00.000Z',
    });
    expect(presented).not.toHaveProperty('tenantId');
    expect(presented).not.toHaveProperty('actorUserId');
    expect(presented).not.toHaveProperty('payloadHmac');
    expect(presented).not.toHaveProperty('resourceId');
  });
});
