import {
  AuditOutcome,
  StorageIntegrityStatus,
  StorageObjectModule,
  StoredObjectStatus,
} from '../../prisma/generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { StorageIntegrityByteReader } from './storage-integrity-byte-reader.service';
import { StorageIntegrityReadError } from './storage-integrity-stream';
import { StorageIntegrityVerificationService } from './storage-integrity-verification.service';

describe('Declared consent proof integrity', () => {
  function fixture() {
    const hash = 'a'.repeat(64);
    const object = {
      id: 'stored-a',
      tenantId: 'tenant-a',
      module: StorageObjectModule.CONSENT,
      path: 'tenant-a/consent/proof.pdf',
      contentType: 'application/pdf',
      expectedSize: 100,
      expectedSha256: hash,
      reportedSha256: hash,
      status: StoredObjectStatus.CONFIRMED,
      integrityStatus: StorageIntegrityStatus.PENDING,
    };
    const transaction = {
      storedObject: {
        findFirst: jest.fn().mockResolvedValue(object),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      ...transaction,
      $transaction: jest.fn(
        async (callback: (value: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const reader = {
      read: jest.fn().mockResolvedValue({
        calculatedSha256: hash,
        observedSize: 100,
        observedContentType: 'application/pdf',
      }),
    };
    return {
      hash,
      prisma,
      reader,
      service: new StorageIntegrityVerificationService(
        prisma as unknown as PrismaService,
        reader as unknown as StorageIntegrityByteReader,
      ),
    };
  }

  it('verifies a confirmed consent proof using independent bytes and the tenant-bound lease', async () => {
    const { service, prisma, reader, hash } = fixture();
    await expect(service.process('tenant-a', 'stored-a', true)).resolves.toBe(
      'VERIFIED',
    );
    expect(reader.read).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        module: StorageObjectModule.CONSENT,
        expectedSha256: hash,
      }),
    );
    const lease = prisma.storedObject.updateMany.mock.calls[0][0].data
      .integrityVerificationLeaseId as string;
    expect(prisma.storedObject.updateMany).toHaveBeenLastCalledWith({
      where: expect.objectContaining({
        tenantId: 'tenant-a',
        id: 'stored-a',
        integrityVerificationLeaseId: lease,
        expectedSha256: hash,
        expectedSize: 100,
      }),
      data: expect.objectContaining({
        integrityStatus: StorageIntegrityStatus.VERIFIED,
        calculatedSha256: hash,
        observedSize: 100,
      }),
    });
  });

  it('records a byte mismatch as failed, never verified or retryable', async () => {
    const { service, prisma, reader } = fixture();
    reader.read.mockRejectedValue(
      new StorageIntegrityReadError('SHA256_MISMATCH', false),
    );
    await expect(
      service.process('tenant-a', 'stored-a', true),
    ).rejects.toMatchObject({
      code: 'SHA256_MISMATCH',
    });
    expect(prisma.storedObject.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          integrityStatus: StorageIntegrityStatus.FAILED,
          integrityVerifiedAt: null,
        }),
      }),
    );
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ outcome: AuditOutcome.FAILURE }),
      }),
    );
  });

  it('does not read bytes from a missing tenant-scoped authorization', async () => {
    const { service, prisma, reader } = fixture();
    prisma.storedObject.findFirst.mockResolvedValue(null);
    await expect(
      service.process('tenant-b', 'stored-a', true),
    ).rejects.toMatchObject({
      code: 'INVALID_RECORD',
    });
    expect(prisma.storedObject.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'stored-a', tenantId: 'tenant-b' },
      }),
    );
    expect(reader.read).not.toHaveBeenCalled();
    expect(prisma.storedObject.updateMany).not.toHaveBeenCalled();
  });
});
