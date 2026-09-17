import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  AuditActorType,
  CandidateListType,
  DivisionType,
  ElectoralCodeNamespace,
  ElectoralCircumscriptionType,
  ElectoralContestType,
  FinanceReportScope,
  PoliticalOperationMode,
  PoliticalOperationStage,
  PoliticalOperationType,
  Prisma,
  Role,
  TenantType,
  WitnessReportStatus,
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
  stage: PoliticalOperationStage.PRE_CAMPAIGN,
  electionType: ElectoralContestType.MUNICIPAL_COUNCIL,
  circumscriptionType: ElectoralCircumscriptionType.MUNICIPAL,
  circumscriptionName: 'Medellin',
  circumscriptionCode: '05001',
  listType: CandidateListType.OPEN_PREFERENTIAL,
  electionDate: '2027-10-31',
  votingStartDate: '2027-10-31',
  votingEndDate: '2027-10-31',
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
    votingStartDate: new Date(`${dto.votingStartDate}T00:00:00.000Z`),
    votingEndDate: new Date(`${dto.votingEndDate}T00:00:00.000Z`),
    votingWindowSourceUrl: dto.votingWindowSourceUrl ?? null,
    votingWindowReference: dto.votingWindowReference ?? null,
    expectedTeamSize: dto.expectedTeamSize,
    candidateCount: dto.candidateCount,
    dataControllerName: dto.dataControllerName,
    responsibleDataUserId: dto.responsibleDataUserId,
    retentionPeriodDays: dto.retentionPeriodDays,
    revocationProcedure: dto.revocationProcedure,
    closureType: null,
    terminatedAt: null,
    terminationCause: null,
    terminationRequestId: null,
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

