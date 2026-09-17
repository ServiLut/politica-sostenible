import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ElectoralCircumscriptionType,
  ElectoralContestType,
  OperationClosureType,
  PoliticalOperationStage,
  PoliticalOperationType,
  Prisma,
  PrismaClient,
  RetentionDataScope,
  RetentionDispositionStatus,
  Role,
} from '../../prisma/generated/prisma';
import {
  resolveDatabaseSchema,
  resolveDatabaseSearchPathOptions,
} from '../prisma/prisma.service';

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const testDatabaseSchema = resolveDatabaseSchema(testDatabaseUrl) ?? 'public';
const describeWithPostgres = testDatabaseUrl ? describe : describe.skip;
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const ELECTION_DATE = new Date('2026-05-31T00:00:00.000Z');
const CUTOFF = new Date('2026-09-09T15:00:00.000Z');

describeWithPostgres('retention governance PostgreSQL boundaries', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    const adapter = new PrismaPg(
      {
        connectionString: testDatabaseUrl,
        options: resolveDatabaseSearchPathOptions(testDatabaseSchema),
      },
      { schema: testDatabaseSchema },
    );
    prisma = new PrismaClient({ adapter });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function fixture(transaction: Prisma.TransactionClient) {
    const suffix = randomUUID();
    const tenant = await transaction.tenant.create({
      data: {
        id: `retention-tenant-${suffix}`,
        slug: `retention-${suffix}`,
        name: 'Tenant efimero de retencion',
      },
    });
    const requester = await transaction.user.create({
      data: {
        id: `retention-requester-${suffix}`,
        tenantId: tenant.id,
        email: `requester-${suffix}@integration.invalid`,
        password: 'not-a-real-password-hash',
        name: 'Solicitante efimero',
        role: Role.ADMIN,
      },
    });
    const reviewer = await transaction.user.create({
      data: {
        id: `retention-reviewer-${suffix}`,
        tenantId: tenant.id,
        email: `reviewer-${suffix}@integration.invalid`,
        password: 'not-a-real-password-hash',
        name: 'Revisor efimero',
        role: Role.AUDITOR,
      },
    });
    const profile = await transaction.operationProfile.create({
      data: {
        id: `retention-profile-${suffix}`,
        tenantId: tenant.id,
        operationType: PoliticalOperationType.SINGLE_CANDIDACY,
        stage: PoliticalOperationStage.CLOSED,
        electionType: ElectoralContestType.PRESIDENCY,
        circumscriptionType: ElectoralCircumscriptionType.NATIONAL,
        circumscriptionName: 'Colombia',
        electionDate: ELECTION_DATE,
        votingStartDate: ELECTION_DATE,
        votingEndDate: ELECTION_DATE,
        expectedTeamSize: 2,
        dataControllerName: 'Tenant efimero de retencion',
        responsibleDataUserId: requester.id,
        retentionPeriodDays: 30,
        revocationProcedure:
          'Solicitud autenticada, validacion de identidad y respuesta documentada.',
        closureType: OperationClosureType.CLOSED_NORMAL,
        createdById: requester.id,
        updatedById: requester.id,
      },
    });
    return { tenant, requester, reviewer, profile };
  }

  function dispositionData(
    state: Awaited<ReturnType<typeof fixture>>,
  ): Prisma.RetentionDispositionRequestUncheckedCreateInput {
    return {
      id: `retention-disposition-${randomUUID()}`,
      tenantId: state.tenant.id,
      operationProfileId: state.profile.id,
      clientRequestId: randomUUID(),
      payloadSha256: HASH_A,
      previewSha256: HASH_B,
      profileSnapshotSha256: HASH_A,
      expectedProfileUpdatedAt: state.profile.updatedAt,
      status: RetentionDispositionStatus.PENDING,
      scope: RetentionDataScope.DATA_SUBJECT_RECORDS,
      cutoffAt: CUTOFF,
      retentionDueAt: new Date('2026-06-30T00:00:00.000Z'),
      previewSnapshot: { counts: { total: 0 } },
      justification: 'J'.repeat(120),
      legalReference: 'Politica juridica interna de integracion 2026-01',
      evidenceReference: 'https://evidence.integration.invalid/retention/1',
      evidenceSha256: HASH_B,
      legalPolicyRequiredAcknowledged: true,
      backupRestoreRequiredAcknowledged: true,
      executorUnavailableAcknowledged: true,
      requestedById: state.requester.id,
    };
  }

  it('permits only the terminal APPROVED_NOT_EXECUTED state with a second actor', async () => {
    await expect(
      prisma.$transaction(async (transaction) => {
        const state = await fixture(transaction);
        const request = await transaction.retentionDispositionRequest.create({
          data: dispositionData(state),
        });
        const approved = await transaction.retentionDispositionRequest.update({
          where: {
            id_tenantId: {
              id: request.id,
              tenantId: state.tenant.id,
            },
          },
          data: {
            status: RetentionDispositionStatus.APPROVED_NOT_EXECUTED,
            reviewedById: state.reviewer.id,
            reviewedAt: CUTOFF,
            reviewClientRequestId: randomUUID(),
            reviewPayloadSha256: HASH_A,
          },
        });

        expect(approved.status).toBe(
          RetentionDispositionStatus.APPROVED_NOT_EXECUTED,
        );
        throw new Error('intentional-retention-approval-rollback');
      }),
    ).rejects.toThrow('intentional-retention-approval-rollback');
  });

  it('blocks a disposition when an overlapping append-only hold exists', async () => {
    await expect(
      prisma.$transaction(async (transaction) => {
        const state = await fixture(transaction);
        await transaction.retentionLegalHold.create({
          data: {
            id: `retention-hold-${randomUUID()}`,
            tenantId: state.tenant.id,
            operationProfileId: state.profile.id,
            clientRequestId: randomUUID(),
            payloadSha256: HASH_A,
            scope: RetentionDataScope.DATA_SUBJECT_RECORDS,
            reason: 'R'.repeat(80),
            legalAuthority: 'Oficina juridica',
            legalReference: 'Actuacion administrativa de integracion 2026-1',
            evidenceReference:
              'https://evidence.integration.invalid/legal-hold/1',
            evidenceSha256: HASH_B,
            effectiveAt: CUTOFF,
            createdById: state.requester.id,
          },
        });
        await transaction.retentionDispositionRequest.create({
          data: dispositionData(state),
        });
      }),
    ).rejects.toThrow(/Active legal hold blocks this retention disposition/i);
  });

  it('rejects updates and deletes of legal-hold history at the database boundary', async () => {
    await expect(
      prisma.$transaction(async (transaction) => {
        const state = await fixture(transaction);
        const hold = await transaction.retentionLegalHold.create({
          data: {
            id: `retention-hold-${randomUUID()}`,
            tenantId: state.tenant.id,
            operationProfileId: state.profile.id,
            clientRequestId: randomUUID(),
            payloadSha256: HASH_A,
            scope: RetentionDataScope.ALL_TENANT_RECORDS,
            reason: 'R'.repeat(80),
            legalAuthority: 'Oficina juridica',
            legalReference: 'Actuacion administrativa de integracion 2026-2',
            evidenceReference:
              'https://evidence.integration.invalid/legal-hold/2',
            evidenceSha256: HASH_B,
            effectiveAt: CUTOFF,
            createdById: state.requester.id,
          },
        });
        await transaction.retentionLegalHold.update({
          where: { id_tenantId: { id: hold.id, tenantId: state.tenant.id } },
          data: { reason: 'Intento de reescritura prohibido'.repeat(3) },
        });
      }),
    ).rejects.toThrow(
      /RetentionLegalHold is append-only and cannot be UPDATE/i,
    );

    await expect(
      prisma.$transaction(async (transaction) => {
        const state = await fixture(transaction);
        const hold = await transaction.retentionLegalHold.create({
          data: {
            id: `retention-hold-${randomUUID()}`,
            tenantId: state.tenant.id,
            operationProfileId: state.profile.id,
            clientRequestId: randomUUID(),
            payloadSha256: HASH_A,
            scope: RetentionDataScope.ALL_TENANT_RECORDS,
            reason: 'R'.repeat(80),
            legalAuthority: 'Oficina juridica',
            legalReference: 'Actuacion administrativa de integracion 2026-3',
            evidenceReference:
              'https://evidence.integration.invalid/legal-hold/3',
            evidenceSha256: HASH_B,
            effectiveAt: CUTOFF,
            createdById: state.requester.id,
          },
        });
        await transaction.retentionLegalHold.delete({
          where: { id_tenantId: { id: hold.id, tenantId: state.tenant.id } },
        });
      }),
    ).rejects.toThrow(
      /RetentionLegalHold is append-only and cannot be DELETE/i,
    );
  });
});
