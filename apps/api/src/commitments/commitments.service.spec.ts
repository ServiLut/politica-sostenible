import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PoliticalOperationMode, Role } from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CommitmentsService } from './commitments.service';

describe('CommitmentsService tenant and mode isolation', () => {
  const currentUser: AuthenticatedUser = {
    userId: 'manager-a',
    tenantId: 'tenant-a',
    role: Role.CAMPAIGN_MANAGER,
  };

  let prisma: {
    tenant: { findUnique: jest.Mock };
    user: { findFirst: jest.Mock };
    issueCase: { findFirst: jest.Mock };
    commitment: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let service: CommitmentsService;

  beforeEach(() => {
    prisma = {
      tenant: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ defaultMode: PoliticalOperationMode.CAMPAIGN }),
      },
      user: { findFirst: jest.fn() },
      issueCase: { findFirst: jest.fn() },
      commitment: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new CommitmentsService(prisma as unknown as PrismaService);
  });

  it('rejects an owner that does not belong to the JWT tenant', async () => {
    prisma.commitment.findFirst.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.create(currentUser, {
        reference: 'CMP-001',
        title: 'Mejorar una vía',
        description: 'Compromiso verificable',
        ownerId: 'owner-from-tenant-b',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'owner-from-tenant-b', tenantId: 'tenant-a' },
      select: { id: true },
    });
    expect(prisma.commitment.create).not.toHaveBeenCalled();
  });

  it('does not update a commitment owned by another tenant', async () => {
    prisma.commitment.findFirst.mockResolvedValue(null);

    await expect(
      service.update(currentUser, 'commitment-from-tenant-b', { progress: 50 }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.commitment.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'commitment-from-tenant-b',
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
      },
      select: { id: true, reference: true, status: true },
    });
    expect(prisma.commitment.update).not.toHaveBeenCalled();
  });

  it('rejects an issue case from the other political operation mode', async () => {
    prisma.commitment.findFirst.mockResolvedValue(null);
    prisma.issueCase.findFirst.mockResolvedValue(null);

    await expect(
      service.create(currentUser, {
        reference: 'CMP-002',
        title: 'Atender solicitudes',
        description: 'No mezclar gestión pública con campaña',
        issueCaseId: 'public-office-case',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.issueCase.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'public-office-case',
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
      },
      select: { id: true },
    });
    expect(prisma.commitment.create).not.toHaveBeenCalled();
  });

  it('always scopes paginated reads to JWT tenant and server-side mode', async () => {
    await service.findAll(currentUser, { page: 3, limit: 5 });

    expect(prisma.commitment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          mode: PoliticalOperationMode.CAMPAIGN,
        },
        skip: 10,
        take: 5,
      }),
    );
    expect(prisma.commitment.count).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
      },
    });
  });

  it('returns 403 when a volunteer tries to create a commitment', async () => {
    await expect(
      service.create(
        { ...currentUser, userId: 'volunteer-a', role: Role.VOLUNTEER },
        {
          reference: 'CMP-403',
          title: 'Compromiso no autorizado',
          description: 'No debe persistirse',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.commitment.create).not.toHaveBeenCalled();
    expect(prisma.commitment.findFirst).not.toHaveBeenCalled();
  });

  it('returns 403 when a witness tries to update a commitment', async () => {
    await expect(
      service.update(
        { ...currentUser, userId: 'witness-a', role: Role.WITNESS },
        'commitment-a',
        { progress: 100 },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.commitment.findFirst).not.toHaveBeenCalled();
    expect(prisma.commitment.update).not.toHaveBeenCalled();
  });

  it('does not let a public-office manager write campaign commitments', async () => {
    await expect(
      service.create(
        {
          ...currentUser,
          userId: 'case-worker-a',
          role: Role.CASE_WORKER,
        },
        {
          reference: 'CMP-MODE',
          title: 'Compromiso fuera de modo',
          description: 'Debe quedar aislado',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.commitment.create).not.toHaveBeenCalled();
  });
});
