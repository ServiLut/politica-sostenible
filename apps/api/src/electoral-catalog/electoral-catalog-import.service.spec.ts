import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ElectoralCatalogImportStatus,
  PoliticalOperationMode,
  PoliticalOperationStage,
  Role,
  StorageObjectModule,
  StoredObjectStatus,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import type { PrismaService } from '../prisma/prisma.service';
import { OperationClosedForMutationException } from '../common/utils/operation-lifecycle-fence.util';
import { ElectoralCatalogArtifactService } from './electoral-catalog-artifact.service';
import { ElectoralCatalogImportService } from './electoral-catalog-import.service';
import type { ElectoralCatalogQueuePort } from './electoral-catalog-queue.constants';
import { ElectoralCatalogService } from './electoral-catalog.service';
import type { CreateElectoralCatalogImportDto } from './dto/electoral-catalog-import.dto';

describe('ElectoralCatalogImportService', () => {
  const user: AuthenticatedUser = {
    userId: 'admin-a',
    tenantId: 'tenant-a',
    role: Role.ADMIN,
  };
  const path =
    'tenant-a/electoral-catalog/7c8f80d8-66c5-4f3a-9745-b66219c13f74.json';
  const dto: CreateElectoralCatalogImportDto = {
    clientRequestId: '7c8f80d8-66c5-4f3a-9745-b66219c13f74',
    catalogKey: 'RNEC-PRESIDENCIA-2026',
    sourceUrl: 'https://www.registraduria.gov.co/fuente-oficial.json',
    sourceDataset: 'DIVIPOLE Presidencia 2026',
    sourceCutoffAt: '2026-09-08T12:30:00.000Z',
    electionDate: '2026-05-31',
    authorizationReference: 'Autorizacion escrita RNEC 2026-001',
    licenseDeclaration: 'Uso autorizado para operacion electoral interna',
    sourceArtifactPath: path,
    expectedContentSha256: 'a'.repeat(64),
  };
  const normalized = {
    catalogKey: dto.catalogKey,
    sourceUrl: dto.sourceUrl,
    sourceDataset: dto.sourceDataset,
    sourceCutoffAt: new Date(dto.sourceCutoffAt),
    electionDate: new Date('2026-05-31T00:00:00.000Z'),
    authorizationReference: dto.authorizationReference,
    licenseDeclaration: dto.licenseDeclaration,
    sourceArtifactPath: path,
  };

  type MockDb = {
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
    tenant: { findUnique: jest.Mock };
    user: { findFirst: jest.Mock };
    operationProfile: { findUnique: jest.Mock };
    storedObject: { findFirst: jest.Mock; updateMany: jest.Mock };
    electoralCatalogImportJob: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    auditEvent: { create: jest.Mock };
  };

  let prisma: MockDb;
  let catalogs: {
    validateRnecStageMetadata: jest.Mock;
    stageRnecTreeContent: jest.Mock;
  };
  let artifacts: { loadVerifiedJson: jest.Mock };
  let queue: { enqueue: jest.Mock; checkReady: jest.Mock };
  let service: ElectoralCatalogImportService;
  let createdJob: Record<string, unknown>;

  beforeEach(() => {
    createdJob = {
      id: 'import-a',
      tenantId: user.tenantId,
      clientRequestId: dto.clientRequestId,
      payloadSha256: '',
      status: ElectoralCatalogImportStatus.QUEUED,
      catalogKey: dto.catalogKey,
      sourceUrl: dto.sourceUrl,
      sourceDataset: dto.sourceDataset,
      sourceCutoffAt: normalized.sourceCutoffAt,
      electionDate: normalized.electionDate,
      authorizationReference: dto.authorizationReference,
      licenseDeclaration: dto.licenseDeclaration,
      sourceArtifactPath: path,
      expectedContentSha256: dto.expectedContentSha256,
      requestedById: user.userId,
      releaseId: null,
      attempts: 0,
      startedAt: null,
      completedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: new Date('2026-09-09T00:00:00.000Z'),
      updatedAt: new Date('2026-09-09T00:00:00.000Z'),
    };
    prisma = {
      $transaction: jest.fn(),
      $queryRaw: jest.fn().mockResolvedValue([{ stage: 'CAMPAIGN' }]),
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: user.userId }) },
      operationProfile: {
        findUnique: jest.fn().mockResolvedValue({
          electionDate: new Date('2026-05-31T05:00:00.000Z'),
        }),
      },
      storedObject: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'stored-a',
          contentType: 'application/json',
          expectedSize: 100,
          actualSize: 100,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      electoralCatalogImportJob: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => {
          createdJob = {
            ...createdJob,
            ...data,
            payloadSha256: data.payloadSha256,
          };
          return Promise.resolve(createdJob);
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
    };
    prisma.$transaction.mockImplementation(
      (callback: (transaction: MockDb) => unknown) => callback(prisma),
    );
    catalogs = {
      validateRnecStageMetadata: jest
        .fn()
        .mockImplementation((_tenantId, metadata) => ({
          ...normalized,
          sourceDataset: metadata.sourceDataset,
        })),
      stageRnecTreeContent: jest.fn().mockResolvedValue({
        release: { id: 'release-a' },
        created: true,
      }),
    };
    artifacts = {
      loadVerifiedJson: jest.fn().mockResolvedValue('{"departments":[]}'),
    };
    queue = {
      enqueue: jest.fn().mockResolvedValue(undefined),
      checkReady: jest.fn().mockResolvedValue(undefined),
    };
    service = new ElectoralCatalogImportService(
      prisma as unknown as PrismaService,
      catalogs as unknown as ElectoralCatalogService,
      artifacts as unknown as ElectoralCatalogArtifactService,
      queue as unknown as ElectoralCatalogQueuePort,
    );
  });

  it('durably creates, consumes and audits a tenant-owned confirmed JSON before enqueueing', async () => {
    const result = await service.create(user, dto);

    expect(result).toMatchObject({ created: true, queued: true });
    expect(result.job).not.toHaveProperty('payloadSha256');
    expect(prisma.storedObject.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: user.tenantId,
        uploaderId: user.userId,
        path,
        module: StorageObjectModule.ELECTORAL_CATALOG,
        status: StoredObjectStatus.CONFIRMED,
        consumedAt: null,
      }),
      select: expect.any(Object),
    });
    expect(prisma.storedObject.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: user.tenantId,
        path,
        uploaderId: user.userId,
        status: StoredObjectStatus.CONFIRMED,
      }),
      data: expect.objectContaining({
        status: StoredObjectStatus.CONSUMED,
        consumedByType: 'ElectoralCatalogImportJob',
        consumedById: 'import-a',
      }),
    });
    expect(queue.enqueue).toHaveBeenCalledWith({
      importJobId: 'import-a',
      tenantId: user.tenantId,
    });
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: user.tenantId,
        action: 'ELECTORAL_CATALOG_IMPORT_REQUESTED',
      }),
    });
  });

  it('uses clientRequestId idempotently and rejects payload substitution', async () => {
    await service.create(user, dto);
    const existing = { ...createdJob };
    prisma.electoralCatalogImportJob.findFirst.mockResolvedValue(existing);
    prisma.electoralCatalogImportJob.create.mockClear();
    prisma.storedObject.updateMany.mockClear();
    queue.enqueue.mockClear();

    const repeated = await service.create(user, dto);
    expect(repeated).toMatchObject({ created: false, queued: true });
    expect(prisma.electoralCatalogImportJob.create).not.toHaveBeenCalled();
    expect(prisma.storedObject.updateMany).not.toHaveBeenCalled();
    expect(queue.enqueue).toHaveBeenCalledTimes(1);

    await expect(
      service.create(user, { ...dto, sourceDataset: 'Payload sustituido' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('reports a completed idempotent request as not queued', async () => {
    await service.create(user, dto);
    prisma.electoralCatalogImportJob.findFirst.mockResolvedValue({
      ...createdJob,
      status: ElectoralCatalogImportStatus.SUCCEEDED,
      releaseId: 'release-a',
    });
    queue.enqueue.mockClear();

    await expect(service.create(user, dto)).resolves.toMatchObject({
      created: false,
      queued: false,
      job: { status: ElectoralCatalogImportStatus.SUCCEEDED },
    });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('rejects invalid provenance, election-date drift and an unowned or changed object', async () => {
    catalogs.validateRnecStageMetadata.mockReturnValueOnce({
      ...normalized,
      authorizationReference: null,
    });
    await expect(service.create(user, dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    prisma.operationProfile.findUnique.mockResolvedValueOnce({
      electionDate: new Date('2026-06-01T05:00:00.000Z'),
    });
    await expect(service.create(user, dto)).rejects.toBeInstanceOf(
      ConflictException,
    );

    prisma.storedObject.findFirst.mockResolvedValueOnce(null);
    await expect(service.create(user, dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('fails closed for an inactive actor or non-campaign tenant', async () => {
    prisma.user.findFirst.mockResolvedValueOnce(null);
    await expect(service.create(user, dto)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    prisma.tenant.findUnique.mockResolvedValueOnce({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
      type: TenantType.PUBLIC_OFFICE,
    });
    await expect(service.create(user, dto)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('keeps the request durable when Redis is unavailable and returns a safe 503', async () => {
    queue.enqueue.mockRejectedValueOnce(
      new ServiceUnavailableException('La cola no esta disponible'),
    );

    await expect(service.create(user, dto)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(prisma.electoralCatalogImportJob.create).toHaveBeenCalledTimes(1);
    expect(prisma.storedObject.updateMany).toHaveBeenCalledTimes(1);
  });

  it('lists and reads only within the JWT tenant after revalidating the reviewer', async () => {
    prisma.electoralCatalogImportJob.findMany.mockResolvedValueOnce([
      createdJob,
    ]);
    prisma.electoralCatalogImportJob.findFirst.mockResolvedValueOnce(
      createdJob,
    );

    await service.list(
      { ...user, role: Role.AUDITOR },
      { status: ElectoralCatalogImportStatus.FAILED, limit: 5 },
    );
    await service.detail({ ...user, role: Role.AUDITOR }, 'import-a');

    expect(prisma.electoralCatalogImportJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: user.tenantId,
          status: ElectoralCatalogImportStatus.FAILED,
        },
        take: 5,
      }),
    );
    expect(prisma.electoralCatalogImportJob.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'import-a', tenantId: user.tenantId },
      }),
    );
  });

  it('does not disclose whether a job belongs to another tenant', async () => {
    prisma.electoralCatalogImportJob.findFirst.mockResolvedValueOnce(null);

    await expect(service.detail(user, 'tenant-b-job')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('claims a durable job, revalidates authority/receipt, stages and records success', async () => {
    const queued = {
      ...createdJob,
      status: ElectoralCatalogImportStatus.QUEUED,
    };
    prisma.electoralCatalogImportJob.findFirst
      .mockResolvedValueOnce(queued)
      .mockResolvedValueOnce(queued);

    await expect(service.process('import-a', user.tenantId)).resolves.toEqual({
      releaseId: 'release-a',
      noOp: false,
    });

    expect(prisma.electoralCatalogImportJob.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'import-a', tenantId: user.tenantId },
      }),
    );
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: user.userId,
        tenantId: user.tenantId,
        role: Role.ADMIN,
        isActive: true,
      }),
      select: { id: true },
    });
    expect(prisma.storedObject.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: user.tenantId,
        path,
        status: StoredObjectStatus.CONSUMED,
        consumedByType: 'ElectoralCatalogImportJob',
        consumedById: 'import-a',
      }),
      select: expect.any(Object),
    });
    expect(artifacts.loadVerifiedJson).toHaveBeenCalledWith(
      path,
      100,
      dto.expectedContentSha256,
    );
    expect(catalogs.stageRnecTreeContent).toHaveBeenCalledWith(
      { userId: user.userId, tenantId: user.tenantId, role: Role.ADMIN },
      expect.objectContaining({ sourceArtifactPath: path }),
      '{"departments":[]}',
    );
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'ELECTORAL_CATALOG_IMPORT_SUCCEEDED',
        tenantId: user.tenantId,
      }),
    });
  });

  it('is a no-op for a completed durable job', async () => {
    prisma.electoralCatalogImportJob.findFirst.mockResolvedValueOnce({
      ...createdJob,
      status: ElectoralCatalogImportStatus.SUCCEEDED,
      releaseId: 'release-a',
    });

    await expect(service.process('import-a', user.tenantId)).resolves.toEqual({
      releaseId: 'release-a',
      noOp: true,
    });
    expect(prisma.electoralCatalogImportJob.updateMany).not.toHaveBeenCalled();
    expect(artifacts.loadVerifiedJson).not.toHaveBeenCalled();
  });

  it('does not claim or download a queued job after the operation is CLOSED', async () => {
    const queued = {
      ...createdJob,
      status: ElectoralCatalogImportStatus.QUEUED,
    };
    prisma.electoralCatalogImportJob.findFirst.mockResolvedValueOnce(queued);
    prisma.$queryRaw
      .mockReset()
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([{ stage: PoliticalOperationStage.CLOSED }]);

    await expect(
      service.process('import-a', user.tenantId),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'OPERATION_CLOSED' }),
    });
    expect(prisma.electoralCatalogImportJob.updateMany).not.toHaveBeenCalled();
    expect(artifacts.loadVerifiedJson).not.toHaveBeenCalled();
    expect(catalogs.stageRnecTreeContent).not.toHaveBeenCalled();
  });

  it('records a safe terminal failure when closure wins after claim but before staging', async () => {
    const queued = {
      ...createdJob,
      status: ElectoralCatalogImportStatus.QUEUED,
    };
    prisma.electoralCatalogImportJob.findFirst
      .mockResolvedValueOnce(queued)
      .mockResolvedValueOnce(queued);
    catalogs.stageRnecTreeContent.mockRejectedValueOnce(
      new OperationClosedForMutationException(),
    );

    await expect(service.process('import-a', user.tenantId)).rejects.toThrow(
      'se detuvo porque la operacion fue cerrada',
    );
    const failureCall =
      prisma.electoralCatalogImportJob.updateMany.mock.calls.find(
        ([argument]) =>
          argument.data?.status === ElectoralCatalogImportStatus.FAILED,
      );
    expect(failureCall?.[0].data).toMatchObject({
      status: ElectoralCatalogImportStatus.FAILED,
      releaseId: null,
      lastErrorCode: 'OPERATION_CLOSED',
    });
  });

  it('records a safe classified failure and never persists internal secrets', async () => {
    const queued = {
      ...createdJob,
      status: ElectoralCatalogImportStatus.QUEUED,
    };
    prisma.electoralCatalogImportJob.findFirst
      .mockResolvedValueOnce(queued)
      .mockResolvedValueOnce(queued);
    artifacts.loadVerifiedJson.mockRejectedValueOnce(
      new Error('postgres://admin:secret-password@database'),
    );

    await expect(service.process('import-a', user.tenantId)).rejects.toThrow(
      'sin exponer detalles internos',
    );
    const failureCall =
      prisma.electoralCatalogImportJob.updateMany.mock.calls.find(
        ([argument]) =>
          argument.data?.status === ElectoralCatalogImportStatus.FAILED,
      );
    expect(failureCall?.[0].data).toMatchObject({
      status: ElectoralCatalogImportStatus.FAILED,
      lastErrorCode: 'CATALOG_IMPORT_INTERNAL_ERROR',
    });
    expect(JSON.stringify(failureCall)).not.toContain('secret-password');
  });

  it('requeues FAILED jobs with a tenant-scoped compare-and-set transition', async () => {
    prisma.electoralCatalogImportJob.findFirst.mockResolvedValueOnce({
      ...createdJob,
      status: ElectoralCatalogImportStatus.FAILED,
      attempts: 2,
      startedAt: new Date(),
      completedAt: new Date(),
      lastErrorCode: 'HTTP_400',
      lastErrorMessage: 'Entrada invalida',
    });

    const result = await service.retry(user, 'import-a');

    expect(result).toMatchObject({ queued: true, noOp: false });
    expect(prisma.electoralCatalogImportJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'import-a',
          tenantId: user.tenantId,
          status: ElectoralCatalogImportStatus.FAILED,
          attempts: 2,
        }),
        data: expect.objectContaining({
          status: ElectoralCatalogImportStatus.QUEUED,
        }),
      }),
    );
    expect(queue.enqueue).toHaveBeenCalledWith({
      importJobId: 'import-a',
      tenantId: user.tenantId,
    });
  });
});
