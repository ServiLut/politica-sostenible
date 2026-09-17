import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  PoliticalOperationMode,
  Role,
  StoredObjectStatus,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import type { PrismaService } from '../prisma/prisma.service';
import { StorageModuleName } from './storage.constants';
import { StorageService } from './storage.service';
import type { SupabaseStorageGateway } from './supabase-storage.gateway';
import type { StorageIntegrityQueuePort } from './storage-integrity-queue.constants';

describe('PQRSD direct Storage integrity', () => {
  const digest = 'a'.repeat(64);
  const path = 'tenant-public/pqrsd/7c8f80d8-66c5-4f3a-9745-b66219c13f74.pdf';
  const user: AuthenticatedUser = {
    tenantId: 'tenant-public',
    userId: 'user-public',
    role: Role.ADMIN,
  };
  let tenantType: TenantType;
  let gateway: {
    bucketName: string;
    getObjectInfo: jest.Mock;
  };
  let prisma: {
    user: { findFirst: jest.Mock };
    tenant: { findUnique: jest.Mock };
    storedObject: { findFirst: jest.Mock; updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: StorageService;

  beforeEach(() => {
    tenantType = TenantType.PUBLIC_OFFICE;
    gateway = {
      bucketName: 'private-tenant-files',
      getObjectInfo: jest.fn(),
    };
    prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ role: Role.ADMIN }),
      },
      tenant: {
        findUnique: jest.fn().mockImplementation(() =>
          Promise.resolve({
            type: tenantType,
            defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
          }),
        ),
      },
      storedObject: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'stored-pqrsd',
          contentType: 'application/pdf',
          expectedSize: 128,
          expectedSha256: digest,
          expiresAt: new Date(Date.now() + 60_000),
          status: StoredObjectStatus.ISSUED,
        }),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    service = new StorageService(
      gateway as unknown as SupabaseStorageGateway,
      prisma as unknown as PrismaService,
      {
        enqueue: jest.fn().mockResolvedValue(undefined),
        checkReady: jest.fn().mockResolvedValue(undefined),
      } as unknown as StorageIntegrityQueuePort,
    );
  });

  it('rejects PQRSD authorization without a browser-computed SHA-256', async () => {
    await expect(
      service.createUploadUrl(user, {
        module: StorageModuleName.PQRSD,
        fileName: 'solicitud.pdf',
        contentType: 'application/pdf',
        size: 128,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    ['absent', undefined],
    ['incorrect', 'b'.repeat(64)],
  ])(
    'fails completeUpload closed when Storage reports an %s digest',
    async (_label, reportedDigest) => {
      gateway.getObjectInfo.mockResolvedValue({
        name: path,
        size: 128,
        contentType: 'application/pdf',
        etag: 'etag-pqrsd',
        metadata: reportedDigest
          ? { contentSha256: reportedDigest }
          : undefined,
      });

      await expect(
        service.completeUpload(user, {
          module: StorageModuleName.PQRSD,
          path,
          metadata: {
            fileName: 'solicitud.pdf',
            contentType: 'application/pdf',
            size: 128,
            contentSha256: digest,
          },
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('rejects use of the PQRSD namespace by a campaign tenant', async () => {
    tenantType = TenantType.CANDIDACY;

    await expect(
      service.completeUpload(user, {
        module: StorageModuleName.PQRSD,
        path,
        metadata: {
          fileName: 'solicitud.pdf',
          contentType: 'application/pdf',
          size: 128,
          contentSha256: digest,
        },
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.storedObject.findFirst).not.toHaveBeenCalled();
  });
});
