import { BadRequestException } from '@nestjs/common';
import {
  StoredObjectStatus,
  StorageObjectModule,
} from '../../../prisma/generated/prisma';
import {
  assertConfirmedStorageUpload,
  consumeConfirmedStorageUpload,
} from './confirmed-storage-upload.util';
import { assertPlanQuotaInTransaction } from '../../auth/guards/plan-limits.guard';

jest.mock('../../auth/guards/plan-limits.guard', () => ({
  assertPlanQuotaInTransaction: jest.fn().mockResolvedValue(undefined),
}));

describe('confirmed storage upload authorization', () => {
  const path = 'tenant-a/e14/123e4567-e89b-42d3-a456-426614174000.pdf';

  it('validates an unconsumed row scoped to tenant, module and exact path', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'stored-a' });
    const client = { storedObject: { findFirst } } as never;

    await expect(
      assertConfirmedStorageUpload(
        client,
        'tenant-a',
        path,
        StorageObjectModule.E14,
      ),
    ).resolves.toBeUndefined();
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        path,
        module: StorageObjectModule.E14,
        status: StoredObjectStatus.CONFIRMED,
        consumedAt: null,
      },
      select: { id: true },
    });
  });

  it('atomically consumes and links a confirmed upload exactly once', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const client = { storedObject: { updateMany } } as never;

    await consumeConfirmedStorageUpload(
      client,
      'tenant-a',
      path,
      StorageObjectModule.E14,
      'WitnessReport',
      'report-a',
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        path,
        module: StorageObjectModule.E14,
        status: StoredObjectStatus.CONFIRMED,
        consumedAt: null,
      },
      data: {
        status: StoredObjectStatus.CONSUMED,
        consumedAt: expect.any(Date) as Date,
        consumedByType: 'WitnessReport',
        consumedById: 'report-a',
      },
    });
  });

  it('rejects reuse, another tenant or a concurrent consumption winner', async () => {
    const client = {
      storedObject: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    } as never;

    await expect(
      consumeConfirmedStorageUpload(
        client,
        'tenant-a',
        path,
        StorageObjectModule.E14,
        'WitnessReport',
        'report-a',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces maxVoters after an imported voter is inserted', async () => {
    const consentPath =
      'tenant-a/consent/123e4567-e89b-42d3-a456-426614174000.pdf';
    const client = {
      storedObject: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    } as never;

    await consumeConfirmedStorageUpload(
      client,
      'tenant-a',
      consentPath,
      StorageObjectModule.CONSENT,
      'VoterConsent',
      'voter-a',
    );

    expect(assertPlanQuotaInTransaction).toHaveBeenCalledWith(
      client,
      'tenant-a',
      'voters',
      0,
    );
  });
});
