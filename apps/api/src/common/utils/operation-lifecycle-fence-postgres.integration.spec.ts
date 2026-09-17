import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ElectoralCircumscriptionType,
  ElectoralContestType,
  OperationClosureType,
  PoliticalOperationMode,
  PoliticalOperationStage,
  PoliticalOperationType,
  Prisma,
  PrismaClient,
  Role,
  TenantType,
} from '../../../prisma/generated/prisma';
import {
  resolveDatabaseSchema,
  resolveDatabaseSearchPathOptions,
} from '../../prisma/prisma.service';
import {
  lockAndAssertOperationOpen,
  OPERATION_LIFECYCLE_LOCK_PREFIX,
} from './operation-lifecycle-fence.util';

const databaseUrl =
  process.env.OPERATION_LIFECYCLE_INTEGRATION_DATABASE_URL?.trim() ??
  process.env.TEST_DATABASE_URL?.trim();
const databaseSchema = resolveDatabaseSchema(databaseUrl) ?? 'public';
const physicalDescribe = databaseUrl ? describe : describe.skip;

type Deferred = Readonly<{
  promise: Promise<void>;
  resolve: () => void;
}>;

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

physicalDescribe('operation lifecycle fence on PostgreSQL 16', () => {
  let prisma: PrismaClient;

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
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createOpenOperation() {
    const suffix = randomUUID();
    const tenantId = `tenant-lifecycle-fence-${suffix}`;
    const userId = `user-lifecycle-fence-${suffix}`;
    const originalName = 'Operacion abierta para prueba de concurrencia';

    await prisma.tenant.create({
      data: {
        id: tenantId,
        slug: `lifecycle-fence-${suffix}`,
        name: originalName,
        type: TenantType.CANDIDACY,
        defaultMode: PoliticalOperationMode.CAMPAIGN,
      },
    });
    await prisma.user.create({
      data: {
        id: userId,
        tenantId,
        email: `lifecycle-fence-${suffix}@integration.invalid`,
        password: 'not-a-real-credential',
        name: 'Responsable de integracion',
        role: Role.ADMIN,
        isActive: true,
      },
    });
    await prisma.operationProfile.create({
      data: {
        tenantId,
        operationType: PoliticalOperationType.SINGLE_CANDIDACY,
        stage: PoliticalOperationStage.POST_ELECTION,
        electionType: ElectoralContestType.MAYORALTY,
        circumscriptionType: ElectoralCircumscriptionType.MUNICIPAL,
        circumscriptionName: 'Municipio de integracion',
        circumscriptionCode: '05001',
        electionDate: new Date('2099-06-01T00:00:00.000Z'),
        votingStartDate: new Date('2099-06-01T00:00:00.000Z'),
        votingEndDate: new Date('2099-06-01T00:00:00.000Z'),
        expectedTeamSize: 3,
        candidateCount: 1,
        dataControllerName: 'Responsable de integracion',
        responsibleDataUserId: userId,
        retentionPeriodDays: 365,
        revocationProcedure: 'Solicitud verificable al responsable.',
        createdById: userId,
        updatedById: userId,
      },
    });

    return { originalName, tenantId };
  }

  async function deleteOperation(tenantId: string): Promise<void> {
    await prisma.operationProfile.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  }

  it('lineariza cierre-primero y nunca deja pasar la mutacion despues de CLOSED', async () => {
    const context = await createOpenOperation();
    const closeHasWritten = deferred();
    const allowCloseCommit = deferred();
    const mutationEnteredTransaction = deferred();
    let mutationPassedFence = false;
    let mutationSettled = false;

    const closing = prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`
          WITH lifecycle_lock AS MATERIALIZED (
            SELECT pg_advisory_xact_lock(
              hashtextextended(${`${OPERATION_LIFECYCLE_LOCK_PREFIX}:${context.tenantId}`}, 0)
            )
          )
          SELECT TRUE AS "locked" FROM lifecycle_lock
        `);
        await transaction.operationProfile.update({
          where: { tenantId: context.tenantId },
          data: {
            stage: PoliticalOperationStage.CLOSED,
            closureType: OperationClosureType.CLOSED_NORMAL,
          },
        });
        closeHasWritten.resolve();
        await allowCloseCommit.promise;
      },
      { timeout: 15_000 },
    );

    await closeHasWritten.promise;
    const mutation = prisma.$transaction(
      async (transaction) => {
        mutationEnteredTransaction.resolve();
        await lockAndAssertOperationOpen(transaction, context.tenantId);
        mutationPassedFence = true;
        await transaction.tenant.update({
          where: { id: context.tenantId },
          data: { name: 'MUTACION_QUE_NO_DEBE_CONFIRMARSE' },
        });
      },
      { timeout: 15_000 },
    );
    await mutationEnteredTransaction.promise;
    void mutation.then(
      () => {
        mutationSettled = true;
      },
      () => {
        mutationSettled = true;
      },
    );

    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(mutationSettled).toBe(false);

      allowCloseCommit.resolve();
      await closing;
      await expect(mutation).rejects.toMatchObject({
        response: { code: 'OPERATION_CLOSED' },
        status: 409,
      });
      expect(mutationPassedFence).toBe(false);

      await expect(
        prisma.tenant.findUniqueOrThrow({
          where: { id: context.tenantId },
          select: { name: true },
        }),
      ).resolves.toEqual({ name: context.originalName });
    } finally {
      allowCloseCommit.resolve();
      await Promise.allSettled([closing, mutation]);
      await deleteOperation(context.tenantId);
    }
  });
});
