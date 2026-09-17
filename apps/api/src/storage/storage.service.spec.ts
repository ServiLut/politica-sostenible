import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import {
  PoliticalOperationMode,
  Role,
  StoredObjectStatus,
  StorageObjectModule,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { StorageModuleName } from './storage.constants';
import { StorageService } from './storage.service';
import type { SupabaseStorageGateway } from './supabase-storage.gateway';
import type { StorageIntegrityQueuePort } from './storage-integrity-queue.constants';
import {
  assertPlanQuotaInTransaction,
  ensureTenantSubscription,
} from '../auth/guards/plan-limits.guard';

jest.mock('../auth/guards/plan-limits.guard', () => ({
  assertPlanQuotaInTransaction: jest.fn().mockResolvedValue(undefined),
  ensureTenantSubscription: jest.fn().mockResolvedValue(undefined),
}));

const CONSENT_UPLOAD_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMPLIANCE_OFFICER,
] as const;

const CONSENT_DENIED_ROLES = Object.values(Role).filter(
  (role) =>
    !CONSENT_UPLOAD_ROLES.includes(
      role as (typeof CONSENT_UPLOAD_ROLES)[number],
    ),
);

describe('StorageService durable private-file authorization', () => {
  const user: AuthenticatedUser = {
    tenantId: 'tenant-a',
    userId: 'user-a',
    role: Role.ADMIN,
  };
  const financePath =
    'tenant-a/finance/7c8f80d8-66c5-4f3a-9745-b66219c13f74.pdf';
  const e14Path = 'tenant-a/e14/7c8f80d8-66c5-4f3a-9745-b66219c13f74.pdf';
  const consentPath =
    'tenant-a/consent/7c8f80d8-66c5-4f3a-9745-b66219c13f74.pdf';
  const scrutinyPath =
    'tenant-a/scrutiny/7c8f80d8-66c5-4f3a-9745-b66219c13f74.pdf';

  let currentRole: Role;
  let tenantMode: PoliticalOperationMode;
  let tenantType: TenantType;
  let gateway: {
    bucketName: string;
    createSignedUploadUrl: jest.Mock;
    createSignedDownloadUrl: jest.Mock;
    getObjectInfo: jest.Mock;
    removeObject: jest.Mock;
  };
  type StoredObjectDelegateMock = {
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    deleteMany: jest.Mock;
    updateMany: jest.Mock;
    count: jest.Mock;
    aggregate: jest.Mock;
  };
  type TransactionMock = {
    tenant: { findUnique: jest.Mock };
    user: { findFirst: jest.Mock };
    politicalDivision: { findMany: jest.Mock };
    storedObject: StoredObjectDelegateMock;
    auditEvent: { create: jest.Mock };
    financialEntry: { findFirst: jest.Mock };
    witnessReport: { findFirst: jest.Mock };
    scrutinyDocument: { findFirst: jest.Mock };
  };
  let transaction: TransactionMock;
  let prisma: TransactionMock & { $transaction: jest.Mock };
  let service: StorageService;
  let integrityQueue: { enqueue: jest.Mock; checkReady: jest.Mock };

  beforeEach(() => {
    currentRole = Role.ADMIN;
    tenantMode = PoliticalOperationMode.CAMPAIGN;
    tenantType = TenantType.CANDIDACY;
    gateway = {
      bucketName: 'private-campaign-files',
      createSignedUploadUrl: jest.fn().mockResolvedValue({
        signedUrl: 'https://storage.example/upload?token=signed',
        token: 'signed',
      }),
      createSignedDownloadUrl: jest.fn().mockResolvedValue({
        signedUrl: 'https://storage.example/read?token=signed',
      }),
      getObjectInfo: jest.fn().mockResolvedValue({
        name: financePath,
        size: 100,
        contentType: 'application/pdf',
        etag: 'etag-value',
      }),
      removeObject: jest.fn().mockResolvedValue(undefined),
    };

    const storedObject = {
      create: jest.fn().mockResolvedValue({ id: 'stored-a' }),
      findFirst: jest.fn().mockResolvedValue({
        id: 'stored-a',
        contentType: 'application/pdf',
        expectedSize: 100,
        expiresAt: new Date(Date.now() + 60_000),
        status: StoredObjectStatus.ISSUED,
      }),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      updateMany: jest.fn().mockImplementation(({ where }) =>
        Promise.resolve({
          count: where?.id === 'stored-a' && where?.expiresAt?.gt ? 1 : 0,
        }),
      ),
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue({
        _sum: { expectedSize: 0 },
      }),
    };
    transaction = {
      tenant: {
        findUnique: jest.fn().mockImplementation(() =>
          Promise.resolve({
            defaultMode: tenantMode,
            type: tenantType,
          }),
        ),
      },
      user: {
        findFirst: jest
          .fn()
          .mockImplementation(() =>
            Promise.resolve({ role: currentRole, divisionId: null }),
          ),
      },
      politicalDivision: { findMany: jest.fn().mockResolvedValue([]) },
      storedObject,
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
      financialEntry: { findFirst: jest.fn() },
      witnessReport: { findFirst: jest.fn() },
      scrutinyDocument: { findFirst: jest.fn() },
    };
    prisma = {
      ...transaction,
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    integrityQueue = {
      enqueue: jest.fn().mockResolvedValue(undefined),
      checkReady: jest.fn().mockResolvedValue(undefined),
    };
    service = new StorageService(
      gateway as unknown as SupabaseStorageGateway,
      prisma as unknown as PrismaService,
      integrityQueue as unknown as StorageIntegrityQueuePort,
    );
  });

  it.each([
    '../../secreto.pdf',
    '..\\..\\secreto.pdf',
    '%2e%2e%2fsecreto.pdf',
    '/absoluto.pdf',
  ])('rejects traversal before creating an authorization: %s', async (name) => {
    await expect(
      service.createUploadUrl(user, {
        module: StorageModuleName.FINANCE,
        fileName: name,
        contentType: 'application/pdf',
        size: 100,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.storedObject.create).not.toHaveBeenCalled();
    expect(gateway.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('reserves a canonical, expiring authorization before signing upload', async () => {
    const result = await service.createUploadUrl(user, {
      module: StorageModuleName.E14,
      fileName: 'Acta Mesa 42.JPG',
      contentType: 'image/jpeg',
      size: 2048,
    });

    expect(result.path).toMatch(/^tenant-a\/e14\/[0-9a-f-]{36}\.jpg$/);
    expect(transaction.storedObject.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        uploaderId: 'user-a',
        path: result.path,
        module: StorageObjectModule.E14,
        contentType: 'image/jpeg',
        expectedSize: 2048,
        expiresAt: expect.any(Date) as Date,
      }),
      select: { id: true },
    });
    expect(gateway.createSignedUploadUrl).toHaveBeenCalledWith(result.path);
  });

  it('binds an E-14 authorization and response metadata to the lowercase SHA-256', async () => {
    const contentSha256 = 'a'.repeat(64);
    const result = await service.createUploadUrl(user, {
      module: StorageModuleName.E14,
      fileName: 'acta.pdf',
      contentType: 'application/pdf',
      size: 100,
      contentSha256,
    });

    expect(result.metadata).toEqual({
      fileName: 'acta.pdf',
      contentType: 'application/pdf',
      size: 100,
      contentSha256,
    });
    expect(transaction.storedObject.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: user.tenantId,
        module: StorageObjectModule.E14,
        expectedSha256: contentSha256,
      }) as object,
      select: { id: true },
    });
    expect(
      JSON.stringify(transaction.auditEvent.create.mock.calls),
    ).not.toContain(contentSha256);
  });

  it('authorizes financial evidence with a SHA-256 bound to its StoredObject receipt', async () => {
    const contentSha256 = 'f'.repeat(64);
    const result = await service.createUploadUrl(user, {
      module: StorageModuleName.FINANCE,
      fileName: 'extracto-bancario.pdf',
      contentType: 'application/pdf',
      size: 100,
      contentSha256,
    });

    expect(result).toMatchObject({
      path: expect.stringMatching(
        /^tenant-a\/finance\/[0-9a-f-]{36}\.pdf$/,
      ) as string,
      metadata: {
        fileName: 'extracto-bancario.pdf',
        contentType: 'application/pdf',
        size: 100,
        contentSha256,
      },
    });
    expect(transaction.storedObject.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: user.tenantId,
        module: StorageObjectModule.FINANCE,
        expectedSha256: contentSha256,
      }) as object,
      select: { id: true },
    });
  });

  it('binds scrutiny evidence to a tenant path and exact SHA-256', async () => {
    const contentSha256 = 'b'.repeat(64);

    const result = await service.createUploadUrl(user, {
      module: StorageModuleName.SCRUTINY,
      fileName: 'Credencial oficial.PDF',
      contentType: 'application/pdf',
      size: 4_096,
      contentSha256,
    });

    expect(result).toMatchObject({
      path: expect.stringMatching(
        /^tenant-a\/scrutiny\/[0-9a-f-]{36}\.pdf$/,
      ) as string,
      metadata: {
        fileName: 'Credencial oficial.PDF',
        contentType: 'application/pdf',
        size: 4_096,
        contentSha256,
      },
    });
    expect(transaction.storedObject.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: user.tenantId,
        uploaderId: user.userId,
        module: StorageObjectModule.SCRUTINY,
        expectedSha256: contentSha256,
      }) as object,
      select: { id: true },
    });
  });

  it('does not accept client hash metadata for modules outside the integrity allowlist', async () => {
    await expect(
      service.createUploadUrl(user, {
        module: StorageModuleName.CONSENT,
        fileName: 'soporte.pdf',
        contentType: 'application/pdf',
        size: 100,
        contentSha256: 'a'.repeat(64),
      }),
    ).rejects.toThrow(/solo esta habilitada para evidencia electoral/);
    expect(transaction.storedObject.create).not.toHaveBeenCalled();
    expect(gateway.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it.each([TenantType.PARTY, TenantType.GSC])(
    'does not issue E-14 upload authorization to tenant type %s',
    async (type) => {
      tenantType = type;

      await expect(
        service.createUploadUrl(user, {
          module: StorageModuleName.E14,
          fileName: 'Acta Mesa 42.JPG',
          contentType: 'image/jpeg',
          size: 2_048,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(transaction.storedObject.create).not.toHaveBeenCalled();
      expect(gateway.createSignedUploadUrl).not.toHaveBeenCalled();
    },
  );

  it('issues a tenant-scoped signed consent upload and maps it to Prisma CONSENT', async () => {
    const result = await service.createUploadUrl(user, {
      module: StorageModuleName.CONSENT,
      fileName: 'Evidencia consentimiento.pdf',
      contentType: 'application/pdf',
      size: 2_048,
    });

    expect(result).toEqual(
      expect.objectContaining({
        bucket: 'private-campaign-files',
        path: expect.stringMatching(
          /^tenant-a\/consent\/[0-9a-f-]{36}\.pdf$/,
        ) as string,
        uploadUrl: 'https://storage.example/upload?token=signed',
        uploadToken: 'signed',
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
      }),
    );
    expect(result.path).not.toContain('Evidencia');
    expect(transaction.storedObject.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        uploaderId: 'user-a',
        path: result.path,
        module: StorageObjectModule.CONSENT,
        contentType: 'application/pdf',
        expectedSize: 2_048,
      }),
      select: { id: true },
    });
    expect(gateway.createSignedUploadUrl).toHaveBeenCalledWith(result.path);
  });

  it('issues only an ADMIN tenant-scoped JSON authorization for electoral catalogs', async () => {
    const result = await service.createUploadUrl(user, {
      module: StorageModuleName.ELECTORAL_CATALOG,
      fileName: 'divipole-oficial.json',
      contentType: 'application/json',
      size: 25 * 1024 * 1024,
    });

    expect(result.path).toMatch(
      /^tenant-a\/electoral-catalog\/[0-9a-f-]{36}\.json$/,
    );
    expect(result.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(transaction.storedObject.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        uploaderId: 'user-a',
        path: result.path,
        module: StorageObjectModule.ELECTORAL_CATALOG,
        contentType: 'application/json',
        expectedSize: 25 * 1024 * 1024,
      }),
      select: { id: true },
    });
  });

  it('rejects catalog files with another MIME, excessive size or a non-ADMIN database role', async () => {
    await expect(
      service.createUploadUrl(user, {
        module: StorageModuleName.ELECTORAL_CATALOG,
        fileName: 'divipole.csv',
        contentType: 'text/csv',
        size: 100,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createUploadUrl(user, {
        module: StorageModuleName.ELECTORAL_CATALOG,
        fileName: 'divipole.json',
        contentType: 'application/json',
        size: 25 * 1024 * 1024 + 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    currentRole = Role.AUDITOR;
    await expect(
      service.createUploadUrl(user, {
        module: StorageModuleName.ELECTORAL_CATALOG,
        fileName: 'divipole.json',
        contentType: 'application/json',
        size: 100,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction.storedObject.create).not.toHaveBeenCalled();
    expect(gateway.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it.each(CONSENT_UPLOAD_ROLES)(
    'allows the current database role %s to upload consent evidence',
    async (role) => {
      currentRole = role;

      await expect(
        service.createUploadUrl(user, {
          module: StorageModuleName.CONSENT,
          fileName: 'evidencia.pdf',
          contentType: 'application/pdf',
          size: 100,
        }),
      ).resolves.toEqual(
        expect.objectContaining({
          path: expect.stringContaining('tenant-a/consent/') as string,
        }),
      );
      expect(gateway.createSignedUploadUrl).toHaveBeenCalledTimes(1);
    },
  );

  it.each(CONSENT_DENIED_ROLES)(
    'denies the current database role %s for consent evidence',
    async (role) => {
      currentRole = role;

      await expect(
        service.createUploadUrl(user, {
          module: StorageModuleName.CONSENT,
          fileName: 'evidencia.pdf',
          contentType: 'application/pdf',
          size: 100,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(transaction.storedObject.create).not.toHaveBeenCalled();
      expect(gateway.createSignedUploadUrl).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      fileName: 'evidencia.jpg',
      contentType: 'image/jpeg',
      size: 100,
    },
    {
      fileName: 'evidencia.png',
      contentType: 'image/png',
      size: 100,
    },
    {
      fileName: 'evidencia.webp',
      contentType: 'image/webp',
      size: 100,
    },
    {
      fileName: 'evidencia.pdf',
      contentType: 'application/pdf',
      size: 15 * 1024 * 1024,
    },
  ])(
    'accepts consent MIME $contentType with its matching extension',
    async ({ fileName, contentType, size }) => {
      const result = await service.createUploadUrl(user, {
        module: StorageModuleName.CONSENT,
        fileName,
        contentType,
        size,
      });

      expect(result.headers).toEqual({ 'Content-Type': contentType });
      expect(transaction.storedObject.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          module: StorageObjectModule.CONSENT,
          contentType,
          expectedSize: size,
        }),
        select: { id: true },
      });
    },
  );

  it.each([
    {
      label: 'a finance-only CSV MIME',
      fileName: 'evidencia.csv',
      contentType: 'text/csv',
      size: 100,
    },
    {
      label: 'an extension that does not match its MIME',
      fileName: 'evidencia.pdf',
      contentType: 'image/jpeg',
      size: 100,
    },
    {
      label: 'a file over the 15 MiB consent limit',
      fileName: 'evidencia.pdf',
      contentType: 'application/pdf',
      size: 15 * 1024 * 1024 + 1,
    },
  ])('rejects $label', async ({ fileName, contentType, size }) => {
    await expect(
      service.createUploadUrl(user, {
        module: StorageModuleName.CONSENT,
        fileName,
        contentType,
        size,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.storedObject.create).not.toHaveBeenCalled();
    expect(gateway.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('claims and removes an old confirmed orphan before issuing more storage', async () => {
    const orphanPath = 'tenant-a/e14/123e4567-e89b-42d3-a456-426614174000.pdf';
    prisma.storedObject.findMany.mockResolvedValue([
      {
        id: 'orphan-a',
        status: StoredObjectStatus.CONFIRMED,
        path: orphanPath,
      },
    ]);
    prisma.storedObject.updateMany.mockResolvedValueOnce({ count: 1 });

    await service.createUploadUrl(user, {
      module: StorageModuleName.E14,
      fileName: 'acta.pdf',
      contentType: 'application/pdf',
      size: 100,
    });

    expect(ensureTenantSubscription).toHaveBeenCalledWith(prisma, 'tenant-a');
    expect(assertPlanQuotaInTransaction).toHaveBeenCalledWith(
      transaction,
      'tenant-a',
      'storage',
      100,
    );

    expect(prisma.storedObject.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'orphan-a',
          tenantId: 'tenant-a',
          status: StoredObjectStatus.CONFIRMED,
          consumedAt: null,
        }) as object,
        data: {
          status: StoredObjectStatus.EXPIRED,
          actualSize: null,
          etag: null,
          confirmedAt: null,
        },
      }),
    );
    expect(gateway.removeObject).toHaveBeenCalledWith(orphanPath);
    expect(prisma.storedObject.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'orphan-a',
        tenantId: 'tenant-a',
        status: StoredObjectStatus.EXPIRED,
        consumedAt: null,
      },
    });
  });

  it('uses the active database role rather than a forged JWT role', async () => {
    currentRole = Role.AUDITOR;
    await expect(
      service.createUploadUrl(user, {
        module: StorageModuleName.FINANCE,
        fileName: 'soporte.pdf',
        contentType: 'application/pdf',
        size: 100,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(gateway.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('enforces hourly authorization quotas in the database boundary', async () => {
    transaction.storedObject.count
      .mockResolvedValueOnce(30)
      .mockResolvedValueOnce(30);
    await expect(
      service.createUploadUrl(user, {
        module: StorageModuleName.FINANCE,
        fileName: 'soporte.pdf',
        contentType: 'application/pdf',
        size: 100,
      }),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
    expect(transaction.storedObject.create).not.toHaveBeenCalled();
  });

  it('retries a serializable reservation conflict without signing twice', async () => {
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2034' });

    await service.createUploadUrl(user, {
      module: StorageModuleName.FINANCE,
      fileName: 'soporte.pdf',
      contentType: 'application/pdf',
      size: 100,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(gateway.createSignedUploadUrl).toHaveBeenCalledTimes(1);
  });

  it('rejects a cross-tenant completion before querying the object', async () => {
    await expect(
      service.completeUpload(user, {
        module: StorageModuleName.FINANCE,
        path: financePath.replace('tenant-a', 'tenant-b'),
        metadata: {
          fileName: 'prueba.pdf',
          contentType: 'application/pdf',
          size: 100,
        },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.storedObject.findFirst).not.toHaveBeenCalled();
    expect(gateway.getObjectInfo).not.toHaveBeenCalled();
  });

  it('requires an exact, uploader-owned authorization to complete', async () => {
    prisma.storedObject.findFirst.mockResolvedValue(null);
    await expect(
      service.completeUpload(user, {
        module: StorageModuleName.FINANCE,
        path: financePath,
        metadata: {
          fileName: 'prueba.pdf',
          contentType: 'application/pdf',
          size: 100,
        },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(gateway.getObjectInfo).not.toHaveBeenCalled();
  });

  it('confirms matching storage metadata with an atomic transition and audit', async () => {
    const result = await service.completeUpload(user, {
      module: StorageModuleName.FINANCE,
      path: financePath,
      metadata: {
        fileName: 'prueba.pdf',
        contentType: 'application/pdf',
        size: 100,
      },
    });

    expect(result).toEqual({
      confirmed: true,
      path: financePath,
      module: StorageModuleName.FINANCE,
      contentIntegrity: 'NOT_PROVIDED',
    });
    expect(transaction.storedObject.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'stored-a',
          tenantId: 'tenant-a',
          uploaderId: 'user-a',
          status: StoredObjectStatus.ISSUED,
        }) as object,
        data: expect.objectContaining({
          status: StoredObjectStatus.CONFIRMED,
          actualSize: 100,
          etag: 'etag-value',
        }) as object,
      }),
    );
    expect(transaction.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'STORAGE_UPLOAD_CONFIRMED',
        resourceId: 'stored-a',
      }),
    });
  });

  it('confirms E-14 only when authorization, Storage metadata and DTO carry the same hash', async () => {
    const contentSha256 = 'b'.repeat(64);
    prisma.storedObject.findFirst.mockResolvedValue({
      id: 'stored-a',
      contentType: 'application/pdf',
      expectedSize: 100,
      expectedSha256: contentSha256,
      expiresAt: new Date(Date.now() + 60_000),
      status: StoredObjectStatus.ISSUED,
    });
    gateway.getObjectInfo.mockResolvedValue({
      name: e14Path,
      size: 100,
      contentType: 'application/pdf',
      etag: 'etag-e14',
      metadata: { contentSha256 },
    });

    await expect(
      service.completeUpload(user, {
        module: StorageModuleName.E14,
        path: e14Path,
        metadata: {
          fileName: 'acta.pdf',
          contentType: 'application/pdf',
          size: 100,
          contentSha256,
        },
      }),
    ).resolves.toEqual({
      confirmed: true,
      path: e14Path,
      module: StorageModuleName.E14,
      contentIntegrity: 'CLIENT_DECLARED_UNVERIFIED',
    });
    expect(transaction.storedObject.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reportedSha256: contentSha256,
          etag: 'etag-e14',
        }) as object,
      }),
    );
  });

  it('rejects an E-14 when Storage omits or changes the declared hash', async () => {
    const contentSha256 = 'c'.repeat(64);
    prisma.storedObject.findFirst.mockResolvedValue({
      id: 'stored-a',
      contentType: 'application/pdf',
      expectedSize: 100,
      expectedSha256: contentSha256,
      expiresAt: new Date(Date.now() + 60_000),
      status: StoredObjectStatus.ISSUED,
    });
    gateway.getObjectInfo.mockResolvedValue({
      name: e14Path,
      size: 100,
      contentType: 'application/pdf',
      etag: 'etag-e14',
      metadata: { contentSha256: 'd'.repeat(64) },
    });

    await expect(
      service.completeUpload(user, {
        module: StorageModuleName.E14,
        path: e14Path,
        metadata: {
          fileName: 'acta.pdf',
          contentType: 'application/pdf',
          size: 100,
          contentSha256,
        },
      }),
    ).rejects.toThrow(/huella SHA-256.*no coincide/);
    expect(transaction.storedObject.updateMany).not.toHaveBeenCalled();
  });

  it('completes only a tenant-owned consent path using the CONSENT mapping', async () => {
    const result = await service.completeUpload(user, {
      module: StorageModuleName.CONSENT,
      path: consentPath,
      metadata: {
        fileName: 'evidencia.pdf',
        contentType: 'application/pdf',
        size: 100,
      },
    });

    expect(result).toEqual({
      confirmed: true,
      path: consentPath,
      module: StorageModuleName.CONSENT,
      contentIntegrity: 'NOT_PROVIDED',
    });
    expect(prisma.storedObject.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          uploaderId: 'user-a',
          path: consentPath,
          module: StorageObjectModule.CONSENT,
        }) as object,
      }),
    );
  });

  it('expires a stale authorization without contacting Storage', async () => {
    prisma.storedObject.findFirst.mockResolvedValue({
      id: 'stored-a',
      contentType: 'application/pdf',
      expectedSize: 100,
      expiresAt: new Date(Date.now() - 1_000),
      status: StoredObjectStatus.ISSUED,
    });
    await expect(
      service.completeUpload(user, {
        module: StorageModuleName.FINANCE,
        path: financePath,
        metadata: {
          fileName: 'prueba.pdf',
          contentType: 'application/pdf',
          size: 100,
        },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(gateway.getObjectInfo).not.toHaveBeenCalled();
  });

  it('issues a short-lived audited finance read by resource, never by raw path', async () => {
    const financePath =
      'tenant-a/finance/7c8f80d8-66c5-4f3a-9745-b66219c13f74.pdf';
    prisma.financialEntry.findFirst.mockResolvedValue({
      evidenceUrl: financePath,
    });
    prisma.storedObject.findFirst.mockResolvedValue({ id: 'stored-a' });

    const result = await service.createDownloadUrl(user, {
      module: StorageModuleName.FINANCE,
      resourceId: 'entry-a',
    });

    expect(gateway.createSignedDownloadUrl).toHaveBeenCalledWith(
      financePath,
      300,
    );
    expect(result).toEqual({
      url: 'https://storage.example/read?token=signed',
      expiresAt: expect.any(String) as string,
    });
    expect(result).not.toHaveProperty('path');
    expect(prisma.storedObject.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        path: financePath,
        module: StorageObjectModule.FINANCE,
        status: StoredObjectStatus.CONSUMED,
        consumedByType: 'FinancialEntry',
        consumedById: 'entry-a',
      },
      select: { id: true },
    });
  });

  it('issues a scrutiny read only for the tenant resource bound to a consumed object', async () => {
    prisma.scrutinyDocument.findFirst.mockResolvedValue({
      storagePath: scrutinyPath,
    });
    prisma.storedObject.findFirst.mockResolvedValue({ id: 'stored-scrutiny' });

    const result = await service.createDownloadUrl(user, {
      module: StorageModuleName.SCRUTINY,
      resourceId: 'scrutiny-document-a',
    });

    expect(prisma.scrutinyDocument.findFirst).toHaveBeenCalledWith({
      where: { id: 'scrutiny-document-a', tenantId: user.tenantId },
      select: { storagePath: true },
    });
    expect(prisma.storedObject.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: user.tenantId,
        path: scrutinyPath,
        module: StorageObjectModule.SCRUTINY,
        status: StoredObjectStatus.CONSUMED,
        consumedByType: 'ScrutinyDocument',
        consumedById: 'scrutiny-document-a',
      },
      select: { id: true },
    });
    expect(gateway.createSignedDownloadUrl).toHaveBeenCalledWith(
      scrutinyPath,
      300,
    );
    expect(result).toEqual({
      url: 'https://storage.example/read?token=signed',
      expiresAt: expect.any(String) as string,
    });
  });

  it('fails closed before resource lookup when CONSENT is requested for download', async () => {
    await expect(
      service.createDownloadUrl(user, {
        module: StorageModuleName.CONSENT,
        resourceId: 'consent-a',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.financialEntry.findFirst).not.toHaveBeenCalled();
    expect(prisma.witnessReport.findFirst).not.toHaveBeenCalled();
    expect(prisma.storedObject.findFirst).not.toHaveBeenCalled();
    expect(gateway.createSignedDownloadUrl).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it('blocks campaign-only modules in public-office mode', async () => {
    tenantMode = PoliticalOperationMode.PUBLIC_OFFICE;
    tenantType = TenantType.PUBLIC_OFFICE;
    await expect(
      service.createUploadUrl(user, {
        module: StorageModuleName.FINANCE,
        fileName: 'soporte.pdf',
        contentType: 'application/pdf',
        size: 100,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(gateway.createSignedUploadUrl).not.toHaveBeenCalled();
  });
});
