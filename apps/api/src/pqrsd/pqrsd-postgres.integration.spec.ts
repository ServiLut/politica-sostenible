import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { PrismaClient, Role } from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CasesService } from '../cases/cases.service';
import { CommitmentsService } from '../commitments/commitments.service';
import { OperationalInboxService } from '../operational-inbox/operational-inbox.service';
import {
  resolveDatabaseSchema,
  resolveDatabaseSearchPathOptions,
} from '../prisma/prisma.service';
import type { PrismaService } from '../prisma/prisma.service';
import { SearchService } from '../search/search.service';
import { TasksService } from '../tasks/tasks.service';

const databaseUrl =
  process.env.PQRSD_INTEGRATION_DATABASE_URL?.trim() ??
  process.env.TEST_DATABASE_URL?.trim();
const databaseSchema = resolveDatabaseSchema(databaseUrl) ?? 'public';
const physicalDescribe = databaseUrl ? describe : describe.skip;

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error))
    return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

async function expectPgCode(
  operation: Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  try {
    await operation;
    throw new Error(`Expected PostgreSQL error ${expectedCode}`);
  } catch (error) {
    expect(errorCode(error)).toBe(expectedCode);
  }
}

physicalDescribe('PQRSD controls on physical PostgreSQL 16', () => {
  jest.setTimeout(30_000);

  let pool: pg.Pool;
  let publicTenantA: string;
  let publicTenantB: string;
  let campaignTenant: string;
  let creatorA: string;
  let reviewerA: string;
  let creatorB: string;
  let servicePool: pg.Pool;
  let prismaClient: PrismaClient;
  let operationalInbox: OperationalInboxService;
  let search: SearchService;

  beforeAll(async () => {
    pool = new pg.Pool({
      connectionString: databaseUrl,
      options: resolveDatabaseSearchPathOptions(databaseSchema),
      max: 5,
    });
    const version = await pool.query<{ server_version: string }>(
      'SHOW server_version',
    );
    expect(version.rows[0]?.server_version).toMatch(/^16\./u);

    const suffix = randomUUID();
    publicTenantA = `pqrsd-public-a-${suffix}`;
    publicTenantB = `pqrsd-public-b-${suffix}`;
    campaignTenant = `pqrsd-campaign-${suffix}`;
    creatorA = `pqrsd-creator-a-${suffix}`;
    reviewerA = `pqrsd-reviewer-a-${suffix}`;
    creatorB = `pqrsd-creator-b-${suffix}`;

    await pool.query(
      `INSERT INTO "Tenant" ("id", "slug", "name", "type", "defaultMode", "updatedAt")
       VALUES
         ($1, $2, 'Entidad publica A', 'PUBLIC_OFFICE', 'PUBLIC_OFFICE', now()),
         ($3, $4, 'Entidad publica B', 'PUBLIC_OFFICE', 'PUBLIC_OFFICE', now()),
         ($5, $6, 'Campana aislada', 'CANDIDACY', 'CAMPAIGN', now())`,
      [
        publicTenantA,
        `pqrsd-public-a-${suffix}`,
        publicTenantB,
        `pqrsd-public-b-${suffix}`,
        campaignTenant,
        `pqrsd-campaign-${suffix}`,
      ],
    );
    await pool.query(
      `INSERT INTO "User" ("id", "email", "password", "name", "role", "tenantId", "updatedAt")
       VALUES
         ($1, $2, 'not-a-real-credential', 'Gestor A', 'CASE_WORKER', $3, now()),
         ($4, $5, 'not-a-real-credential', 'Revisor A', 'COMPLIANCE_OFFICER', $3, now()),
         ($6, $7, 'not-a-real-credential', 'Gestor B', 'CASE_WORKER', $8, now())`,
      [
        creatorA,
        `${creatorA}@integration.invalid`,
        publicTenantA,
        reviewerA,
        `${reviewerA}@integration.invalid`,
        creatorB,
        `${creatorB}@integration.invalid`,
        publicTenantB,
      ],
    );

    servicePool = new pg.Pool({
      connectionString: databaseUrl,
      options: resolveDatabaseSearchPathOptions(databaseSchema),
      max: 5,
    });
    prismaClient = new PrismaClient({
      adapter: new PrismaPg(
        servicePool,
        databaseSchema ? { schema: databaseSchema } : undefined,
      ),
    });
    await prismaClient.$connect();
    const prisma = prismaClient as unknown as PrismaService;
    operationalInbox = new OperationalInboxService(prisma);
    search = new SearchService(
      prisma,
      new TasksService(prisma),
      new CommitmentsService(prisma),
      new CasesService(prisma),
    );
  });

  afterAll(async () => {
    await prismaClient?.$disconnect();
    await servicePool?.end();
    await pool?.end();
  });

  async function createDraftPackage(
    tenantId: string,
    creatorId: string,
    scopeKey: string,
  ): Promise<{ packageId: string; ruleId: string }> {
    const packageId = `package-${randomUUID()}`;
    const ruleId = `rule-${randomUUID()}`;
    await pool.query(
      `INSERT INTO "PqrsdRulePackage" (
         "id", "tenantId", "scopeKey", "versionLabel", "sourceUrl",
         "sourceReference", "sourceSha256", "timeZone", "effectiveFrom",
         "nonWorkingWeekdays", "computationMethodNote", "createdById"
       ) VALUES ($1, $2, $3, $4, 'https://entidad.gov.co/norma',
         'Acto administrativo verificable', $5, 'America/Bogota', DATE '2026-09-01',
         ARRAY[0, 6], 'Metodo de computo explicitamente documentado', $6)`,
      [
        packageId,
        tenantId,
        scopeKey,
        `v-${randomUUID()}`,
        'a'.repeat(64),
        creatorId,
      ],
    );
    await pool.query(
      `INSERT INTO "PqrsdRuleDefinition" (
         "id", "tenantId", "packageId", "classificationKey", "label",
         "durationDays", "dayMethod", "startRule", "legalBasis"
       ) VALUES ($1, $2, $3, 'GENERAL', 'Peticion general', 17,
         'WORKING_DAYS', 'NEXT_WORKING_DATE', 'Fundamento juridico del acto citado')`,
      [ruleId, tenantId, packageId],
    );
    return { packageId, ruleId };
  }

  async function addDecision(packageId: string, actorId: string) {
    await pool.query(
      `INSERT INTO "PqrsdRulePackageDecision" (
         "id", "tenantId", "packageId", "decision", "rationale", "actorId"
       ) VALUES ($1, $2, $3, 'APPROVE_ACTIVATE',
         'Fuente, vigencia y calendario revisados de forma independiente', $4)`,
      [`decision-${randomUUID()}`, publicTenantA, packageId, actorId],
    );
  }

  it('rolls back same-actor approval, accepts independent review and protects ledgers', async () => {
    const fixture = await createDraftPackage(
      publicTenantA,
      creatorA,
      `FOUR_EYES_${randomUUID()}`,
    );

    await expectPgCode(
      pool.query(
        `INSERT INTO "PqrsdRulePackageDecision" (
           "id", "tenantId", "packageId", "decision", "rationale", "actorId"
         ) VALUES ($1, $2, $3, 'APPROVE_ACTIVATE',
           'Intento invalido de autoaprobacion', $4)`,
        [
          `decision-${randomUUID()}`,
          publicTenantA,
          fixture.packageId,
          creatorA,
        ],
      ),
      '23514',
    );
    const rejectedCount = await pool.query<{ count: string }>(
      `SELECT count(*) FROM "PqrsdRulePackageDecision"
       WHERE "tenantId" = $1 AND "packageId" = $2`,
      [publicTenantA, fixture.packageId],
    );
    expect(Number(rejectedCount.rows[0]?.count)).toBe(0);

    await addDecision(fixture.packageId, reviewerA);
    await pool.query(
      `UPDATE "PqrsdRulePackage"
       SET "status" = 'ACTIVE', "revision" = 2, "activatedAt" = now()
       WHERE "id" = $1 AND "tenantId" = $2`,
      [fixture.packageId, publicTenantA],
    );
    const activated = await pool.query<{ status: string; revision: number }>(
      `SELECT "status", "revision" FROM "PqrsdRulePackage"
       WHERE "id" = $1 AND "tenantId" = $2`,
      [fixture.packageId, publicTenantA],
    );
    expect(activated.rows[0]).toEqual({ status: 'ACTIVE', revision: 2 });

    await expectPgCode(
      pool.query(
        `UPDATE "PqrsdRuleDefinition" SET "label" = 'Reescritura prohibida'
         WHERE "id" = $1 AND "tenantId" = $2`,
        [fixture.ruleId, publicTenantA],
      ),
      '55000',
    );
  });

  it('rejects cross-tenant composite references and campaign use', async () => {
    const fixture = await createDraftPackage(
      publicTenantA,
      creatorA,
      `TENANT_SCOPE_${randomUUID()}`,
    );
    await expectPgCode(
      pool.query(
        `INSERT INTO "PqrsdDossier" (
           "id", "tenantId", "reference", "rulePackageId", "receivedAt",
           "receivedTimeZone", "receivedChannel", "subject", "description",
           "createdById", "updatedAt"
         ) VALUES ($1, $2, $3, $4, now(), 'America/Bogota', 'Ventanilla',
           'Solicitud aislada', 'Contenido que no debe cruzar entre tenants', $5, now())`,
        [
          `dossier-${randomUUID()}`,
          publicTenantB,
          `PQRSD-INT-${randomUUID()}`,
          fixture.packageId,
          creatorB,
        ],
      ),
      '23503',
    );

    await expectPgCode(
      pool.query(
        `INSERT INTO "PqrsdRulePackage" (
           "id", "tenantId", "scopeKey", "versionLabel", "sourceUrl",
           "sourceReference", "sourceSha256", "timeZone", "effectiveFrom",
           "nonWorkingWeekdays", "computationMethodNote", "createdById"
         ) VALUES ($1, $2, 'INVALID', '1', 'https://entidad.gov.co/norma',
           'Fuente que no habilita campanas', $3, 'America/Bogota', DATE '2026-09-01',
           ARRAY[]::INTEGER[], 'Metodo documentado', $4)`,
        [`package-${randomUUID()}`, campaignTenant, 'b'.repeat(64), creatorA],
      ),
      '42501',
    );
  });

  it('serializes concurrent activation so only one package is active per scope', async () => {
    const scope = `CONCURRENT_${randomUUID()}`;
    const first = await createDraftPackage(publicTenantA, creatorA, scope);
    const second = await createDraftPackage(publicTenantA, creatorA, scope);
    await addDecision(first.packageId, reviewerA);
    await addDecision(second.packageId, reviewerA);

    const clientA = await pool.connect();
    const clientB = await pool.connect();
    try {
      await clientA.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      await clientB.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      await clientA.query(
        `UPDATE "PqrsdRulePackage"
         SET "status" = 'ACTIVE', "revision" = 2, "activatedAt" = now()
         WHERE "id" = $1 AND "tenantId" = $2`,
        [first.packageId, publicTenantA],
      );

      let secondFailure: unknown;
      const competingUpdate = clientB
        .query(
          `UPDATE "PqrsdRulePackage"
           SET "status" = 'ACTIVE', "revision" = 2, "activatedAt" = now()
           WHERE "id" = $1 AND "tenantId" = $2`,
          [second.packageId, publicTenantA],
        )
        .catch((error: unknown) => {
          secondFailure = error;
        });
      await new Promise<void>((resolve) => setImmediate(resolve));
      await clientA.query('COMMIT');
      await competingUpdate;
      // PostgreSQL may surface either the partial-unique violation or the
      // SERIALIZABLE dependency conflict; both force the losing transaction
      // to roll back and preserve the one-active-package invariant.
      expect(['23505', '40001']).toContain(errorCode(secondFailure));
      await clientB.query('ROLLBACK');
    } finally {
      clientA.release();
      clientB.release();
    }

    const active = await pool.query<{ count: string }>(
      `SELECT count(*) FROM "PqrsdRulePackage"
       WHERE "tenantId" = $1 AND "scopeKey" = $2 AND "status" = 'ACTIVE'`,
      [publicTenantA, scope],
    );
    expect(Number(active.rows[0]?.count)).toBe(1);
  });

  it('projects tenant-scoped PQRSD into inbox and search using only the latest deadline and safe fields', async () => {
    const marker = randomUUID();
    const tenantAFixture = await createDraftPackage(
      publicTenantA,
      creatorA,
      `DISCOVERY_A_${marker}`,
    );
    const tenantBFixture = await createDraftPackage(
      publicTenantB,
      creatorB,
      `DISCOVERY_B_${marker}`,
    );
    const openDossierId = `dossier-open-${marker}`;
    const foreignDossierId = `dossier-foreign-${marker}`;
    const closedDossierId = `dossier-closed-${marker}`;
    const cancelledDossierId = `dossier-cancelled-${marker}`;
    const subject = `Alumbrado verificable ${marker}`;

    await pool.query(
      `INSERT INTO "PqrsdDossier" (
         "id", "tenantId", "reference", "rulePackageId", "receivedAt",
         "receivedTimeZone", "receivedChannel", "subject", "description",
         "status", "riskLevel", "currentPrimaryAssigneeId",
         "currentBackupAssigneeId", "createdById", "updatedAt"
       ) VALUES
         ($1, $2, $3, $4, now(), 'America/Bogota', 'Ventanilla', $5,
          $6, 'IN_PROGRESS', 'HIGH', $7, $8, $7, now()),
         ($9, $2, $10, $4, now(), 'America/Bogota', 'Ventanilla',
          'Historico cerrado', 'No debe entrar en trabajo abierto', 'CLOSED',
          'NORMAL', $7, $8, $7, now()),
         ($11, $2, $12, $4, now(), 'America/Bogota', 'Ventanilla',
          'Historico cancelado', 'No debe entrar en trabajo abierto',
          'CANCELLED', 'NORMAL', $7, $8, $7, now()),
         ($13, $14, $15, $16, now(), 'America/Bogota', 'Ventanilla', $5,
          'FOREIGN-PRIVATE-DESCRIPTION', 'IN_PROGRESS', 'HIGH', $17, NULL,
          $17, now())`,
      [
        openDossierId,
        publicTenantA,
        `PQRSD-A-${marker}`,
        tenantAFixture.packageId,
        subject,
        `PRIVATE-DESCRIPTION-${marker}`,
        creatorA,
        reviewerA,
        closedDossierId,
        `PQRSD-CLOSED-${marker}`,
        cancelledDossierId,
        `PQRSD-CANCELLED-${marker}`,
        foreignDossierId,
        publicTenantB,
        `PQRSD-B-${marker}`,
        tenantBFixture.packageId,
        creatorB,
      ],
    );

    const classificationId = `classification-${marker}`;
    await pool.query(
      `INSERT INTO "PqrsdClassificationVersion" (
         "id", "tenantId", "dossierId", "ruleDefinitionId",
         "versionNumber", "categoryKey", "categoryLabel", "competence",
         "department", "competentAuthority", "rationale", "proposedById"
       ) VALUES ($1, $2, $3, $4, 1, 'GENERAL', 'Peticion general',
         'COMPETENT', 'Servicio a la ciudadania', 'Entidad publica A',
         'Clasificacion operativa de integracion', $5)`,
      [
        classificationId,
        publicTenantA,
        openDossierId,
        tenantAFixture.ruleId,
        creatorA,
      ],
    );
    await pool.query(
      `INSERT INTO "PqrsdDeadlineVersion" (
         "id", "tenantId", "dossierId", "classificationId", "packageId",
         "ruleDefinitionId", "versionNumber", "calculationStatus",
         "startLocalDate", "startExplanation", "originalDueLocalDate",
         "currentDueLocalDate", "dueAt", "includedDays", "excludedDays",
         "calculationTrace", "changeReason", "changeAuthority", "createdById"
       ) VALUES
         ($1, $2, $3, $4, $5, $6, 1, 'CALCULATED', DATE '2000-01-01',
          'Version reemplazada', DATE '2000-01-02', DATE '2000-01-02',
          TIMESTAMP '2000-01-03 04:59:00', '[]'::jsonb, '[]'::jsonb,
          '{}'::jsonb, 'Calculo inicial', 'Paquete de prueba', $7),
         ($8, $2, $3, $4, $5, $6, 2, 'CALCULATED', DATE '2098-12-01',
          'Version vigente', DATE '2099-01-01', DATE '2099-01-01',
          TIMESTAMP '2099-01-02 04:59:00', '[]'::jsonb, '[]'::jsonb,
          '{}'::jsonb, 'Correccion aprobada', 'Paquete de prueba', $7)`,
      [
        `deadline-old-${marker}`,
        publicTenantA,
        openDossierId,
        classificationId,
        tenantAFixture.packageId,
        tenantAFixture.ruleId,
        creatorA,
        `deadline-current-${marker}`,
      ],
    );

    const actor: AuthenticatedUser = {
      userId: creatorA,
      tenantId: publicTenantA,
      role: Role.ADMIN,
    };
    const inboxResult = await operationalInbox.findAll(actor, { limit: 20 });
    const inboxPqrsd = inboxResult.items.filter(
      (item) => item.kind === 'PQRSD',
    );
    expect(inboxPqrsd).toHaveLength(1);
    expect(inboxPqrsd[0]).toMatchObject({
      entityId: openDossierId,
      reference: `PQRSD-A-${marker}`,
      title: subject,
      dueAt: '2099-01-02T04:59:00.000Z',
      responsible: { id: creatorA, name: 'Gestor A' },
      priority: 'URGENT',
      cta: {
        href: `/dashboard/pqrsd?view=detail&entityId=${openDossierId}`,
      },
    });
    expect(inboxResult.summary.byKind.pqrsd).toBe(1);
    expect(JSON.stringify(inboxResult)).not.toContain(
      `PRIVATE-DESCRIPTION-${marker}`,
    );
    expect(JSON.stringify(inboxResult)).not.toContain(foreignDossierId);
    expect(JSON.stringify(inboxResult)).not.toContain(closedDossierId);
    expect(JSON.stringify(inboxResult)).not.toContain(cancelledDossierId);

    const searchResult = await search.globalSearch(actor, 'alumbrado');
    expect(searchResult.pqrsd).toEqual([
      {
        id: openDossierId,
        reference: `PQRSD-A-${marker}`,
        subject,
        status: 'IN_PROGRESS',
        riskLevel: 'HIGH',
        dueAt: '2099-01-02T04:59:00.000Z',
        responsible: { id: creatorA, name: 'Gestor A' },
      },
    ]);
    expect(JSON.stringify(searchResult)).not.toContain(
      `PRIVATE-DESCRIPTION-${marker}`,
    );
    expect(JSON.stringify(searchResult)).not.toContain(foreignDossierId);

    await prismaClient.user.updateMany({
      where: { id: creatorA, tenantId: publicTenantA },
      data: { role: Role.COMMUNICATIONS_MANAGER },
    });
    try {
      const deniedInbox = await operationalInbox.findAll(actor, { limit: 20 });
      const deniedSearch = await search.globalSearch(actor, 'alumbrado');
      expect(deniedInbox.summary.byKind.pqrsd).toBe(0);
      expect(deniedSearch.pqrsd).toEqual([]);
    } finally {
      await prismaClient.user.updateMany({
        where: { id: creatorA, tenantId: publicTenantA },
        data: { role: Role.CASE_WORKER },
      });
    }
  });
});
