import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  CneCode,
  EntryType,
  FinanceStatus,
  Prisma,
  PrismaClient,
  Role,
  StoredObjectStatus,
  StorageObjectModule,
} from '../../prisma/generated/prisma';

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const describeWithPostgres = testDatabaseUrl ? describe : describe.skip;

describeWithPostgres('Prisma 7.9 PostgreSQL integration', () => {
  const runId = randomUUID();
  const ownedTenantIds = new Set<string>();
  let sequence = 0;
  let prisma: PrismaClient;

  const nextId = (label: string) => {
    sequence += 1;
    return `it-p79-${label}-${runId}-${sequence}`;
  };

  const createTenant = async () => {
    const id = nextId('tenant');
    ownedTenantIds.add(id);

    return prisma.tenant.create({
      data: {
        id,
        slug: nextId('slug'),
        name: 'Tenant de integración Prisma',
      },
    });
  };

  const createUser = async (tenantId: string) =>
    prisma.user.create({
      data: {
        id: nextId('user'),
        tenantId,
        email: `${nextId('email')}@integration.invalid`,
        password: 'not-a-real-password-hash',
        name: 'Usuario de integración',
        role: Role.ADMIN,
        documentId: nextId('document'),
      },
    });

  beforeAll(async () => {
    const adapter = new PrismaPg({ connectionString: testDatabaseUrl });
    prisma = new PrismaClient({ adapter });
    await prisma.$connect();
  });

  afterEach(async () => {
    const tenantIds = [...ownedTenantIds];
    if (tenantIds.length === 0) {
      return;
    }

    try {
      // El borrado permanece acotado a los tenants creados por este archivo.
      await prisma.$transaction([
        prisma.storedObject.deleteMany({
          where: { tenantId: { in: tenantIds } },
        }),
        prisma.financialEntry.deleteMany({
          where: { tenantId: { in: tenantIds } },
        }),
        prisma.teamInvitation.deleteMany({
          where: { tenantId: { in: tenantIds } },
        }),
        prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } }),
        prisma.campaignSettings.deleteMany({
          where: { tenantId: { in: tenantIds } },
        }),
        prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }),
      ]);
    } finally {
      ownedTenantIds.clear();
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rolls back an interactive serializable transaction', async () => {
    const tenantId = nextId('rollback-tenant');
    ownedTenantIds.add(tenantId);

    await expect(
      prisma.$transaction(
        async (transaction) => {
          await transaction.tenant.create({
            data: {
              id: tenantId,
              slug: nextId('rollback-slug'),
              name: 'Este tenant debe revertirse',
            },
          });

          throw new Error('intentional-integration-rollback');
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      ),
    ).rejects.toThrow('intentional-integration-rollback');

    await expect(
      prisma.tenant.findUnique({ where: { id: tenantId } }),
    ).resolves.toBeNull();
  });

  it('round-trips PostgreSQL Decimal and DateTime values without precision loss', async () => {
    const tenant = await createTenant();
    const reporter = await createUser(tenant.id);
    const amount = '9876543210123.45';
    const occurredAt = new Date('2026-08-21T16:23:45.678Z');

    const created = await prisma.financialEntry.create({
      data: {
        id: nextId('finance'),
        tenantId: tenant.id,
        reporterId: reporter.id,
        type: EntryType.EXPENSE,
        amount: new Prisma.Decimal(amount),
        date: occurredAt,
        cneCode: CneCode.OTROS,
        description: 'Validación de precisión del adaptador PostgreSQL',
        vendorName: 'Proveedor de prueba',
        vendorTaxId: nextId('tax'),
      },
    });

    const persisted = await prisma.financialEntry.findUniqueOrThrow({
      where: { id: created.id },
    });

    expect(persisted.amount.toFixed(2)).toBe(amount);
    expect(persisted.date.toISOString()).toBe(occurredAt.toISOString());
  });

  it('rejects a composite relation that crosses tenant boundaries', async () => {
    const tenantA = await createTenant();
    const tenantB = await createTenant();
    const reporterFromTenantA = await createUser(tenantA.id);

    await expect(
      prisma.financialEntry.create({
        data: {
          id: nextId('cross-tenant-finance'),
          tenantId: tenantB.id,
          reporterId: reporterFromTenantA.id,
          type: EntryType.INCOME,
          amount: new Prisma.Decimal('125000.00'),
          date: new Date('2026-08-21T00:00:00.000Z'),
          cneCode: CneCode.OTROS,
          description: 'Esta relación debe ser rechazada',
          vendorName: 'Aportante de prueba',
          vendorTaxId: nextId('tax'),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });

    await expect(
      prisma.financialEntry.count({ where: { tenantId: tenantB.id } }),
    ).resolves.toBe(0);
  });

  it('enforces an independent reviewer and a complete financial review state', async () => {
    const tenant = await createTenant();
    const reporter = await createUser(tenant.id);
    const reviewer = await createUser(tenant.id);
    const entry = await prisma.financialEntry.create({
      data: {
        id: nextId('review-entry'),
        tenantId: tenant.id,
        reporterId: reporter.id,
        type: EntryType.EXPENSE,
        amount: new Prisma.Decimal('1000.00'),
        date: new Date('2026-08-27T00:00:00.000Z'),
        cneCode: CneCode.OTROS,
        description: 'Movimiento pendiente de control independiente',
        vendorName: 'Proveedor de integración',
        vendorTaxId: nextId('review-tax'),
        evidenceUrl: `${tenant.id}/finance/${randomUUID()}.pdf`,
      },
    });

    await expect(
      prisma.financialEntry.update({
        where: { id: entry.id },
        data: {
          status: FinanceStatus.APPROVED,
          reviewedById: reporter.id,
          reviewedAt: new Date(),
          reviewReason: 'El mismo reportante intenta aprobar el movimiento',
        },
      }),
    ).rejects.toBeDefined();

    await expect(
      prisma.financialEntry.update({
        where: { id: entry.id },
        data: {
          status: FinanceStatus.REJECTED,
          reviewedById: reviewer.id,
          reviewedAt: new Date(),
          reviewReason: 'corto',
        },
      }),
    ).rejects.toBeDefined();

    const reviewed = await prisma.financialEntry.update({
      where: { id: entry.id },
      data: {
        status: FinanceStatus.APPROVED,
        reviewedById: reviewer.id,
        reviewedAt: new Date(),
        reviewReason: 'Soporte y clasificación verificados independientemente',
      },
    });

    expect(reviewed.status).toBe(FinanceStatus.APPROVED);
    expect(reviewed.reviewedById).toBe(reviewer.id);
  });

  it('enforces the private-object lifecycle and canonical tenant path', async () => {
    const tenant = await createTenant();
    const uploader = await createUser(tenant.id);
    const path = `${tenant.id}/e14/${randomUUID()}.pdf`;
    const stored = await prisma.storedObject.create({
      data: {
        id: nextId('stored'),
        tenantId: tenant.id,
        uploaderId: uploader.id,
        path,
        module: StorageObjectModule.E14,
        contentType: 'application/pdf',
        expectedSize: 512,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await expect(
      prisma.storedObject.update({
        where: { id: stored.id },
        data: {
          status: StoredObjectStatus.CONSUMED,
          consumedAt: new Date(),
          consumedByType: 'WitnessReport',
          consumedById: 'report-a',
        },
      }),
    ).rejects.toBeDefined();

    const confirmedAt = new Date();
    await prisma.storedObject.update({
      where: { id: stored.id },
      data: {
        status: StoredObjectStatus.CONFIRMED,
        actualSize: 512,
        confirmedAt,
      },
    });
    const consumed = await prisma.storedObject.update({
      where: { id: stored.id },
      data: {
        status: StoredObjectStatus.CONSUMED,
        consumedAt: new Date(),
        consumedByType: 'WitnessReport',
        consumedById: 'report-a',
      },
    });

    expect(consumed.status).toBe(StoredObjectStatus.CONSUMED);
    expect(consumed.confirmedAt?.toISOString()).toBe(confirmedAt.toISOString());
  });

  it('allows exactly one winner for a concurrent tenant-scoped unique key', async () => {
    const tenant = await createTenant();
    const sharedDocumentId = nextId('shared-document');
    const createContender = (contender: string) =>
      prisma.user.create({
        data: {
          id: nextId(`concurrent-user-${contender}`),
          tenantId: tenant.id,
          email: `${nextId(`concurrent-email-${contender}`)}@integration.invalid`,
          password: 'not-a-real-password-hash',
          name: `Contendiente ${contender}`,
          role: Role.VOLUNTEER,
          documentId: sharedDocumentId,
        },
      });

    const outcomes = await Promise.allSettled([
      createContender('a'),
      createContender('b'),
    ]);
    const fulfilled = outcomes.filter(
      (outcome) => outcome.status === 'fulfilled',
    );
    const rejected = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult =>
        outcome.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: 'P2002' });
    await expect(
      prisma.user.count({
        where: { tenantId: tenant.id, documentId: sharedDocumentId },
      }),
    ).resolves.toBe(1);
  });
});
