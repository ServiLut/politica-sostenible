import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { assertConfirmedStorageUpload } from './confirmed-storage-upload.util';

describe('assertConfirmedStorageUpload', () => {
  const path = 'tenant-a/e14/123e4567-e89b-42d3-a456-426614174000-acta.pdf';

  it('accepts only a successful receipt scoped to the JWT tenant and exact path', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'receipt-a' });
    const prisma = { auditEvent: { findFirst } } as unknown as PrismaService;

    await expect(
      assertConfirmedStorageUpload(prisma, 'tenant-a', path),
    ).resolves.toBeUndefined();
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        action: 'STORAGE_UPLOAD_CONFIRMED',
        resourceType: 'StorageObject',
        resourceId: path,
        outcome: 'SUCCESS',
      },
      select: { id: true },
    });
  });

  it('rejects when a matching path has a receipt only in another tenant', async () => {
    const findFirst = jest
      .fn()
      .mockImplementation(({ where }: { where: { tenantId: string } }) =>
        where.tenantId === 'tenant-b' ? { id: 'receipt-b' } : null,
      );
    const prisma = { auditEvent: { findFirst } } as unknown as PrismaService;

    await expect(
      assertConfirmedStorageUpload(prisma, 'tenant-a', path),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
