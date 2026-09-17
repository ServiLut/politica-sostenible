import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(
  __dirname,
  '../../prisma/migrations/20260909280000_public_office_pqrsd/migration.sql',
);
const migration = readFileSync(migrationPath, 'utf8');

describe('PQRSD PostgreSQL migration contract', () => {
  it('is one atomic migration and extends Storage without recreating its enum', () => {
    expect(migration).toMatch(/^(?:--[^\n]*\n)*BEGIN;/u);
    expect(migration.trimEnd().endsWith('COMMIT;')).toBe(true);
    expect(migration).toContain(
      `ALTER TYPE "StorageObjectModule" ADD VALUE IF NOT EXISTS 'PQRSD'`,
    );
    expect(migration).not.toMatch(/CREATE TYPE\s+"StorageObjectModule"/u);
  });

  it('enforces PUBLIC_OFFICE, tenant-scoped foreign keys and a single active package', () => {
    expect(migration).toContain('pqrsd_assert_public_office_tenant');
    expect(migration).toMatch(/FOREIGN KEY \("rulePackageId", "tenantId"\)/u);
    expect(migration).toMatch(/FOREIGN KEY \("dossierId", "tenantId"\)/u);
    expect(migration).toContain('PqrsdRulePackage_one_active_scope');
    expect(migration).toContain(`WHERE "status" = 'ACTIVE'`);
  });

  it('makes evidentiary ledgers append-only and guards four-eyes decisions', () => {
    expect(migration).toContain('pqrsd_reject_ledger_mutation');
    expect(migration).toContain('pqrsd_enforce_four_eyes');
    expect(migration).toContain('pqrsd_validate_delivery_evidence');
  });

  it('contains no universal 10/15/30-day legal constants', () => {
    expect(migration).not.toMatch(/DEFAULT\s+(10|15|30)\b/u);
    expect(migration).toContain('"durationDays" INTEGER NOT NULL');
    expect(migration).toContain('"calculationTrace" JSONB NOT NULL');
  });
});
