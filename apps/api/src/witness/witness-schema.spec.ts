import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('E-14 database invariants', () => {
  const schema = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(
    resolve(
      'prisma/migrations/20260902000000_account_security_and_e14_reconciliation/migration.sql',
    ),
    'utf8',
  );

  it('models multiple reports per table and the complete review lifecycle', () => {
    expect(schema).toContain('enum WitnessReportStatus');
    expect(schema).toContain('status            WitnessReportStatus @default(PENDING)');
    expect(schema).not.toContain('@@unique([tenantId, puestoId, mesa])');
    expect(schema).toContain('expectedTables Int?');
  });

  it('enforces one accepted act and four-eyes review in PostgreSQL', () => {
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX "WitnessReport_one_accepted_per_table_key"[\s\S]*WHERE "status" = 'ACCEPTED'/,
    );
    expect(migration).toContain('"reviewerId" <> "witnessId"');
    expect(migration).toContain('"reviewReason" IS NOT NULL');
    expect(migration).toContain('"supersededById" IS NOT NULL');
    expect(migration).toContain('"expectedTables" BETWEEN 1 AND 99999');
  });

  it('migrates existing reports without rewriting the published baseline', () => {
    expect(migration).toContain(
      'DROP INDEX "WitnessReport_tenantId_puestoId_mesa_key"',
    );
    expect(migration).toMatch(
      /ADD COLUMN "updatedAt" TIMESTAMP\(3\);[\s\S]*SET "updatedAt" = "createdAt"[\s\S]*ALTER COLUMN "updatedAt" SET NOT NULL/,
    );
  });
});
