import {
  PoliticalOperationMode,
  PoliticalOperationStage,
} from '../../../prisma/generated/prisma';
import type { Prisma } from '../../../prisma/generated/prisma';
import {
  lockAndAssertOperationOpen,
  lockAndAssertCampaignOperationOpen,
  OPERATION_LIFECYCLE_LOCK_PREFIX,
  OperationClosedForMutationException,
  lockOperationLifecycleSnapshot,
} from './operation-lifecycle-fence.util';

describe('operation lifecycle mutation fence', () => {
  it('takes the shared lifecycle advisory lock before reading the profile', async () => {
    const calls: string[] = [];
    const queryRaw = jest
      .fn()
      .mockImplementationOnce(() => {
        calls.push('advisory');
        return Promise.resolve([{ locked: true }]);
      })
      .mockImplementationOnce(() => {
        calls.push('profile');
        return Promise.resolve([{ stage: PoliticalOperationStage.CAMPAIGN }]);
      });
    const transaction = {
      $queryRaw: queryRaw,
    } as unknown as Prisma.TransactionClient;

    await expect(
      lockAndAssertOperationOpen(transaction, 'tenant-a'),
    ).resolves.toBe(PoliticalOperationStage.CAMPAIGN);

    expect(calls).toEqual(['advisory', 'profile']);
    expect(OPERATION_LIFECYCLE_LOCK_PREFIX).toBe('operation-profile-lifecycle');
    expect(queryRaw.mock.calls[0]?.[0].sql).toContain(
      'WITH lifecycle_lock AS MATERIALIZED',
    );
    expect(queryRaw.mock.calls[0]?.[0].values).toEqual([
      'operation-profile-lifecycle:tenant-a',
    ]);
    expect(queryRaw.mock.calls[1]?.[0].sql).toContain('FOR SHARE');
    expect(queryRaw.mock.calls[1]?.[0].values).toEqual(['tenant-a']);
  });

  it('allows onboarding before a profile exists while retaining the tenant lock', async () => {
    const transaction = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ locked: true }])
        .mockResolvedValueOnce([]),
    } as unknown as Prisma.TransactionClient;

    await expect(
      lockAndAssertOperationOpen(transaction, 'tenant-without-profile'),
    ).resolves.toBeNull();
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('serializes a read snapshot without rejecting the CLOSED stage', async () => {
    const queryRaw = jest.fn().mockResolvedValueOnce([{ locked: true }]);
    const transaction = {
      $queryRaw: queryRaw,
    } as unknown as Prisma.TransactionClient;

    await expect(
      lockOperationLifecycleSnapshot(transaction, 'tenant-closed'),
    ).resolves.toBeUndefined();
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(queryRaw.mock.calls[0]?.[0].values).toEqual([
      'operation-profile-lifecycle:tenant-closed',
    ]);
  });

  it('rejects CLOSED while the profile row remains locked by the transaction', async () => {
    const transaction = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ locked: true }])
        .mockResolvedValueOnce([{ stage: PoliticalOperationStage.CLOSED }]),
    } as unknown as Prisma.TransactionClient;

    await expect(
      lockAndAssertOperationOpen(transaction, 'tenant-closed'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'OPERATION_CLOSED' }),
    });
    await expect(
      Promise.reject(new OperationClosedForMutationException()),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('fails loudly when a transaction double does not implement raw SQL', async () => {
    const invalidTransaction = {} as Prisma.TransactionClient;

    await expect(
      lockAndAssertOperationOpen(invalidTransaction, 'tenant-a'),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it('serializes PUBLIC_OFFICE without imposing the campaign profile boundary', async () => {
    const queryRaw = jest.fn().mockResolvedValueOnce([{ locked: true }]);
    const transaction = {
      $queryRaw: queryRaw,
    } as unknown as Prisma.TransactionClient;

    await expect(
      lockAndAssertCampaignOperationOpen(
        transaction,
        'public-office-a',
        PoliticalOperationMode.PUBLIC_OFFICE,
      ),
    ).resolves.toBeNull();
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(queryRaw.mock.calls[0]?.[0].values).toEqual([
      'operation-profile-lifecycle:public-office-a',
    ]);
  });
});
