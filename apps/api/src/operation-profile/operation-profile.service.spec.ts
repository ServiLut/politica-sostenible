import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  AuditActorType,
  CandidateListType,
  ElectoralCircumscriptionType,
  ElectoralContestType,
  PoliticalOperationMode,
  PoliticalOperationStage,
  PoliticalOperationType,
  Prisma,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertOperationProfileDto } from './dto/upsert-operation-profile.dto';
import { OperationProfileService } from './operation-profile.service';

const admin: AuthenticatedUser = {
  userId: 'admin-from-jwt',
  tenantId: 'tenant-from-jwt',
  role: Role.ADMIN,
};

const dto: UpsertOperationProfileDto = {
  operationType: PoliticalOperationType.CORPORATION_CANDIDACY,
  stage: PoliticalOperationStage.CAMPAIGN,
  electionType: ElectoralContestType.MUNICIPAL_COUNCIL,
  circumscriptionType: ElectoralCircumscriptionType.MUNICIPAL,
  circumscriptionName: 'Medellin',
  circumscriptionCode: '05001',
  listType: CandidateListType.OPEN_PREFERENTIAL,
  electionDate: '2027-10-31T13:00:00.000Z',
  expectedTeamSize: 80,
  candidateCount: 21,
  maxTotalBudget: 500_000_000,
  maxPublicityLimit: 100_000_000,
  dataControllerName: 'Movimiento ciudadano',
  responsibleDataUserId: 'privacy-officer',
  retentionPeriodDays: 730,
  revocationProcedure:
    'Enviar la solicitud al canal de privacidad y esperar confirmacion escrita.',
};

const savedAt = new Date('2026-09-05T12:00:00.000Z');

function savedProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'profile-a',
    tenantId: admin.tenantId,
    operationType: dto.operationType,
    stage: dto.stage,
    electionType: dto.electionType,
    circumscriptionType: dto.circumscriptionType,
    circumscriptionName: dto.circumscriptionName,
    circumscriptionCode: dto.circumscriptionCode ?? null,
    listType: dto.listType ?? null,
    electionDate: new Date(dto.electionDate),
    expectedTeamSize: dto.expectedTeamSize,
    candidateCount: dto.candidateCount,
    dataControllerName: dto.dataControllerName,
    responsibleDataUserId: dto.responsibleDataUserId,
    retentionPeriodDays: dto.retentionPeriodDays,
    revocationProcedure: dto.revocationProcedure,
    responsibleDataUser: {
      id: dto.responsibleDataUserId,
      name: 'Responsable de datos',
      role: Role.COMPLIANCE_OFFICER,
    },
    createdAt: new Date('2026-09-05T11:00:00.000Z'),
    updatedAt: savedAt,
    ...overrides,
  };
}

function savedSettings(
  total = dto.maxTotalBudget,
  publicity = dto.maxPublicityLimit,
) {
  return {
    maxTotalBudget: new Prisma.Decimal(String(total)),
    maxPublicityLimit: new Prisma.Decimal(String(publicity)),
  };
}

function buildTransaction() {
  return {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        type: TenantType.CANDIDACY,
        defaultMode: PoliticalOperationMode.CAMPAIGN,
      }),
    },
    user: {
      findFirst: jest
        .fn()
        .mockResolvedValueOnce({ id: admin.userId })
        .mockResolvedValueOnce({
          id: dto.responsibleDataUserId,
          role: Role.COMPLIANCE_OFFICER,
        }),
    },
    operationProfile: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve(
          savedProfile({
            ...data,
            responsibleDataUser: {
              id: dto.responsibleDataUserId,
              name: 'Responsable de datos',
              role: Role.COMPLIANCE_OFFICER,
            },
            createdAt: savedAt,
            updatedAt: savedAt,
          }),
        ),
      ),
      update: jest.fn(),
    },
    campaignSettings: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue(savedSettings()),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
  };
}

