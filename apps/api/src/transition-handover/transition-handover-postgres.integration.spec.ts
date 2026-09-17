import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ElectoralCircumscriptionType,
  ElectoralContestType,
  PoliticalOperationMode,
  PoliticalOperationStage,
  PoliticalOperationType,
  Prisma,
  PrismaClient,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  PrismaService,
  resolveDatabaseSchema,
  resolveDatabaseSearchPathOptions,
} from '../prisma/prisma.service';
import {
  computeTransitionHandoverSha256,
  TransitionHandoverService,
} from './transition-handover.service';

const databaseUrl =
  process.env.TRANSITION_HANDOVER_INTEGRATION_DATABASE_URL?.trim() ??
  process.env.TEST_DATABASE_URL?.trim();
const databaseSchema = resolveDatabaseSchema(databaseUrl) ?? 'public';
const physicalDescribe = databaseUrl ? describe : describe.skip;

physicalDescribe('TransitionHandoverService on migrated PostgreSQL 16', () => {
  let prisma: PrismaClient;
  let service: TransitionHandoverService;

  beforeAll(async () => {
    const adapter = new PrismaPg(
      {
        connectionString: databaseUrl,
        options: resolveDatabaseSearchPathOptions(databaseSchema),
      },
      { schema: databaseSchema },
    );
    prisma = new PrismaClient({ adapter });
    await prisma.$connect();
    service = new TransitionHandoverService(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createContext(label: string) {
    const suffix = randomUUID();
    const tenantId = `tenant-handover-${label}-${suffix}`;
    const userId = `user-handover-${label}-${suffix}`;
    await prisma.tenant.create({
      data: {
        id: tenantId,
        slug: `handover-${label}-${suffix}`,
        name: `Campana de empalme ${label}`,
        type: TenantType.CANDIDACY,
        defaultMode: PoliticalOperationMode.CAMPAIGN,
      },
    });
    await prisma.user.create({
      data: {
        id: userId,
        tenantId,
        email: `handover-${label}-${suffix}@integration.invalid`,
        password: 'not-a-real-credential',
        name: `Auditoria de empalme ${label}`,
        role: Role.AUDITOR,
        isActive: true,
      },
    });
    const profile = await prisma.operationProfile.create({
      data: {
        tenantId,
        operationType: PoliticalOperationType.SINGLE_CANDIDACY,
        stage: PoliticalOperationStage.POST_ELECTION,
        electionType: ElectoralContestType.MAYORALTY,
        circumscriptionType: ElectoralCircumscriptionType.MUNICIPAL,
        circumscriptionName: 'Municipio de integracion',
        circumscriptionCode: '05001',
        electionDate: new Date('2026-08-30T00:00:00.000Z'),
        votingStartDate: new Date('2026-08-30T00:00:00.000Z'),
        votingEndDate: new Date('2026-08-30T00:00:00.000Z'),
        expectedTeamSize: 2,
        candidateCount: 1,
        dataControllerName: `Campana de empalme ${label}`,
        responsibleDataUserId: userId,
        retentionPeriodDays: 730,
        revocationProcedure:
          'Solicitud verificable dirigida al responsable del tratamiento.',
        createdById: userId,
        updatedById: userId,
      },
    });
    return {
      tenantId,
      userId,
      profileId: profile.id,
      user: {
        tenantId,
        userId,
        role: Role.AUDITOR,
      } satisfies AuthenticatedUser,
    };
  }

  it('persists, lists and recovers one exact snapshot only inside its JWT tenant', async () => {
    const owner = await createContext('owner');
    const outsider = await createContext('outsider');

    const generated = await service.generateHandoverReport(owner.user);
    const stored = await prisma.transitionHandoverReport.findUniqueOrThrow({
      where: { id: generated.reportId },
    });
    expect(stored).toMatchObject({
      tenantId: owner.tenantId,
      operationProfileId: owner.profileId,
      generatedById: owner.userId,
      payload: generated,
      sha256: generated.integrity.sha256,
    });

    await expect(
      service.getHandoverReport(owner.user, generated.reportId),
    ).resolves.toEqual(generated);
    await expect(
      service.listHandoverReports(owner.user, 1, 25),
    ).resolves.toEqual(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            reportId: generated.reportId,
            operationProfileId: owner.profileId,
            sha256: generated.integrity.sha256,
          }),
        ],
      }),
    );
    await expect(
      service.getHandoverReport(outsider.user, generated.reportId),
    ).rejects.toMatchObject({ status: 404 });

    const foreignReportId = randomUUID();
    const foreignBody: Record<string, unknown> = {
      ...generated,
      reportId: foreignReportId,
    };
    delete foreignBody.integrity;
    const sha256 = computeTransitionHandoverSha256(foreignBody);
    await expect(
      prisma.transitionHandoverReport.create({
        data: {
          id: foreignReportId,
          tenantId: outsider.tenantId,
          operationProfileId: owner.profileId,
          generatedById: owner.userId,
          generatedAt: new Date(generated.generatedAt),
          createdAt: new Date(generated.generatedAt),
          status: generated.status,
          packageKind: generated.packageKind,
          payload: {
            ...foreignBody,
            integrity: {
              algorithm: 'SHA-256',
              scope: 'REPORT_BODY_WITHOUT_INTEGRITY',
              sha256,
            },
          } as unknown as Prisma.InputJsonValue,
          sha256,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects update and delete at the physical database boundary', async () => {
    const owner = await createContext('immutable');
    const generated = await service.generateHandoverReport(owner.user);

    await expect(
      prisma.transitionHandoverReport.update({
        where: { id: generated.reportId },
        data: { status: 'READY' },
      }),
    ).rejects.toThrow(/immutable/i);
    await expect(
      prisma.transitionHandoverReport.delete({
        where: { id: generated.reportId },
      }),
    ).rejects.toThrow(/immutable/i);
    await expect(
      prisma.transitionHandoverReport.count({
        where: { id: generated.reportId, tenantId: owner.tenantId },
      }),
    ).resolves.toBe(1);
  });
});
