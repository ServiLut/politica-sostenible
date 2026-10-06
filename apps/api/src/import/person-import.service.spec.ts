import { ForbiddenException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PersonImportStatus, Role } from '../../prisma/generated/prisma';
import {
  assertPlanQuotaInTransaction,
  getTenantEntitledSubscription,
} from '../auth/guards/plan-limits.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ImportService } from './import.service';
import { PersonImportService } from './person-import.service';
import { PersonImportArtifactService } from './person-import-artifact.service';

jest.mock('../auth/guards/plan-limits.guard', () => ({
  assertPlanQuotaInTransaction: jest.fn().mockResolvedValue(undefined),
  getTenantEntitledSubscription: jest
    .fn()
    .mockResolvedValue({ plan: { includesImport: true } }),
}));

const user = {
  tenantId: 'c123456789012345678901234',
  userId: 'c223456789012345678901234',
  role: Role.ADMIN,
};
const dto = {
  clientRequestId: '123e4567-e89b-42d3-a456-426614174000',
  fileName: 'PRUEBA.csv',
  sourceArtifactPath: `${user.tenantId}/person-import/123e4567-e89b-42d3-a456-426614174000.csv`,
  expectedContentSha256: 'a'.repeat(64),
};
const payloadSha256 = createHash('sha256')
  .update(
    JSON.stringify({
      fileName: dto.fileName,
      path: dto.sourceArtifactPath,
      hash: dto.expectedContentSha256,
    }),
  )
  .digest('hex');