function buildService(transaction = buildTransaction()) {
  const runTransaction = jest.fn(
    async (callback: (client: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
  );
  return {
    transaction,
    runTransaction,
    service: new OperationProfileService({
      $transaction: runTransaction,
    } as unknown as PrismaService),
  };
}

describe('OperationProfileService', () => {
  it('creates an aggregate tenant-owned configuration and reuses finance settings atomically', async () => {
    const { transaction, runTransaction, service } = buildService();

    const result = await service.upsert(admin, dto);

    expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(transaction.user.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'privacy-officer',
        tenantId: 'tenant-from-jwt',
        isActive: true,
        role: {
          in: [Role.ADMIN, Role.CAMPAIGN_MANAGER, Role.COMPLIANCE_OFFICER],
        },
      },
      select: { id: true, role: true },
    });
    expect(transaction.campaignSettings.upsert).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-from-jwt' },
      create: expect.objectContaining({
        tenantId: 'tenant-from-jwt',
        maxTotalBudget: expect.any(Prisma.Decimal),
      }),
      update: expect.objectContaining({
        maxPublicityLimit: expect.any(Prisma.Decimal),
      }),
      select: {
        maxTotalBudget: true,
        maxPublicityLimit: true,
      },
    });
    expect(transaction.operationProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-from-jwt',
          createdById: 'admin-from-jwt',
          updatedById: 'admin-from-jwt',
          responsibleDataUserId: 'privacy-officer',
        }),
      }),
    );
    expect(result).toMatchObject({
      configured: true,
      profile: {
        tenantId: 'tenant-from-jwt',
        budget: {
          maxTotalBudget: 500_000_000,
          maxPublicityLimit: 100_000_000,
        },
        derived: {
          workspace: 'DAILY_OPERATION',
          scale: 'MEDIUM',
          warRoomEnabled: false,
          candidateListEnabled: true,
          preferentialVoteEnabled: true,
        },
      },
    });
  });

  it('records state and a hash instead of copying the revocation procedure into audit', async () => {
    const { transaction, service } = buildService();

    await service.upsert(admin, dto);

    expect(transaction.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: admin.tenantId,
        mode: PoliticalOperationMode.CAMPAIGN,
        actorType: AuditActorType.USER,
        actorUserId: admin.userId,
        action: 'OPERATION_PROFILE_CREATED',
        resourceType: 'OperationProfile',
        resourceId: 'profile-a',
        before: undefined,
        after: expect.objectContaining({
          operationType: dto.operationType,
          responsibleDataUserId: dto.responsibleDataUserId,
          retentionPeriodDays: dto.retentionPeriodDays,
          revocationProcedureSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    });
    expect(
      JSON.stringify(transaction.auditEvent.create.mock.calls),
    ).not.toContain(dto.revocationProcedure);
  });

  it('rejects a data responsible not found inside the authenticated tenant', async () => {
    const transaction = buildTransaction();
    transaction.user.findFirst
      .mockReset()
      .mockResolvedValueOnce({ id: admin.userId })
      .mockResolvedValueOnce(null);
    const { service } = buildService(transaction);

    await expect(service.upsert(admin, dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(transaction.operationProfile.create).not.toHaveBeenCalled();
    expect(transaction.campaignSettings.upsert).not.toHaveBeenCalled();
  });

  it('revalidates the ADMIN role from storage instead of trusting JWT claims', async () => {
    const transaction = buildTransaction();
    transaction.user.findFirst
      .mockReset()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: dto.responsibleDataUserId,
        role: Role.COMPLIANCE_OFFICER,
      });
    const { service } = buildService(transaction);

    await expect(service.upsert(admin, dto)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(transaction.operationProfile.create).not.toHaveBeenCalled();
  });

  it('requires optimistic concurrency metadata when changing an existing profile', async () => {
    const transaction = buildTransaction();
    transaction.operationProfile.findUnique.mockResolvedValue(savedProfile());
    transaction.campaignSettings.findUnique.mockResolvedValue(savedSettings());
    const { service } = buildService(transaction);

    await expect(
      service.upsert(admin, { ...dto, expectedTeamSize: 81 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.operationProfile.update).not.toHaveBeenCalled();
    expect(transaction.campaignSettings.upsert).not.toHaveBeenCalled();
  });

  it('rejects a stale update before any configuration is written', async () => {
    const transaction = buildTransaction();
    transaction.operationProfile.findUnique.mockResolvedValue(savedProfile());
    transaction.campaignSettings.findUnique.mockResolvedValue(savedSettings());
    const { service } = buildService(transaction);

    await expect(
      service.upsert(admin, {
        ...dto,
        expectedTeamSize: 81,
        expectedUpdatedAt: '2026-09-05T10:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.campaignSettings.upsert).not.toHaveBeenCalled();
  });

  it('treats an exact retry as idempotent without rewriting or duplicating audit', async () => {
    const transaction = buildTransaction();
    transaction.operationProfile.findUnique.mockResolvedValue(savedProfile());
    transaction.campaignSettings.findUnique.mockResolvedValue(savedSettings());
    const { service } = buildService(transaction);

    await expect(service.upsert(admin, dto)).resolves.toMatchObject({
      configured: true,
      profile: { id: 'profile-a' },
    });
    expect(transaction.campaignSettings.upsert).not.toHaveBeenCalled();
    expect(transaction.operationProfile.update).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('reads only profile and budget rows keyed by the JWT tenant', async () => {
    const transaction = buildTransaction();
    transaction.operationProfile.findUnique.mockResolvedValue(savedProfile());
    transaction.campaignSettings.findUnique.mockResolvedValue(savedSettings());
    const { service } = buildService(transaction);

    await expect(service.getCurrent(admin)).resolves.toMatchObject({
      configured: true,
      profile: { tenantId: admin.tenantId },
    });
    expect(transaction.operationProfile.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: admin.tenantId } }),
    );
    expect(transaction.campaignSettings.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: admin.tenantId } }),
    );
  });

  it('does not expose campaign configuration inside public-office mode', async () => {
    const transaction = buildTransaction();
    transaction.tenant.findUnique.mockResolvedValue({
      type: TenantType.PUBLIC_OFFICE,
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    const { service } = buildService(transaction);

    await expect(service.getCurrent(admin)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects business-rule violations even when called without ValidationPipe', async () => {
    const { service, runTransaction } = buildService();

    await expect(
      service.upsert(admin, {
        ...dto,
        maxPublicityLimit: dto.maxTotalBudget + 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(runTransaction).not.toHaveBeenCalled();
  });
});
