import pg from 'pg';
import { PqrsdDossierStatus, Prisma } from '../../prisma/generated/prisma';
import { rankedPqrsdIdsSql } from './operational-inbox-ranking';

const databaseUrl = process.env.OPERATIONAL_INBOX_TEST_DATABASE_URL?.trim();
const physicalDescribe = databaseUrl ? describe : describe.skip;

physicalDescribe('Operational inbox bounded ranking on PostgreSQL', () => {
  let client: pg.Client;
  const now = new Date('2026-10-16T12:00:00.000Z');
  const openStatuses = [
    PqrsdDossierStatus.IN_PROGRESS,
    PqrsdDossierStatus.RECEIVED,
  ];
  const select = async (tenantId = 'tenant-a', limit = 100) => {
    const query: Prisma.Sql = rankedPqrsdIdsSql(
      tenantId,
      openStatuses,
      now,
      limit,
    );
    const result = await client.query<{ id: string }>(query.text, [
      ...query.values,
    ]);
    return result.rows.map((row) => row.id);
  };

  beforeAll(async () => {
    // Deliberately separate opt-in from shared integration/production settings.
    if (
      !databaseUrl ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(
        new URL(databaseUrl).hostname,
      )
    ) {
      throw new Error(
        'Operational inbox ranking tests require an explicit loopback PostgreSQL URL',
      );
    }
    client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(`
      CREATE TEMP TABLE "User" (
        "id" text, "tenantId" text, "isActive" boolean
      );
      CREATE TEMP TABLE "PqrsdDossier" (
        "id" text, "tenantId" text, "status" text, "riskLevel" text,
        "currentPrimaryAssigneeId" text, "currentBackupAssigneeId" text,
        "createdAt" timestamp
      );
      CREATE TEMP TABLE "PqrsdDeadlineVersion" (
        "tenantId" text, "dossierId" text, "versionNumber" integer,
        "calculationStatus" text, "dueAt" timestamp
      );
      INSERT INTO "User" VALUES ('primary', 'tenant-a', true), ('backup', 'tenant-a', true), ('inactive', 'tenant-a', false);
      INSERT INTO "PqrsdDossier"
        SELECT 'normal-' || lpad(i::text, 3, '0'), 'tenant-a', 'IN_PROGRESS', 'NORMAL', 'primary', 'backup', '2025-01-01'
        FROM generate_series(1, 101) AS i;
      INSERT INTO "PqrsdDeadlineVersion"
        SELECT 'tenant-a', "id", 1, 'CALCULATED', '2099-01-01' FROM "PqrsdDossier";
      INSERT INTO "PqrsdDossier" VALUES
        ('urgent-undated', 'tenant-a', 'IN_PROGRESS', 'HIGH', 'primary', 'backup', '2026-01-01'),
        ('overdue-normal', 'tenant-a', 'IN_PROGRESS', 'NORMAL', 'primary', 'backup', '2026-01-01'),
        ('near-deadline', 'tenant-a', 'IN_PROGRESS', 'NORMAL', 'primary', 'backup', '2026-01-01'),
        ('blocked-normal', 'tenant-a', 'IN_PROGRESS', 'NORMAL', 'primary', 'inactive', '2026-01-01'),
        ('old-deadline-invalidated', 'tenant-a', 'IN_PROGRESS', 'NORMAL', 'primary', 'backup', '2026-01-01'),
        ('foreign-urgent', 'tenant-b', 'IN_PROGRESS', 'HIGH', null, null, '2020-01-01'),
        ('closed-urgent', 'tenant-a', 'CLOSED', 'HIGH', null, null, '2020-01-01');
      INSERT INTO "PqrsdDeadlineVersion" VALUES
        ('tenant-a', 'overdue-normal', 1, 'MANUAL_REVIEWED', '2026-10-15'),
        ('tenant-a', 'near-deadline', 1, 'CALCULATED', '2026-10-19 12:00:00'),
        ('tenant-a', 'blocked-normal', 1, 'CALCULATED', '2099-01-02'),
        ('tenant-a', 'old-deadline-invalidated', 1, 'CALCULATED', '2020-01-01'),
        ('tenant-a', 'old-deadline-invalidated', 2, 'PENDING', '2020-01-01'),
        ('tenant-b', 'normal-001', 999, 'CALCULATED', '2000-01-01');
    `);
  });

  afterAll(async () => {
    await client?.end();
  });

  it('ranks the full source before LIMIT, uses only the latest approved deadline and isolates all tenant joins', async () => {
    const ids = await select();
    expect(ids).toHaveLength(100);
    expect(ids.slice(0, 5)).toEqual([
      'overdue-normal',
      'urgent-undated',
      'near-deadline',
      'blocked-normal',
      'old-deadline-invalidated',
    ]);
    expect(ids).not.toContain('foreign-urgent');
    expect(ids).not.toContain('closed-urgent');
    expect(new Set(ids).size).toBe(100);
  });

  it('keeps the boundary at now non-overdue and the three-day threshold inclusive', async () => {
    await client.query(
      `UPDATE "PqrsdDeadlineVersion" SET "dueAt" = $1 WHERE "dossierId" = 'overdue-normal'`,
      [now.toISOString()],
    );
    const ids = await select('tenant-a', 3);
    expect(ids).toEqual(['urgent-undated', 'overdue-normal', 'near-deadline']);
  });

  it('binds tenant identifiers as values rather than SQL text', async () => {
    expect(await select("tenant-a' OR true --")).toEqual([]);
  });

  it('keeps the same deadline ranking when the PostgreSQL session uses Colombia time', async () => {
    const utcOrder = await select();
    await client.query("SET TIME ZONE 'America/Bogota'");
    expect(await select()).toEqual(utcOrder);
    await client.query("SET TIME ZONE 'UTC'");
  });
});
