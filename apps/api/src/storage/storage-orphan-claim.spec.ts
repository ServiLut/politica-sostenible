import {
  Prisma,
  StorageObjectModule,
  StoredObjectStatus,
} from '../../prisma/generated/prisma';
import { claimStorageOrphan } from './storage-orphan-claim';

describe('Import protection before orphan removal', () => {
  const now = new Date();
  const before = new Date(now.getTime() - 86400_000);
  const candidate = {
    id: 'proof-a',
    module: StorageObjectModule.CONSENT,
    path: 'tenant-a/consent/proof.pdf',
    status: StoredObjectStatus.CONFIRMED,
  };
  function fixture(protectedImport: boolean) {
    const raw = jest
      .fn()
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([{ protected: protectedImport }]);
    const update = jest.fn().mockResolvedValue({ count: 1 });
    return {
      raw,
      update,
      tx: {
        $queryRaw: raw,
        storedObject: { updateMany: update },
      } as unknown as Prisma.TransactionClient,
    };
  }
  it('acquires the lifecycle lock before the indexed protection read and does not expire a reserved object', async () => {
    const { raw, update, tx } = fixture(true);
    expect(
      await claimStorageOrphan(tx, 'tenant-a', candidate, now, before),
    ).toBe(false);
    const lock = raw.mock.calls[0][0] as Prisma.Sql;
    const protection = raw.mock.calls[1][0] as Prisma.Sql;
    expect(lock.text).toContain('pg_advisory_xact_lock');
    expect(lock.values).toContain('operation-profile-lifecycle:tenant-a');
    expect(protection.text).toContain('"PersonImportRowResult"');
    expect(protection.text).toContain('"jobId" = j."id"');
    expect(protection.values).toContain('tenant-a');
    expect(protection.values).toContain(candidate.path);
    expect(update).not.toHaveBeenCalled();
  });
  it('conditionally expires only the still-unconsumed exact object of this tenant', async () => {
    const { tx, update } = fixture(false);
    expect(
      await claimStorageOrphan(tx, 'tenant-a', candidate, now, before),
    ).toBe(true);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: candidate.id,
          tenantId: 'tenant-a',
          path: candidate.path,
          module: StorageObjectModule.CONSENT,
          status: StoredObjectStatus.CONFIRMED,
          consumedAt: null,
          integrityStatus: { not: 'PENDING' },
          confirmedAt: { lte: before },
        },
      }),
    );
    update.mockResolvedValue({ count: 0 });
    // Fresh transaction fixture: another consumer won the state transition.
    const second = fixture(false);
    second.update.mockResolvedValue({ count: 0 });
    expect(
      await claimStorageOrphan(second.tx, 'tenant-a', candidate, now, before),
    ).toBe(false);
  });
  it('fails closed when the reservation query did not return a valid result', async () => {
    const { tx, raw, update } = fixture(false);
    raw
      .mockReset()
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([]);
    await expect(
      claimStorageOrphan(tx, 'tenant-a', candidate, now, before),
    ).rejects.toThrow('reserva');
    expect(update).not.toHaveBeenCalled();
  });
  it('rechecks even an expired candidate before permitting remote deletion', async () => {
    const { tx, update } = fixture(true);
    expect(
      await claimStorageOrphan(
        tx,
        'tenant-a',
        { ...candidate, status: StoredObjectStatus.EXPIRED },
        now,
        before,
      ),
    ).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});
