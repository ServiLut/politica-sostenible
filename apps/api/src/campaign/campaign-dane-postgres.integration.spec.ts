import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  DivisionType,
  ElectoralCatalogStatus,
  ElectoralCatalogType,
  ElectoralCodeNamespace,
  PoliticalOperationMode,
  Prisma,
  PrismaClient,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  PrismaService,
  resolveDatabaseSearchPathOptions,
} from '../prisma/prisma.service';
import { CampaignService } from './campaign.service';
import { DaneDivipolaClient } from './dane-divipola.client';
import { TerritoryHeatmapMetric } from './dto/territory-heatmap-query.dto';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const rollback = new Error('DANE_CONTRACT_TEST_ROLLBACK');

describeWithPostgres('DANE projection on real PostgreSQL constraints', () => {
  let prisma: PrismaClient;
  const run = randomUUID();
  const municipalities = [
    {
      departmentCode: '05',
      departmentName: 'ANTIOQUIA',
      municipalityCode: '05001',
      municipalityName: 'MEDELLÍN',
      latitude: 6.257588062416838,
      longitude: -75.61103575925108,
    },
  ];
  const departments = [
    {
      code: '05',
      name: 'ANTIOQUIA',
      latitude: 6.922837661599162,
      longitude: -75.5650154399505,
    },
  ];
  // Only the external provider is a deterministic fixture. Prisma, constraints,
  // provenance triggers, permission reads and advisory locks execute in PG.
  const provider = {
    fetchMunicipalities: () => Promise.resolve(municipalities),
    fetchDepartments: () => Promise.resolve(departments),
  } as DaneDivipolaClient;

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (
      url.protocol !== 'postgresql:' ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.username !== 'politica_test' ||
      url.pathname !== '/politica_sostenible_test' ||
      url.searchParams.get('schema') !== 'politica-sostenible'
    )
      throw new Error('EXPLICIT_LOOPBACK_TEST_DATABASE_REQUIRED');
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        {
          connectionString: databaseUrl,
          options: resolveDatabaseSearchPathOptions('politica-sostenible'),
        },
        { schema: 'politica-sostenible' },
      ),
    });
    await prisma.$connect();
    const migrations = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) FROM "politica-sostenible"._prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    `;
    expect(Number(migrations[0].count)).toBe(44);
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function withRollback(
    test: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    await expect(
      prisma.$transaction(
        async (tx) => {
          await test(tx);
          throw rollback;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 60_000,
        },
      ),
    ).rejects.toBe(rollback);
    expect(
      await prisma.tenant.count({
        where: { slug: { startsWith: `dane-it-${run}` } },
      }),
    ).toBe(0);
  }

  function service(tx: Prisma.TransactionClient, source = provider) {
    // A real SAVEPOINT preserves the service's rollback boundary inside the
    // outer fixture transaction; no immutable historical record is deleted.
    const client = new Proxy(tx, {
      get(target, property) {
        if (property === '$transaction')
          return async (
            callback: (value: Prisma.TransactionClient) => Promise<unknown>,
          ) => {
            await tx.$executeRawUnsafe('SAVEPOINT dane_contract_service');
            try {
              const value = await callback(tx);
              await tx.$executeRawUnsafe(
                'RELEASE SAVEPOINT dane_contract_service',
              );
              return value;
            } catch (error) {
              await tx.$executeRawUnsafe(
                'ROLLBACK TO SAVEPOINT dane_contract_service',
              );
              await tx.$executeRawUnsafe(
                'RELEASE SAVEPOINT dane_contract_service',
              );
              throw error;
            }
          };
        const value: unknown = Reflect.get(target, property);
        return value;
      },
    });
    return new CampaignService(client as unknown as PrismaService, source);
  }

  async function actor(
    tx: Prisma.TransactionClient,
    label: string,
  ): Promise<AuthenticatedUser> {
    const tenant = await tx.tenant.create({
      data: {
        slug: `dane-it-${run}-${label}`,
        name: 'PRUEBA DANE SIN VALIDEZ',
        type: TenantType.CANDIDACY,
        defaultMode: PoliticalOperationMode.CAMPAIGN,
      },
    });
    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        name: 'PRUEBA ADMIN SIN VALIDEZ',
        email: `dane-${label}-${run}@example.invalid`,
        password: 'synthetic-unusable-password',
        documentId: `DANE-${label}-${run}`,
        role: Role.ADMIN,
      },
    });
    return { tenantId: tenant.id, userId: user.id, role: Role.ADMIN };
  }

  it('preserves old snapshot history when official normalized content changes', async () =>
    withRollback(async (tx) => {
      const user = await actor(tx, 'changed');
      await service(tx).initializeElectoralData(user);
      const before = await tx.electoralCatalogRelease.findFirstOrThrow({
        where: { tenantId: user.tenantId },
      });
      const original = await tx.electoralCatalogEntry.findFirstOrThrow({
        where: {
          tenantId: user.tenantId,
          releaseId: before.id,
          canonicalCode: '05/001',
        },
      });
      const changed = {
        ...provider,
        fetchMunicipalities: () =>
          Promise.resolve(
            municipalities.map((row) => ({ ...row, longitude: -75.62 })),
          ),
      } as DaneDivipolaClient;
      await service(tx, changed).initializeElectoralData(user);
      const releases = await tx.electoralCatalogRelease.findMany({
        where: { tenantId: user.tenantId },
      });
      expect(releases).toHaveLength(2);
      expect(new Set(releases.map((row) => row.contentSha256)).size).toBe(2);
      expect(
        releases.every(
          (row) =>
            row.status === ElectoralCatalogStatus.VALIDATED &&
            row.approvedById === null,
        ),
      ).toBe(true);
      const retained = await tx.electoralCatalogEntry.findFirstOrThrow({
        where: { tenantId: user.tenantId, id: original.id },
      });
      expect(Number(retained.longitude)).toBe(Number(original.longitude));
      const division = await tx.politicalDivision.findFirstOrThrow({
        where: { tenantId: user.tenantId, code: '05/001' },
      });
      expect(division.sourceReleaseId).not.toBe(before.id);
      expect(Number(division.longitude)).toBe(-75.62);
      await tx.$executeRawUnsafe('SAVEPOINT immutable_snapshot');
      await expect(
        tx.electoralCatalogEntry.updateMany({
          where: { tenantId: user.tenantId, id: original.id },
          data: { longitude: -70 },
        }),
      ).rejects.toThrow();
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT immutable_snapshot');
    }));

  it('validates an immutable snapshot, preserves legacy ID and children, and reuses its checksum', async () =>
    withRollback(async (tx) => {
      const user = await actor(tx, 'legacy');
      const dept = await tx.politicalDivision.create({
        data: {
          tenantId: user.tenantId,
          code: '05',
          name: 'Legacy',
          type: DivisionType.DEPARTAMENTO,
        },
      });
      const legacy = await tx.politicalDivision.create({
        data: {
          tenantId: user.tenantId,
          code: '05001',
          name: 'Legacy',
          type: DivisionType.MUNICIPIO,
          parentId: dept.id,
        },
      });
      const child = await tx.politicalDivision.create({
        data: {
          tenantId: user.tenantId,
          code: 'QA-ZONE',
          name: 'PRUEBA',
          type: DivisionType.ZONA,
          parentId: legacy.id,
        },
      });
      await tx.user.update({
        where: { id: user.userId, tenantId: user.tenantId },
        data: { divisionId: legacy.id },
      });
      const campaign = service(tx);
      await campaign.initializeElectoralData(user);
      const row = await tx.politicalDivision.findFirstOrThrow({
        where: { tenantId: user.tenantId, id: legacy.id },
      });
      expect(row.code).toBe('05/001');
      expect(row.sourceNamespace).toBe(ElectoralCodeNamespace.DANE_DIVIPOLA);
      expect(row.sourceReleaseId).not.toBeNull();
      expect(Number(row.latitude)).toBeCloseTo(6.257588, 6);
      expect(
        (
          await tx.politicalDivision.findFirstOrThrow({
            where: { tenantId: user.tenantId, id: child.id },
          })
        ).parentId,
      ).toBe(legacy.id);
      expect(
        (
          await tx.user.findFirstOrThrow({
            where: { tenantId: user.tenantId, id: user.userId },
          })
        ).divisionId,
      ).toBe(legacy.id);
      const release = await tx.electoralCatalogRelease.findFirstOrThrow({
        where: { tenantId: user.tenantId, id: row.sourceReleaseId! },
      });
      expect(release.status).toBe(ElectoralCatalogStatus.VALIDATED);
      expect(release.type).toBe(ElectoralCatalogType.ADMINISTRATIVE_DANE);
      expect(release.contentSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(release.recordCount).toBe(2);
      expect(release.activatedById).toBeNull();
      expect(release.approvedById).toBeNull();
      expect(release.sourceCutoffAt).toBeNull();
      expect(
        await tx.electoralCatalogEntry.count({
          where: { tenantId: user.tenantId, releaseId: release.id },
        }),
      ).toBe(2);
      await campaign.initializeElectoralData(user);
      expect(
        await tx.electoralCatalogRelease.count({
          where: { tenantId: user.tenantId },
        }),
      ).toBe(1);
      expect(
        (
          await tx.politicalDivision.findFirstOrThrow({
            where: { tenantId: user.tenantId, id: legacy.id },
          })
        ).sourceReleaseId,
      ).toBe(release.id);
      const heatmap = await campaign.getTerritoryHeatmap(user, {
        level: DivisionType.MUNICIPIO,
        parentId: dept.id,
        metric: TerritoryHeatmapMetric.E14_COVERAGE,
      });
      expect(heatmap.items).toHaveLength(1);
      expect(heatmap.items[0].geo).toMatchObject({
        basis: 'ADMINISTRATIVE_CENTROID',
        locatedPollingPlaces: 0,
        totalPollingPlaces: 0,
      });
      expect(heatmap.items[0].operationalContext).toEqual({
        expectedTables: 0,
        acceptedTables: 0,
      });
    }));

  it('creates canonical rows with no legacy and keeps equal source hashes isolated per tenant', async () =>
    withRollback(async (tx) => {
      const a = await actor(tx, 'a'),
        b = await actor(tx, 'b');
      const campaign = service(tx);
      await campaign.initializeElectoralData(a);
      await campaign.initializeElectoralData(b);
      const ra = await tx.electoralCatalogRelease.findFirstOrThrow({
        where: { tenantId: a.tenantId },
      });
      const rb = await tx.electoralCatalogRelease.findFirstOrThrow({
        where: { tenantId: b.tenantId },
      });
      expect(ra.id).not.toBe(rb.id);
      expect(ra.contentSha256).toBe(rb.contentSha256);
      for (const user of [a, b]) {
        const rows = await tx.politicalDivision.findMany({
          where: { tenantId: user.tenantId },
        });
        expect(rows).toHaveLength(2);
        expect(rows.map((row) => row.code).sort()).toEqual(['05', '05/001']);
        expect(
          rows.every(
            (row) => row.sourceReleaseId === (user === a ? ra.id : rb.id),
          ),
        ).toBe(true);
      }
      await tx.$executeRawUnsafe('SAVEPOINT cross_tenant_constraint');
      await expect(
        tx.politicalDivision.updateMany({
          where: { tenantId: a.tenantId, code: '05/001' },
          data: { sourceReleaseId: rb.id },
        }),
      ).rejects.toThrow();
      await tx.$executeRawUnsafe(
        'ROLLBACK TO SAVEPOINT cross_tenant_constraint',
      );
    }));

  it('refuses two legacy/canonical candidates and rolls back every new snapshot row', async () =>
    withRollback(async (tx) => {
      const user = await actor(tx, 'duplicate');
      for (const code of ['05001', '05/001'])
        await tx.politicalDivision.create({
          data: {
            tenantId: user.tenantId,
            code,
            name: 'PRUEBA DUPLICADA',
            type: DivisionType.MUNICIPIO,
          },
        });
      await expect(
        service(tx).initializeElectoralData(user),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(
        await tx.electoralCatalogRelease.count({
          where: { tenantId: user.tenantId },
        }),
      ).toBe(0);
      expect(
        await tx.electoralCatalogEntry.count({
          where: { tenantId: user.tenantId },
        }),
      ).toBe(0);
      expect(
        await tx.auditEvent.count({ where: { tenantId: user.tenantId } }),
      ).toBe(0);
      const rows = await tx.politicalDivision.findMany({
        where: { tenantId: user.tenantId },
      });
      expect(rows.map((row) => row.code).sort()).toEqual(['05/001', '05001']);
      expect(rows.every((row) => row.sourceReleaseId === null)).toBe(true);
    }));
});
