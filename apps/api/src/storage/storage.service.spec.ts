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

describe('StorageService durable private-file authorization', () => {
  const user: AuthenticatedUser = {
    tenantId: 'tenant-a',
    userId: 'user-a',
    role: Role.ADMIN,
  };
  const financePath =
    'tenant-a/finance/7c8f80d8-66c5-4f3a-9745-b66219c13f74.pdf';

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
  let transaction: Record<string, any>;
  let prisma: Record<string, any>;
  let service: StorageService;

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
    };
    prisma = {
      ...transaction,
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    service = new StorageService(
      gateway as unknown as SupabaseStorageGateway,
      prisma as unknown as PrismaService,
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
