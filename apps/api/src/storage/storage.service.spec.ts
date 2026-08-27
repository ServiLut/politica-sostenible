import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  PoliticalOperationMode,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { StorageModuleName } from './storage.constants';
import { StorageService } from './storage.service';
import type { SupabaseStorageGateway } from './supabase-storage.gateway';

describe('StorageService', () => {
  const user: AuthenticatedUser = {
    tenantId: 'tenant-a',
    userId: 'user-a',
    role: Role.ADMIN,
  };

  let gateway: {
    bucketName: string;
    createSignedUploadUrl: jest.Mock;
    getObjectInfo: jest.Mock;
  };
  let service: StorageService;
  let tenantFindUnique: jest.Mock;
  let auditCreate: jest.Mock;

  beforeEach(() => {
    gateway = {
      bucketName: 'private-campaign-files',
      createSignedUploadUrl: jest.fn(),
      getObjectInfo: jest.fn(),
    };
    tenantFindUnique = jest.fn().mockResolvedValue({
      defaultMode: PoliticalOperationMode.CAMPAIGN,
      type: TenantType.CANDIDACY,
    });
    auditCreate = jest.fn().mockResolvedValue({ id: 'upload-receipt-a' });
    service = new StorageService(
      gateway as unknown as SupabaseStorageGateway,
      {
        tenant: { findUnique: tenantFindUnique },
        auditEvent: { create: auditCreate },
      } as unknown as PrismaService,
    );
  });

  it.each([
    '../../secreto.pdf',
    '..\\..\\secreto.pdf',
    '%2e%2e%2fsecreto.pdf',
    '/absoluto.pdf',
  ])('rejects path traversal in a file name: %s', async (fileName) => {
    await expect(
      service.createUploadUrl(user, {
        module: StorageModuleName.FINANCE,
        fileName,
        contentType: 'application/pdf',
        size: 100,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(gateway.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('rejects completion of a cross-tenant path before querying Storage', async () => {
    await expect(
      service.completeUpload(user, {
        module: StorageModuleName.EVIDENCE,
        path: 'tenant-b/evidence/7c8f80d8-66c5-4f3a-9745-b66219c13f74.pdf',
        metadata: {
          fileName: 'prueba.pdf',
          contentType: 'application/pdf',
          size: 100,
        },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(gateway.getObjectInfo).not.toHaveBeenCalled();
  });

  it('rejects traversal hidden behind an otherwise valid tenant prefix', async () => {
    await expect(
      service.completeUpload(user, {
        module: StorageModuleName.EVIDENCE,
        path: 'tenant-a/evidence/../../tenant-b/evidence/prueba.pdf',
        metadata: {
          fileName: 'prueba.pdf',
          contentType: 'application/pdf',
          size: 100,
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(gateway.getObjectInfo).not.toHaveBeenCalled();
  });

  it('builds a canonical tenant path and never enables upsert itself', async () => {
    gateway.createSignedUploadUrl.mockResolvedValue({
      signedUrl: 'https://storage.example/upload?token=signed',
      token: 'signed',
    });

    const result = await service.createUploadUrl(user, {
      module: StorageModuleName.E14,
      fileName: 'Acta Mesa 42.JPG',
      contentType: 'image/jpeg',
      size: 2048,
    });

    expect(result.path).toMatch(/^tenant-a\/e14\/[0-9a-f-]{36}\.jpg$/);
    expect(gateway.createSignedUploadUrl).toHaveBeenCalledWith(result.path);
    expect(result).toMatchObject({
      bucket: 'private-campaign-files',
      uploadUrl: 'https://storage.example/upload?token=signed',
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
    });
  });

  it('confirms only when Storage reports matching MIME and size', async () => {
    gateway.getObjectInfo.mockResolvedValue({
      name: 'tenant-a/evidence/7c8f80d8-66c5-4f3a-9745-b66219c13f74.pdf',
      size: 100,
      contentType: 'application/pdf',
      etag: 'etag-value',
    });

    const result = await service.completeUpload(user, {
      module: StorageModuleName.EVIDENCE,
      path: 'tenant-a/evidence/7c8f80d8-66c5-4f3a-9745-b66219c13f74.pdf',
      metadata: {
        fileName: 'prueba.pdf',
        contentType: 'application/pdf',
        size: 100,
      },
    });

    expect(result).toEqual({
      confirmed: true,
      path: 'tenant-a/evidence/7c8f80d8-66c5-4f3a-9745-b66219c13f74.pdf',
      module: StorageModuleName.EVIDENCE,
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
        actorType: 'USER',
        actorUserId: 'user-a',
        action: 'STORAGE_UPLOAD_CONFIRMED',
        resourceType: 'StorageObject',
        resourceId:
          'tenant-a/evidence/7c8f80d8-66c5-4f3a-9745-b66219c13f74.pdf',
        metadata: {
          module: StorageModuleName.EVIDENCE,
          bucket: 'private-campaign-files',
          contentType: 'application/pdf',
          size: 100,
          etag: 'etag-value',
        },
      },
    });
  });

  it.each([
    [StorageModuleName.FINANCE, Role.AUDITOR, 'soporte.pdf'],
    [StorageModuleName.E14, Role.VOLUNTEER, 'acta.pdf'],
    [StorageModuleName.EVIDENCE, Role.WITNESS, 'evidencia.pdf'],
  ])(
    'rejects role %s from storage module %s',
    async (module, role, fileName) => {
      await expect(
        service.createUploadUrl(
          { ...user, role },
          {
            module,
            fileName,
            contentType: 'application/pdf',
            size: 100,
          },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(gateway.createSignedUploadUrl).not.toHaveBeenCalled();
    },
  );

  it('allows every authenticated role to upload an avatar without a campaign-mode lookup', async () => {
    gateway.createSignedUploadUrl.mockResolvedValue({
      signedUrl: 'https://storage.example/upload?token=signed',
      token: 'signed',
    });

    const result = await service.createUploadUrl(
      { ...user, role: Role.WITNESS },
      {
        module: StorageModuleName.AVATARS,
        fileName: 'perfil.jpg',
        contentType: 'image/jpeg',
        size: 100,
      },
    );

    expect(result.module).toBeUndefined();
    expect(result.path).toContain('tenant-a/avatars/');
    expect(tenantFindUnique).not.toHaveBeenCalled();
  });

  it('blocks finance and E-14 storage in public-office mode', async () => {
    tenantFindUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
      type: TenantType.PUBLIC_OFFICE,
    });

    await expect(
      service.createUploadUrl(
        { ...user, role: Role.FINANCE_MANAGER },
        {
          module: StorageModuleName.FINANCE,
          fileName: 'soporte.pdf',
          contentType: 'application/pdf',
          size: 100,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.completeUpload(
        { ...user, role: Role.WITNESS },
        {
          module: StorageModuleName.E14,
          path: 'tenant-a/e14/7c8f80d8-66c5-4f3a-9745-b66219c13f74.pdf',
          metadata: {
            fileName: 'acta.pdf',
            contentType: 'application/pdf',
            size: 100,
          },
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(gateway.createSignedUploadUrl).not.toHaveBeenCalled();
    expect(gateway.getObjectInfo).not.toHaveBeenCalled();
  });

  it('allows case roles to use evidence storage in public-office mode', async () => {
    tenantFindUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
      type: TenantType.PUBLIC_OFFICE,
    });
    gateway.createSignedUploadUrl.mockResolvedValue({
      signedUrl: 'https://storage.example/upload?token=signed',
      token: 'signed',
    });

    await expect(
      service.createUploadUrl(
        { ...user, role: Role.CASE_WORKER },
        {
          module: StorageModuleName.EVIDENCE,
          fileName: 'visita.pdf',
          contentType: 'application/pdf',
          size: 100,
        },
      ),
    ).resolves.toMatchObject({
      path: expect.stringContaining('tenant-a/evidence/') as string,
    });
    expect(tenantFindUnique).toHaveBeenCalledWith({
      where: { id: 'tenant-a' },
      select: { defaultMode: true, type: true },
    });
  });

  it('blocks campaign-only managers from evidence in public-office mode', async () => {
    tenantFindUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
      type: TenantType.PUBLIC_OFFICE,
    });

    await expect(
      service.createUploadUrl(
        { ...user, role: Role.CAMPAIGN_MANAGER },
        {
          module: StorageModuleName.EVIDENCE,
          fileName: 'visita.pdf',
          contentType: 'application/pdf',
          size: 100,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(gateway.createSignedUploadUrl).not.toHaveBeenCalled();
  });
});