function harness() {
  const job = {
    id: 'c323456789012345678901234',
    tenantId: user.tenantId,
    requestedById: user.userId,
    ...dto,
    payloadSha256,
    noticeVersion: 'QA-v1',
    status: PersonImportStatus.QUEUED as PersonImportStatus,
    totalRows: 3,
    validRows: 2,
    errorRows: 1,
    skippedRows: 0,
    importedRows: 0,
    validatedThrough: 0,
    attempts: 0,
    importRequestedAt: null as Date | null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    leaseToken: null,
    leaseExpiresAt: null,
    lastErrorCode: null as string | null,
    lastErrorMessage: null,
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ stage: 'EXPLORATION' }]),
    personImportJob: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(job),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: Partial<typeof job> }) => {
          Object.assign(job, data);
          return Promise.resolve({ ...job });
        }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    storedObject: {
      findFirst: jest.fn().mockResolvedValue({
        contentType: 'text/csv',
        actualSize: 500,
        expectedSize: 500,
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit' }) },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const legacy = {
    loadImportContext: jest.fn().mockResolvedValue({
      noticeVersion: 'QA-v1',
      noticeActivatedAt: new Date('2026-01-01'),
    }),
  };
  const queue = {
    enqueue: jest.fn().mockResolvedValue(undefined),
    checkReady: jest.fn().mockResolvedValue(undefined),
  };
  const artifacts = {
    withVerifiedCsv: jest.fn(),
    uploadLimits: jest.fn().mockResolvedValue({
      maxBytes: 10 * 1024 * 1024,
      maxEvidenceBytes: 10 * 1024 * 1024,
    }),
  };
  const service = new PersonImportService(
    prisma as unknown as PrismaService,
    legacy as unknown as ImportService,
    artifacts as unknown as PersonImportArtifactService,
    queue,
  );
  return { job, tx, prisma, legacy, artifacts, queue, service };
}

describe('Durable person import authorization and replay', () => {
  beforeEach(() => jest.clearAllMocks());
  it('returns effective file and consent-evidence limits from the private Storage policy', async () => {
    const h = harness();
    expect((await h.service.options(user)).limits).toEqual({
      maxRows: 50_000,
      maxBytes: 10 * 1024 * 1024,
      maxEvidenceBytes: 10 * 1024 * 1024,
    });
    expect(h.artifacts.uploadLimits).toHaveBeenCalledTimes(1);
  });
  it('rejects a foreign source before opening a transaction', async () => {
    const h = harness();
    await expect(
      h.service.create(user, {
        ...dto,
        sourceArtifactPath: 'foreign/person-import/source.csv',
      }),
    ).rejects.toThrow('organización');
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });
  it('requires current permissions, enabled plan and independently verified CSV', async () => {
    const h = harness();
    h.tx.storedObject.findFirst.mockResolvedValue(null);
    await expect(h.service.create(user, dto)).rejects.toThrow('verificados');
    expect(h.tx.storedObject.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: user.tenantId,
          uploaderId: user.userId,
          integrityStatus: 'VERIFIED',
          calculatedSha256: dto.expectedContentSha256,
        }),
      }),
    );
    expect(h.tx.personImportJob.create).not.toHaveBeenCalled();
    expect(getTenantEntitledSubscription).toHaveBeenCalledWith(
      h.tx,
      user.tenantId,
    );
  });
  it('consumes the CSV once inside the durable job transaction then enqueues only IDs', async () => {
    const h = harness();
    const result = await h.service.create(user, dto);
    expect(h.tx.storedObject.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: user.tenantId,
          expectedSha256: dto.expectedContentSha256,
          reportedSha256: dto.expectedContentSha256,
          calculatedSha256: dto.expectedContentSha256,
          integrityStatus: 'VERIFIED',
        }),
        data: expect.objectContaining({ consumedById: h.job.id }),
      }),
    );
    expect(h.queue.enqueue).toHaveBeenCalledWith({
      importJobId: h.job.id,
      tenantId: user.tenantId,
    });
    expect(result).not.toHaveProperty('sourceArtifactPath');
    expect(result).not.toHaveProperty('leaseToken');
  });
  it('same UUID and bytes returns the durable job without another consume or insert', async () => {
    const h = harness();
    h.tx.personImportJob.findFirst.mockResolvedValue(h.job);
    h.tx.personImportJob.count.mockResolvedValue(2);
    expect((await h.service.create(user, dto)).id).toBe(h.job.id);
    expect(h.tx.personImportJob.create).not.toHaveBeenCalled();
    expect(h.tx.storedObject.updateMany).not.toHaveBeenCalled();
    expect(h.tx.personImportJob.count).not.toHaveBeenCalled();
  });
  it('limits new work to two active jobs under the tenant lifecycle transaction', async () => {
    const h = harness();
    h.tx.personImportJob.count.mockResolvedValue(2);
    await expect(h.service.create(user, dto)).rejects.toThrow(
      'dos importaciones',
    );
    expect(h.tx.personImportJob.count).toHaveBeenCalledWith({
      where: {
        tenantId: user.tenantId,
        status: { in: ['QUEUED', 'VALIDATING', 'IMPORT_QUEUED', 'IMPORTING'] },
      },
    });
    expect(h.tx.personImportJob.create).not.toHaveBeenCalled();
    expect(h.queue.enqueue).not.toHaveBeenCalled();
  });
  it('rejects reuse of the same request or path with different metadata', async () => {
    const h = harness();
    h.tx.personImportJob.findFirst.mockResolvedValue(h.job);
    await expect(
      h.service.create(user, { ...dto, expectedContentSha256: 'b'.repeat(64) }),
    ).rejects.toThrow('otro contenido');
    expect(h.queue.enqueue).not.toHaveBeenCalled();
  });
  it('keeps the durable job when Redis is unavailable, allowing same-request reconciliation', async () => {
    const h = harness();
    h.queue.enqueue.mockRejectedValue(new Error('queue unavailable'));
    await expect(h.service.create(user, dto)).rejects.toThrow(
      'queue unavailable',
    );
    expect(h.tx.personImportJob.create).toHaveBeenCalledTimes(1);
  });
  it('a job lookup always includes tenant and never returns another organization', async () => {
    const h = harness();
    await expect(h.service.get(user, h.job.id)).rejects.toThrow(
      'no encontrada',
    );
    expect(h.tx.personImportJob.findFirst).toHaveBeenCalledWith({
      where: { tenantId: user.tenantId, id: h.job.id },
    });
  });
  it('execution is explicit, checks quota for valid rows and is idempotent after completion', async () => {
    const h = harness();
    h.job.status = PersonImportStatus.READY;
    h.tx.personImportJob.findFirst.mockResolvedValue(h.job);
    const result = await h.service.execute(user, h.job.id);
    expect(result.status).toBe('IMPORT_QUEUED');
    expect(assertPlanQuotaInTransaction).toHaveBeenCalledWith(
      h.tx,
      user.tenantId,
      'voters',
      2,
    );
    h.job.status = PersonImportStatus.COMPLETED;
    h.queue.enqueue.mockClear();
    expect((await h.service.execute(user, h.job.id)).status).toBe('COMPLETED');
    expect(h.queue.enqueue).not.toHaveBeenCalled();
  });
  it('notice changes block execution instead of recapturing consent', async () => {
    const h = harness();
    h.job.status = PersonImportStatus.READY;
    h.tx.personImportJob.findFirst.mockResolvedValue(h.job);
    h.legacy.loadImportContext.mockResolvedValue({
      noticeVersion: 'QA-v2',
      noticeActivatedAt: new Date(),
    });
    await expect(h.service.execute(user, h.job.id)).rejects.toThrow('Cambió');
    expect(h.tx.personImportJob.update).not.toHaveBeenCalled();
  });
  it('attributes execution to the actual administrator, not the file requester', async () => {
    const h = harness();
    h.job.status = PersonImportStatus.READY;
    h.tx.personImportJob.findFirst.mockResolvedValue(h.job);
    const secondAdmin = { ...user, userId: 'c423456789012345678901234' };
    await h.service.execute(secondAdmin, h.job.id);
    expect(h.tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: secondAdmin.userId,
          action: 'PERSON_IMPORT_EXECUTION_REQUESTED',
        }),
      }),
    );
  });
  it('invalid input files cannot be silently retried as valid data', async () => {
    const h = harness();
    h.job.status = PersonImportStatus.FAILED;
    h.job.lastErrorCode = 'INVALID_FILE';
    h.tx.personImportJob.findFirst.mockResolvedValue(h.job);
    await expect(h.service.retry(user, h.job.id)).rejects.toThrow('no permite');
    expect(h.queue.enqueue).not.toHaveBeenCalled();
  });
  it('workers do not process without acquiring a tenant-specific lease', async () => {
    const h = harness();
    h.tx.personImportJob.updateMany.mockResolvedValue({ count: 0 });
    await h.service.process(h.job.id, user.tenantId);
    expect(h.artifacts.withVerifiedCsv).not.toHaveBeenCalled();
    expect(h.tx.personImportJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: h.job.id,
          tenantId: user.tenantId,
          AND: expect.any(Array),
        }),
      }),
    );
  });
  it('revoked actor permissions stop the job, without logging source data or signed URLs', async () => {
    const h = harness();
    h.tx.personImportJob.findFirst.mockResolvedValue(h.job);
    h.legacy.loadImportContext.mockRejectedValue(
      new ForbiddenException('Permiso revocado'),
    );
    await h.service.process(h.job.id, user.tenantId);
    expect(h.tx.personImportJob.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: user.tenantId,
          leaseToken: expect.any(String),
        }),
        data: expect.objectContaining({
          status: 'FAILED',
          lastErrorCode: 'AUTHORIZATION_OR_QUOTA',
        }),
      }),
    );
    expect(h.artifacts.withVerifiedCsv).not.toHaveBeenCalled();
  });
});
