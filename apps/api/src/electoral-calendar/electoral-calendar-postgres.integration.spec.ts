import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ElectoralCalendarMilestoneCategory,
  ElectoralCalendarMilestoneSemantics,
  ElectoralCalendarReleaseStatus,
  ElectoralCalendarResultOutcome,
  ElectoralCalendarResultReviewDecision,
  ElectoralCircumscriptionType,
  ElectoralContestType,
  PoliticalOperationMode,
  PoliticalOperationStage,
  PoliticalOperationType,
  PrismaClient,
  Role,
  StorageObjectModule,
  StoredObjectStatus,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  PrismaService,
  resolveDatabaseSchema,
  resolveDatabaseSearchPathOptions,
} from '../prisma/prisma.service';
import type {
  ActivateElectoralCalendarReleaseDto,
  CreateElectoralCalendarReleaseDto,
  RecordElectoralCalendarResultDto,
  ReviewElectoralCalendarResultDto,
  ValidateElectoralCalendarReleaseDto,
} from './dto/electoral-calendar.dto';
import {
  computeElectoralCalendarCommandSha256,
  type ElectoralCalendarCommandName,
} from './electoral-calendar.hash';
import { ElectoralCalendarService } from './electoral-calendar.service';

const databaseUrl =
  process.env.ELECTORAL_CALENDAR_INTEGRATION_DATABASE_URL?.trim() ??
  process.env.TEST_DATABASE_URL?.trim();
const databaseSchema = resolveDatabaseSchema(databaseUrl) ?? 'public';
const physicalDescribe = databaseUrl ? describe : describe.skip;

function command<T extends object>(
  type: ElectoralCalendarCommandName,
  input: T,
  binding: object = {},
): T & { payloadSha256: string } {
  return {
    ...input,
    payloadSha256: computeElectoralCalendarCommandSha256(type, {
      ...binding,
      ...input,
    }),
  };
}