function compliantSettings() {
  return {
    id: 'settings-a',
    ...savedSettings(),
    electionName: 'Eleccion territorial',
    electionDate: new Date('2027-10-31T00:00:00.000Z'),
    reportScope: FinanceReportScope.CANDIDATE,
    officialLimitsReference: 'Resolucion de topes',
    officialLimitsUrl: 'https://example.test/topes',
    reportDeadline: new Date('2027-11-30T00:00:00.000Z'),
    financialManagerName: 'Responsable financiero',
    financialManagerDocument: '123456789',
    accountantName: 'Contador',
    accountantDocument: '987654321',
    uniqueAccountBank: 'Banco',
    uniqueAccountLastFour: '1234',
    cuentasClarasCode: 'CC-123',
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
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
      groupBy: jest
        .fn()
        .mockResolvedValue([
          { divisionId: 'municipality-a', _count: { _all: 1 } },
        ]),
    },
    politicalDivision: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'municipality-a',
          parentId: null,
          type: DivisionType.MUNICIPIO,
          expectedTables: null,
          sourceNamespace: ElectoralCodeNamespace.RNEC_DIVIPOLE,
          sourceReleaseId: 'release-active',
        },
        {
          id: 'place-a',
          parentId: 'municipality-a',
          type: DivisionType.PUESTO,
          expectedTables: 10,
          sourceNamespace: ElectoralCodeNamespace.RNEC_DIVIPOLE,
          sourceReleaseId: 'release-active',
        },
      ]),
    },
    operationProfile: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
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
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve(
            savedProfile({
              ...data,
              responsibleDataUser: {
                id: dto.responsibleDataUserId,
                name: 'Responsable de datos',
                role: Role.COMPLIANCE_OFFICER,
              },
              updatedAt: new Date('2026-09-05T12:01:00.000Z'),
            }),
          ),
        ),
    },
    campaignSettings: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue(savedSettings()),
    },
    electoralCatalogRelease: {
      findMany: jest.fn().mockResolvedValue([{ id: 'release-active' }]),
    },
    electoralCalendarRelease: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    witnessCoverageWindow: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'window-a',
          puestoId: 'place-a',
          localDate: new Date('2027-10-31T00:00:00.000Z'),
          startsAt: new Date('2027-10-31T12:00:00.000Z'),
          endsAt: new Date('2027-10-31T22:00:00.000Z'),
          timeZone: 'America/Bogota',
          utcOffsetMinutes: -300,
        },
      ]),
    },
    witnessAssignment: {
      findMany: jest.fn().mockResolvedValue(
        (['PRIMARY', 'BACKUP'] as const).map((assignmentType) => ({
          coverageWindowId: 'window-a',
          puestoId: 'place-a',
          tableStart: 1,
          tableEnd: 10,
          shiftStartsAt: new Date('2027-10-31T12:00:00.000Z'),
          shiftEndsAt: new Date('2027-10-31T22:00:00.000Z'),
          assignmentType,
          status: 'CONFIRMED',
          witness: { role: Role.WITNESS, isActive: true },
        })),
      ),
    },
    financialEntry: { count: jest.fn().mockResolvedValue(0) },
    financeReportDossier: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'finance-dossier-a',
          versions: [
            {
              approvals: [
                {
                  control: 'CAMPAIGN_MANAGER',
                  decision: 'APPROVE',
                  actorUserId: 'manager-a',
                },
                {
                  control: 'ACCOUNTANT',
                  decision: 'APPROVE',
                  actorUserId: 'accountant-a',
                },
                {
                  control: 'COMPLIANCE',
                  decision: 'APPROVE',
                  actorUserId: 'compliance-a',
                },
              ],
              externalEvidence: { review: { decision: 'APPROVE' } },
            },
          ],
        },
      ]),
    },
    financeBankStatement: { count: jest.fn().mockResolvedValue(1) },
    financeBankStatementLine: { count: jest.fn().mockResolvedValue(0) },
    financePayable: { findMany: jest.fn().mockResolvedValue([]) },
    signatureCollectionPlan: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    signatureCountCorrectionProposal: {
      count: jest.fn().mockResolvedValue(0),
    },
    witnessReport: {
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    issueCase: { count: jest.fn().mockResolvedValue(0) },
    task: { count: jest.fn().mockResolvedValue(0) },
    scrutinyCommission: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'commission-a', status: 'CLOSED' }]),
    },
    scrutinyDocumentRequirement: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    scrutinyDocument: { findMany: jest.fn().mockResolvedValue([]) },
    scrutinyDiscrepancy: { count: jest.fn().mockResolvedValue(0) },
    scrutinyAction: { count: jest.fn().mockResolvedValue(0) },
    scrutinyActionDecision: { count: jest.fn().mockResolvedValue(0) },
    scrutinyDeclaration: { count: jest.fn().mockResolvedValue(0) },
    offlineE14CaptureGrant: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
    $queryRaw: jest.fn().mockResolvedValue([]),
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
        allowedNextStages: [
          PoliticalOperationStage.PRE_CAMPAIGN,
          PoliticalOperationStage.SIGNATURE_COLLECTION,
          PoliticalOperationStage.CAMPAIGN,
        ],
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

  it('rejects an unsafe initial stage before writing profile or budget state', async () => {
    const { transaction, service } = buildService();

    const promise = service.upsert(admin, {
      ...dto,
      stage: PoliticalOperationStage.CAMPAIGN,
    });

    await expect(promise).rejects.toBeInstanceOf(BadRequestException);
    await expect(promise).rejects.toThrow(
      'solo puede iniciar en EXPLORATION o PRE_CAMPAIGN',
    );
    expect(transaction.campaignSettings.upsert).not.toHaveBeenCalled();
    expect(transaction.operationProfile.create).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('applies an allowed forward transition and keeps the tenant audit trail', async () => {
    const transaction = buildTransaction();
    transaction.operationProfile.findUnique.mockResolvedValue(savedProfile());
    transaction.campaignSettings.findUnique.mockResolvedValue(savedSettings());
    const { service } = buildService(transaction);

    await expect(
      service.upsert(admin, {
        ...dto,
        stage: PoliticalOperationStage.CAMPAIGN,
        expectedUpdatedAt: savedAt.toISOString(),
      }),
    ).resolves.toMatchObject({
      configured: true,
      profile: {
        tenantId: admin.tenantId,
        stage: PoliticalOperationStage.CAMPAIGN,
        allowedNextStages: [
          PoliticalOperationStage.CAMPAIGN,
          PoliticalOperationStage.ELECTION_PREPARATION,
        ],
      },
    });
    expect(transaction.operationProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: admin.tenantId },
        data: expect.objectContaining({
          stage: PoliticalOperationStage.CAMPAIGN,
          updatedById: admin.userId,
        }),
      }),
    );
    expect(transaction.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: admin.tenantId,
        action: 'OPERATION_PROFILE_UPDATED',
        before: expect.objectContaining({
          stage: PoliticalOperationStage.PRE_CAMPAIGN,
        }),
        after: expect.objectContaining({
          stage: PoliticalOperationStage.CAMPAIGN,
        }),
      }),
    });
  });

  it('invalidates only tenant/profile-scoped E-14 grants when the exact window snapshot changes', async () => {
    const transaction = buildTransaction();
    transaction.operationProfile.findUnique.mockResolvedValue(savedProfile());
    transaction.campaignSettings.findUnique.mockResolvedValue(savedSettings());
    transaction.offlineE14CaptureGrant.updateMany.mockResolvedValue({
      count: 2,
    });
    const { service } = buildService(transaction);

    const sourceUrl = 'https://example.test/calendario-electoral.pdf';
    const reference = 'Resolucion de prueba, articulo 4';
    await service.upsert(admin, {
      ...dto,
      votingStartDate: '2027-10-30',
      votingEndDate: '2027-10-31',
      votingWindowSourceUrl: sourceUrl,
      votingWindowReference: reference,
      expectedUpdatedAt: savedAt.toISOString(),
    });

    expect(transaction.offlineE14CaptureGrant.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: admin.tenantId,
        operationProfileId: 'profile-a',
        revokedAt: null,
      },
      data: { revokedAt: expect.any(Date) },
    });
    const invalidationAudit = transaction.auditEvent.create.mock.calls.find(
      ([call]) =>
        call.data.action === 'E14_OFFLINE_GRANTS_INVALIDATED_WINDOW_CHANGED',
    )?.[0];
    expect(invalidationAudit).toEqual({
      data: expect.objectContaining({
        tenantId: admin.tenantId,
        actorUserId: admin.userId,
        resourceId: 'profile-a',
        metadata: expect.objectContaining({
          previousElectionWindowSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          currentElectionWindowSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          invalidatedGrantCount: 2,
        }),
      }),
    });
    expect(JSON.stringify(invalidationAudit)).not.toContain(sourceUrl);
    expect(JSON.stringify(invalidationAudit)).not.toContain(reference);
  });

  it('allows a real advance to ELECTION_DAY when territorial minimums are ready', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2027-10-31T15:00:00.000Z'));
    const transaction = buildTransaction();
    transaction.operationProfile.findUnique.mockResolvedValue(
      savedProfile({ stage: PoliticalOperationStage.ELECTION_PREPARATION }),
    );
    transaction.campaignSettings.findUnique.mockResolvedValue(savedSettings());
    const { service } = buildService(transaction);

    try {
      await expect(
        service.upsert(admin, {
          ...dto,
          stage: PoliticalOperationStage.ELECTION_DAY,
          expectedUpdatedAt: savedAt.toISOString(),
        }),
      ).resolves.toMatchObject({
        configured: true,
        profile: { stage: PoliticalOperationStage.ELECTION_DAY },
      });
      expect(transaction.politicalDivision.findMany).toHaveBeenCalledWith({
        where: { tenantId: admin.tenantId, isActive: true },
        select: {
          id: true,
          code: true,
          name: true,
          parentId: true,
          type: true,
          expectedTables: true,
          sourceNamespace: true,
          sourceReleaseId: true,
        },
      });
      expect(transaction.witnessAssignment.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: admin.tenantId,
          captureContext: 'REAL',
          status: 'CONFIRMED',
        },
        select: {
          coverageWindowId: true,
          puestoId: true,
          tableStart: true,
          tableEnd: true,
          shiftStartsAt: true,
          shiftEndsAt: true,
          assignmentType: true,
          status: true,
          witness: { select: { role: true, isActive: true } },
        },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('blocks ELECTION_DAY before the configured election date in Bogota even when territory is ready', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2027-10-30T15:00:00.000Z'));
    const transaction = buildTransaction();
    transaction.operationProfile.findUnique.mockResolvedValue(
      savedProfile({ stage: PoliticalOperationStage.ELECTION_PREPARATION }),
    );
    transaction.campaignSettings.findUnique.mockResolvedValue(savedSettings());
    const { service } = buildService(transaction);

    try {
      let rejection: unknown;
      try {
        await service.upsert(admin, {
          ...dto,
          stage: PoliticalOperationStage.ELECTION_DAY,
          expectedUpdatedAt: savedAt.toISOString(),
        });
      } catch (error: unknown) {
        rejection = error;
      }

      expect(rejection).toBeInstanceOf(ConflictException);
      expect((rejection as ConflictException).getResponse()).toEqual({
        code: 'ELECTION_DAY_READINESS_BLOCKED',
        message:
          'No se puede avanzar a Dia D hasta corregir el alistamiento territorial minimo',
        blockers: ['ELECTION_DAY_OUTSIDE_VOTING_WINDOW_BOGOTA'],
      });
      expect(transaction.operationProfile.update).not.toHaveBeenCalled();
      expect(transaction.auditEvent.create).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('blocks a real advance to ELECTION_DAY with stable blocker codes before writes', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2027-10-31T15:00:00.000Z'));
    const transaction = buildTransaction();
    transaction.operationProfile.findUnique.mockResolvedValue(
      savedProfile({ stage: PoliticalOperationStage.ELECTION_PREPARATION }),
    );
    transaction.campaignSettings.findUnique.mockResolvedValue(savedSettings());
    transaction.politicalDivision.findMany.mockResolvedValue([]);
    transaction.witnessAssignment.findMany.mockResolvedValue([]);
    const { service } = buildService(transaction);

    try {
      let rejection: unknown;
      try {
        await service.upsert(admin, {
          ...dto,
          stage: PoliticalOperationStage.ELECTION_DAY,
          expectedUpdatedAt: savedAt.toISOString(),
        });
      } catch (error: unknown) {
        rejection = error;
      }

      expect(rejection).toBeInstanceOf(ConflictException);
      expect((rejection as ConflictException).getResponse()).toEqual({
        code: 'ELECTION_DAY_READINESS_BLOCKED',
        message:
          'No se puede avanzar a Dia D hasta corregir el alistamiento territorial minimo',
        blockers: [
          'NO_POLLING_PLACES',
          'ELECTORAL_CATALOG_PROJECTION_NOT_READY',
        ],
      });
      expect(transaction.campaignSettings.upsert).not.toHaveBeenCalled();
      expect(transaction.operationProfile.update).not.toHaveBeenCalled();
      expect(transaction.auditEvent.create).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not apply the ELECTION_DAY guard to a same-stage retry', async () => {
    const transaction = buildTransaction();
    transaction.operationProfile.findUnique.mockResolvedValue(
      savedProfile({ stage: PoliticalOperationStage.ELECTION_DAY }),
    );
    transaction.campaignSettings.findUnique.mockResolvedValue(savedSettings());
    transaction.politicalDivision.findMany.mockResolvedValue([]);
    transaction.witnessAssignment.findMany.mockResolvedValue([]);
    const { service } = buildService(transaction);

    await expect(
      service.upsert(admin, {
        ...dto,
        stage: PoliticalOperationStage.ELECTION_DAY,
      }),
    ).resolves.toMatchObject({
      configured: true,
      profile: { stage: PoliticalOperationStage.ELECTION_DAY },
    });
    expect(transaction.politicalDivision.findMany).not.toHaveBeenCalled();
    expect(transaction.witnessAssignment.findMany).not.toHaveBeenCalled();
    expect(transaction.operationProfile.update).not.toHaveBeenCalled();
  });

  it('allows POST_ELECTION to close when every modeled critical obligation is clear', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2027-11-15T15:00:00.000Z'));
    const transaction = buildTransaction();
    transaction.operationProfile.findUnique.mockResolvedValue(
      savedProfile({ stage: PoliticalOperationStage.POST_ELECTION }),
    );
    transaction.campaignSettings.findUnique
      .mockReset()
      .mockResolvedValueOnce(savedSettings())
      .mockResolvedValueOnce(compliantSettings());
    const { service } = buildService(transaction);

    try {
      await expect(
        service.upsert(admin, {
          ...dto,
          stage: PoliticalOperationStage.CLOSED,
          expectedUpdatedAt: savedAt.toISOString(),
        }),
      ).resolves.toMatchObject({
        configured: true,
        profile: { stage: PoliticalOperationStage.CLOSED },
      });
      expect(transaction.financialEntry.count).toHaveBeenCalledWith({
        where: { tenantId: admin.tenantId, status: 'PENDING' },
      });
      expect(transaction.financialEntry.count).toHaveBeenCalledWith({
        where: { tenantId: admin.tenantId, status: 'APPROVED' },
      });
      expect(transaction.issueCase.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: admin.tenantId,
            priority: 'URGENT',
          }),
        }),
      );
      expect(transaction.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: admin.tenantId,
          action: 'OPERATION_PROFILE_UPDATED',
          after: expect.objectContaining({
            stage: PoliticalOperationStage.CLOSED,
          }),
        }),
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('blocks closure when a tenant/profile dossier has no immutable version', async () => {
    const transaction = buildTransaction();
    transaction.operationProfile.findUnique.mockResolvedValue(
      savedProfile({ stage: PoliticalOperationStage.POST_ELECTION }),
    );
    transaction.campaignSettings.findUnique
      .mockReset()
      .mockResolvedValueOnce(savedSettings())
      .mockResolvedValueOnce(compliantSettings());
    transaction.financeReportDossier.findMany.mockResolvedValue([
      { id: 'finance-dossier-without-version', versions: [] },
    ]);
    const { service } = buildService(transaction);

    await expect(
      service.upsert(admin, {
        ...dto,
        stage: PoliticalOperationStage.CLOSED,
        expectedUpdatedAt: savedAt.toISOString(),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'OPERATION_CLOSURE_READINESS_BLOCKED',
        blockers: ['REPORT_VERSION_MISSING'],
      }),
    });

    expect(transaction.financeReportDossier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: admin.tenantId,
          operationProfileId: 'profile-a',
        },
      }),
    );
    expect(transaction.operationProfile.update).not.toHaveBeenCalled();
  });

  it('blocks closure for APPROVED movements that remain outside a reported version', async () => {
    const transaction = buildTransaction();
    transaction.operationProfile.findUnique.mockResolvedValue(
      savedProfile({ stage: PoliticalOperationStage.POST_ELECTION }),
    );
    transaction.campaignSettings.findUnique
      .mockReset()
      .mockResolvedValueOnce(savedSettings())
      .mockResolvedValueOnce(compliantSettings());
    transaction.financialEntry.count.mockImplementation(
      ({ where }: { where: { status: string } }) =>
        Promise.resolve(where.status === 'APPROVED' ? 2 : 0),
    );
    const { service } = buildService(transaction);

    await expect(
      service.upsert(admin, {
        ...dto,
        stage: PoliticalOperationStage.CLOSED,
        expectedUpdatedAt: savedAt.toISOString(),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'OPERATION_CLOSURE_READINESS_BLOCKED',
        blockers: ['UNREPORTED_FINANCIAL_ENTRIES'],
      }),
    });
    expect(transaction.operationProfile.update).not.toHaveBeenCalled();
  });

  it('blocks closure atomically and returns every critical post-election blocker', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2027-12-01T15:00:00.000Z'));
    const transaction = buildTransaction();
    transaction.operationProfile.findUnique.mockResolvedValue(
      savedProfile({ stage: PoliticalOperationStage.POST_ELECTION }),
    );
    transaction.campaignSettings.findUnique
      .mockReset()
      .mockResolvedValueOnce(savedSettings())
      .mockResolvedValueOnce({
        ...compliantSettings(),
        accountantName: null,
      });
    transaction.financialEntry.count.mockResolvedValue(2);
    transaction.witnessReport.count.mockResolvedValue(3);
    transaction.witnessReport.groupBy.mockResolvedValue([
      {
        puestoId: 'place-a',
        mesa: 1,
        candidateVotes: 10,
        blankVotes: 1,
        nullVotes: 0,
        unmarkedVotes: 0,
        totalTableVotes: 11,
        status: WitnessReportStatus.PENDING,
      },
      {
        puestoId: 'place-a',
        mesa: 1,
        candidateVotes: 9,
        blankVotes: 1,
        nullVotes: 0,
        unmarkedVotes: 0,
        totalTableVotes: 10,
        status: WitnessReportStatus.ACCEPTED,
      },
    ]);
    transaction.issueCase.count.mockResolvedValue(4);
    transaction.task.count.mockResolvedValue(5);
    const { service } = buildService(transaction);

    try {
      let rejection: unknown;
      try {
        await service.upsert(admin, {
          ...dto,
          stage: PoliticalOperationStage.CLOSED,
          expectedUpdatedAt: savedAt.toISOString(),
        });
      } catch (error: unknown) {
        rejection = error;
      }

      expect(rejection).toBeInstanceOf(ConflictException);
      expect((rejection as ConflictException).getResponse()).toEqual({
        code: 'OPERATION_CLOSURE_READINESS_BLOCKED',
        message:
          'No se puede cerrar la operacion mientras existan obligaciones poselectorales criticas',
        blockers: [
          'FINANCE_COMPLIANCE_NOT_READY',
          'UNREPORTED_FINANCIAL_ENTRIES',
          'POST_ELECTION_REPORT_OVERDUE',
          'PENDING_E14_REPORTS',
          'DIVERGENT_E14_TABLES',
          'OPEN_URGENT_CASES',
          'OPEN_URGENT_TASKS',
        ],
      });
      expect(transaction.campaignSettings.upsert).not.toHaveBeenCalled();
      expect(transaction.operationProfile.update).not.toHaveBeenCalled();
      expect(transaction.auditEvent.create).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects every profile mutation after CLOSED, including an exact retry', async () => {
    const transaction = buildTransaction();
    transaction.operationProfile.findUnique.mockResolvedValue(
      savedProfile({ stage: PoliticalOperationStage.CLOSED }),
    );
    transaction.campaignSettings.findUnique.mockResolvedValue(savedSettings());
    transaction.financialEntry.count.mockResolvedValue(99);
    const { service } = buildService(transaction);

    await expect(
      service.upsert(admin, {
        ...dto,
        stage: PoliticalOperationStage.CLOSED,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'OPERATION_CLOSED' }),
    });
    expect(transaction.financialEntry.count).not.toHaveBeenCalled();
    expect(transaction.witnessReport.count).not.toHaveBeenCalled();
    expect(transaction.issueCase.count).not.toHaveBeenCalled();
    expect(transaction.operationProfile.update).not.toHaveBeenCalled();
  });

  it('rejects a dangerous stage jump before writing profile or budget state', async () => {
    const transaction = buildTransaction();
    transaction.operationProfile.findUnique.mockResolvedValue(savedProfile());
    transaction.campaignSettings.findUnique.mockResolvedValue(savedSettings());
    const { service } = buildService(transaction);

    const promise = service.upsert(admin, {
      ...dto,
      stage: PoliticalOperationStage.ELECTION_DAY,
      expectedUpdatedAt: savedAt.toISOString(),
    });

    await expect(promise).rejects.toBeInstanceOf(ConflictException);
    await expect(promise).rejects.toThrow(
      'No se permite cambiar la etapa de PRE_CAMPAIGN a ELECTION_DAY. Siguientes etapas permitidas: SIGNATURE_COLLECTION, CAMPAIGN',
    );
    expect(transaction.campaignSettings.upsert).not.toHaveBeenCalled();
    expect(transaction.operationProfile.update).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
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
    expect(
      transaction.offlineE14CaptureGrant.updateMany,
    ).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('reads only profile and budget rows keyed by the JWT tenant', async () => {
    const transaction = buildTransaction();
    transaction.operationProfile.findUnique.mockResolvedValue(savedProfile());
    transaction.campaignSettings.findUnique.mockResolvedValue(savedSettings());
    const { service } = buildService(transaction);

    await expect(service.getCurrent(admin)).resolves.toMatchObject({
      configured: true,
      profile: {
        tenantId: admin.tenantId,
        allowedNextStages: [
          PoliticalOperationStage.PRE_CAMPAIGN,
          PoliticalOperationStage.SIGNATURE_COLLECTION,
          PoliticalOperationStage.CAMPAIGN,
        ],
      },
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
