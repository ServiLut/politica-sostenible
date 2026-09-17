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
  const contextMigration = readFileSync(
    resolve(
      'prisma/migrations/20260909160000_witness_capture_context_isolation/migration.sql',
    ),
    'utf8',
  );
  const offlineGrantMigration = readFileSync(
    resolve(
      'prisma/migrations/20260909170000_offline_e14_capture_grants/migration.sql',
    ),
    'utf8',
  );

  it('models multiple reports per table and the complete review lifecycle', () => {
    expect(schema).toContain('enum WitnessReportStatus');
    expect(schema).toMatch(
      /status\s+WitnessReportStatus\s+@default\(PENDING\)/,
    );
    expect(schema).not.toContain('@@unique([tenantId, puestoId, mesa])');
    expect(schema).toMatch(/expectedTables\s+Int\?/);
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

  it('quarantines legacy data and makes the capture context required without a dangerous default', () => {
    expect(schema).toContain('enum WitnessCaptureContext');
    expect(schema).toMatch(
      /captureContext\s+WitnessCaptureContext(?:\s|\r?\n)/,
    );
    expect(schema).not.toMatch(
      /captureContext\s+WitnessCaptureContext\s+@default/,
    );
    expect(contextMigration).toMatch(
      /ADD COLUMN "captureContext" "WitnessCaptureContext";[\s\S]*SET "captureContext" = 'LEGACY_UNCLASSIFIED'[\s\S]*ALTER COLUMN "captureContext" SET NOT NULL/,
    );
  });

  it('isolates accepted results and supersession by capture context in PostgreSQL', () => {
    expect(contextMigration).toContain(
      'DROP INDEX "WitnessReport_one_accepted_per_table_key"',
    );
    expect(contextMigration).toMatch(
      /CREATE UNIQUE INDEX "WitnessReport_one_accepted_per_context_table_key"[\s\S]*"tenantId", "captureContext", "puestoId", "mesa"[\s\S]*WHERE "status" = 'ACCEPTED'/,
    );
    expect(contextMigration).toMatch(
      /FOREIGN KEY \("supersededById", "tenantId", "captureContext"\)[\s\S]*REFERENCES "WitnessReport"\("id", "tenantId", "captureContext"\)/,
    );
    expect(contextMigration).toContain(
      'CREATE TRIGGER "WitnessReport_captureContext_immutable"',
    );
    expect(contextMigration).toContain(
      'NEW."captureContext" IS DISTINCT FROM OLD."captureContext"',
    );
  });

  it('registers tenant-scoped offline grants without storing the opaque token', () => {
    expect(schema).toMatch(
      /model OfflineE14CaptureGrant[\s\S]*tenantId\s+String/,
    );
    expect(schema).toMatch(/tokenHmac\s+String\s+@unique\s+@db\.Char\(64\)/);
    expect(schema).not.toMatch(
      /OfflineE14CaptureGrant[\s\S]*captureGrant\s+String/,
    );
    expect(offlineGrantMigration).toContain(
      'FOREIGN KEY ("actorUserId", "tenantId") REFERENCES "User"("id", "tenantId")',
    );
    expect(offlineGrantMigration).toContain(
      'FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId")',
    );
    expect(offlineGrantMigration).toContain(
      'FOREIGN KEY ("puestoId", "tenantId") REFERENCES "PoliticalDivision"("id", "tenantId")',
    );
  });

  it('enforces grant context/stage, tables and lowercase SHA continuity in PostgreSQL', () => {
    expect(offlineGrantMigration).toMatch(
      /"captureContext" = 'SIMULATION'[\s\S]*"issuedStage" = 'SIMULATION'[\s\S]*"captureContext" = 'REAL'[\s\S]*"issuedStage" = 'ELECTION_DAY'/,
    );
    expect(offlineGrantMigration).toContain(
      'CONSTRAINT "OfflineE14GrantPlace_tables_check" CHECK ("expectedTables" > 0)',
    );
    expect(offlineGrantMigration).toContain("~ '^[0-9a-f]{64}$'");
    expect(offlineGrantMigration).toContain(
      '"expectedSha256" = "reportedSha256"',
    );
  });

  it('is forward-only and never reclassifies pre-existing witness reports', () => {
    expect(offlineGrantMigration).not.toMatch(
      /UPDATE\s+"WitnessReport"|ALTER\s+TABLE\s+"WitnessReport"/i,
    );
    expect(offlineGrantMigration).toContain(
      'Existing reports remain LEGACY_UNCLASSIFIED',
    );
  });
});