physicalDescribe(
  'ElectoralCalendarService on migrated physical PostgreSQL',
  () => {
    let prisma: PrismaClient;
    let service: ElectoralCalendarService;

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
      service = new ElectoralCalendarService(
        prisma as unknown as PrismaService,
      );
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    async function createContext(
      stage: PoliticalOperationStage = PoliticalOperationStage.PRE_CAMPAIGN,
    ) {
      const suffix = randomUUID();
      const tenantId = `tenant-calendar-${suffix}`;
      const managerId = `manager-calendar-${suffix}`;
      const reviewerId = `reviewer-calendar-${suffix}`;
      const backupId = `backup-calendar-${suffix}`;
      await prisma.tenant.create({
        data: {
          id: tenantId,
          slug: `calendar-${suffix}`,
          name: 'Candidatura de integracion de calendario',
          type: TenantType.CANDIDACY,
          defaultMode: PoliticalOperationMode.CAMPAIGN,
        },
      });
      await prisma.user.createMany({
        data: [
          {
            id: managerId,
            tenantId,
            email: `manager-${suffix}@calendar.integration.invalid`,
            password: 'not-a-real-credential',
            name: 'Gerencia de calendario',
            role: Role.CAMPAIGN_MANAGER,
            isActive: true,
          },
          {
            id: reviewerId,
            tenantId,
            email: `reviewer-${suffix}@calendar.integration.invalid`,
            password: 'not-a-real-credential',
            name: 'Revision independiente',
            role: Role.AUDITOR,
            isActive: true,
          },
          {
            id: backupId,
            tenantId,
            email: `backup-${suffix}@calendar.integration.invalid`,
            password: 'not-a-real-credential',
            name: 'Suplencia operativa',
            role: Role.ZONE_COORDINATOR,
            isActive: true,
          },
        ],
      });
      const profile = await prisma.operationProfile.create({
        data: {
          tenantId,
          operationType: PoliticalOperationType.SINGLE_CANDIDACY,
          stage,
          electionType: ElectoralContestType.MAYORALTY,
          circumscriptionType: ElectoralCircumscriptionType.MUNICIPAL,
          circumscriptionName: 'Municipio de integracion',
          circumscriptionCode: '05001',
          electionDate: new Date('2099-06-01T00:00:00.000Z'),
          votingStartDate: new Date('2099-06-01T00:00:00.000Z'),
          votingEndDate: new Date('2099-06-01T00:00:00.000Z'),
          expectedTeamSize: 3,
          candidateCount: 1,
          dataControllerName: 'Candidatura de integracion de calendario',
          responsibleDataUserId: managerId,
          retentionPeriodDays: 365,
          revocationProcedure:
            'Solicitud verificable al responsable del tratamiento.',
          createdById: managerId,
          updatedById: managerId,
        },
      });
      return {
        tenantId,
        profile,
        managerId,
        reviewerId,
        backupId,
        manager: {
          tenantId,
          userId: managerId,
          role: Role.CAMPAIGN_MANAGER,
        } satisfies AuthenticatedUser,
        reviewer: {
          tenantId,
          userId: reviewerId,
          role: Role.AUDITOR,
        } satisfies AuthenticatedUser,
      };
    }

    function releaseInput(
      context: Awaited<ReturnType<typeof createContext>>,
      label: string,
      basedOnReleaseId?: string,
      localDate = '2099-03-01',
    ): CreateElectoralCalendarReleaseDto {
      const raw = {
        clientRequestId: randomUUID(),
        ...(basedOnReleaseId ? { basedOnReleaseId } : {}),
        roundCode: 'UNICA',
        versionLabel: label,
        sourceAuthority: 'Autoridad electoral de integracion',
        sourceUrl: `https://authority.integration.invalid/calendar/${label}`,
        sourceReference: `Acto verificable ${label}`,
        sourcePublishedAt: '2099-01-01',
        sourceCutoffAt: '2099-01-02T15:00:00.000Z',
        sourceSha256: 'a'.repeat(64),
        milestones: [
          {
            stableKey: 'REGISTRATION.CLOSE',
            category: ElectoralCalendarMilestoneCategory.REGISTRATION,
            semantics: ElectoralCalendarMilestoneSemantics.EXTERNAL_DEADLINE,
            title: 'Cierre externo declarado de registro',
            applicabilityRule:
              'Aplica exclusivamente al perfil, eleccion y ronda declarados.',
            originalTextSummary:
              'Resumen interno contrastado con la fuente versionada indicada.',
            localDate,
            localTime: '17:00',
            timeZone: 'America/Bogota',
            responsibleUserId: context.managerId,
            backupUserId: context.backupId,
            alertOffsetsDays: [30, 15, 7, 3, 1, 0],
            stageGateRequired: true,
            resultEvidenceRequired: true,
          },
        ],
      };
      return command('RELEASE_STAGE', raw) as CreateElectoralCalendarReleaseDto;
    }

    function validation(
      releaseId: string,
      expectedVersion: number,
    ): ValidateElectoralCalendarReleaseDto {
      return command(
        'RELEASE_VALIDATE',
        {
          clientRequestId: randomUUID(),
          expectedVersion,
          sourceReviewedAcknowledged: true,
          rationale:
            'Fuente, alcance, ronda, corte y huella revisados independientemente.',
        },
        { releaseId },
      ) as ValidateElectoralCalendarReleaseDto;
    }

    function activation(
      releaseId: string,
      expectedVersion: number,
    ): ActivateElectoralCalendarReleaseDto {
      return command(
        'RELEASE_ACTIVATE',
        {
          clientRequestId: randomUUID(),
          expectedVersion,
          sourceReviewedAcknowledged: true,
          diffReviewedAcknowledged: true,
          affectedTasksResolvedAcknowledged: true,
          rationale:
            'Fuente y diff revisados; tareas y eventos afectados fueron conciliados.',
        },
        { releaseId },
      ) as ActivateElectoralCalendarReleaseDto;
    }

    it('serializes two competing activations, preserves history and exposes a visible diff', async () => {
      const context = await createContext();
      const inputA = releaseInput(context, `v1-a-${randomUUID()}`);
      const stagedA = await service.createRelease(context.manager, inputA);
      const replay = await service.createRelease(context.manager, inputA);
      expect(replay.noOp).toBe(true);
      expect(replay.resource.id).toBe(stagedA.resource.id);

      const inputB = releaseInput(context, `v1-b-${randomUUID()}`);
      const stagedB = await service.createRelease(context.manager, inputB);
      await expect(
        service.validateRelease(
          context.manager,
          stagedA.resource.id,
          validation(stagedA.resource.id, 1),
        ),
      ).rejects.toThrow();

      const validatedA = await service.validateRelease(
        context.reviewer,
        stagedA.resource.id,
        validation(stagedA.resource.id, 1),
      );
      const validatedB = await service.validateRelease(
        context.reviewer,
        stagedB.resource.id,
        validation(stagedB.resource.id, 1),
      );
      const outcomes = await Promise.allSettled([
        service.activateRelease(
          context.reviewer,
          stagedA.resource.id,
          activation(stagedA.resource.id, validatedA.resource.version),
        ),
        service.activateRelease(
          context.reviewer,
          stagedB.resource.id,
          activation(stagedB.resource.id, validatedB.resource.version),
        ),
      ]);
      expect(
        outcomes.filter(({ status }) => status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        outcomes.filter(({ status }) => status === 'rejected'),
      ).toHaveLength(1);

      const active = await prisma.electoralCalendarRelease.findFirstOrThrow({
        where: {
          tenantId: context.tenantId,
          operationProfileId: context.profile.id,
          roundCode: 'UNICA',
          status: ElectoralCalendarReleaseStatus.ACTIVE,
        },
        include: { milestones: true },
      });
      await expect(
        prisma.electoralCalendarRelease.count({
          where: {
            tenantId: context.tenantId,
            operationProfileId: context.profile.id,
            roundCode: 'UNICA',
            status: ElectoralCalendarReleaseStatus.ACTIVE,
          },
        }),
      ).resolves.toBe(1);
      expect(active.milestones[0]?.occursAtUtc?.toISOString()).toBe(
        '2099-03-01T22:00:00.000Z',
      );

      const changed = await service.createRelease(
        context.manager,
        releaseInput(context, `v2-${randomUUID()}`, active.id, '2099-03-02'),
      );
      const overview = await service.getOverview(context.reviewer);
      const changedRelease = overview.releases.find(
        (release) => release.id === changed.resource.id,
      );
      expect(changedRelease?.diff.moved).toHaveLength(1);
      expect(changedRelease?.diff.moved[0]).toMatchObject({
        stableKey: 'REGISTRATION.CLOSE',
      });
      expect(
        overview.releases.some(
          (release) =>
            release.id === active.id &&
            release.status === ElectoralCalendarReleaseStatus.ACTIVE,
        ),
      ).toBe(true);

      await expect(
        prisma.electoralCalendarMilestone.update({
          where: { id: active.milestones[0].id },
          data: { title: 'Intento de reescritura prohibido' },
        }),
      ).rejects.toThrow(/append-only/i);
    });

    it('requires confirmed tenant evidence, a second person, and rolls back failed commands', async () => {
      const context = await createContext();
      const staged = await service.createRelease(
        context.manager,
        releaseInput(context, `evidence-${randomUUID()}`),
      );
      const validated = await service.validateRelease(
        context.reviewer,
        staged.resource.id,
        validation(staged.resource.id, staged.resource.version),
      );
      const activated = await service.activateRelease(
        context.reviewer,
        staged.resource.id,
        activation(staged.resource.id, validated.resource.version),
      );
      const milestoneId = activated.resource.milestones[0].id;
      const digest = 'b'.repeat(64);
      const evidencePath = `${context.tenantId}/electoral-calendar/${randomUUID()}.pdf`;
      const evidence = await prisma.storedObject.create({
        data: {
          tenantId: context.tenantId,
          uploaderId: context.managerId,
          path: evidencePath,
          module: StorageObjectModule.ELECTORAL_CALENDAR,
          contentType: 'application/pdf',
          expectedSize: 128,
          actualSize: 128,
          expectedSha256: digest,
          reportedSha256: digest,
          status: StoredObjectStatus.CONFIRMED,
          expiresAt: new Date('2099-12-31T00:00:00.000Z'),
          confirmedAt: new Date(),
        },
      });
      const rawResult = {
        clientRequestId: randomUUID(),
        outcome: ElectoralCalendarResultOutcome.COMPLETED,
        explanation:
          'Resultado interno documentado; no se presenta como certificacion oficial.',
        evidenceStoragePath: evidencePath,
        evidenceSha256: digest,
      };
      const recorded = await service.recordResult(
        context.manager,
        milestoneId,
        command('MILESTONE_RESULT_RECORD', rawResult, {
          milestoneId,
        }) as RecordElectoralCalendarResultDto,
      );
      await expect(
        service.reviewResult(
          context.manager,
          recorded.resource.id,
          command(
            'MILESTONE_RESULT_REVIEW',
            {
              clientRequestId: randomUUID(),
              decision: ElectoralCalendarResultReviewDecision.APPROVE,
              rationale: 'Intento de auto revision que debe ser rechazado.',
            },
            { resultId: recorded.resource.id },
          ) as ReviewElectoralCalendarResultDto,
        ),
      ).rejects.toThrow();
      const reviewed = await service.reviewResult(
        context.reviewer,
        recorded.resource.id,
        command(
          'MILESTONE_RESULT_REVIEW',
          {
            clientRequestId: randomUUID(),
            decision: ElectoralCalendarResultReviewDecision.APPROVE,
            rationale:
              'Evidencia, resultado y alcance contrastados por segunda persona.',
          },
          { resultId: recorded.resource.id },
        ) as ReviewElectoralCalendarResultDto,
      );
      expect(reviewed.resource.review?.decision).toBe(
        ElectoralCalendarResultReviewDecision.APPROVE,
      );
      await expect(
        prisma.storedObject.findUniqueOrThrow({ where: { id: evidence.id } }),
      ).resolves.toMatchObject({
        consumedByType: 'ElectoralCalendarMilestoneResult',
        consumedById: recorded.resource.id,
      });
      await expect(
        prisma.electoralCalendarMilestoneResult.update({
          where: { id: recorded.resource.id },
          data: { explanation: 'Intento de reescritura prohibido' },
        }),
      ).rejects.toThrow(/append-only/i);

      const foreign = await createContext();
      const badInput = releaseInput(
        { ...context, backupId: foreign.backupId },
        `foreign-${randomUUID()}`,
        undefined,
      );
      await expect(
        service.createRelease(context.manager, badInput),
      ).rejects.toThrow();
      await expect(
        prisma.electoralCalendarCommand.count({
          where: {
            tenantId: context.tenantId,
            clientRequestId: badInput.clientRequestId,
          },
        }),
      ).resolves.toBe(0);
    });

    it('fails closed inside the transaction without leaving a command receipt', async () => {
      const context = await createContext(PoliticalOperationStage.CLOSED);
      const input = releaseInput(context, `closed-${randomUUID()}`);
      await expect(
        service.createRelease(context.manager, input),
      ).rejects.toThrow();
      await expect(
        prisma.electoralCalendarCommand.count({
          where: {
            tenantId: context.tenantId,
            clientRequestId: input.clientRequestId,
          },
        }),
      ).resolves.toBe(0);
    });
  },
);
