import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(
    __dirname,
    '../../prisma/migrations/20260909250000_post_election_scrutiny/migration.sql',
  ),
  'utf8',
);

describe('post-election scrutiny database contract', () => {
  it('is one atomic migration and adds the private scrutiny Storage module safely', () => {
    expect(migration.trimStart()).toMatch(/^BEGIN;/);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/);
    expect(migration).toContain("'SCRUTINY'");
    expect(migration).toMatch(
      /ALTER TYPE "StorageObjectModule" ADD VALUE IF NOT EXISTS 'SCRUTINY';/,
    );
    expect(migration).not.toMatch(/CREATE TYPE "StorageObjectModule"/);
    expect(migration).toMatch(
      /"scrutiny_validate_document_artifact"[\s\S]*stored\."module" <> 'SCRUTINY'[\s\S]*stored\."status" <> 'CONSUMED'/,
    );
  });

  it('keeps internal, filed, decided and official evidence semantically distinct', () => {
    expect(migration).toMatch(
      /CREATE TYPE "ScrutinyEvidenceState" AS ENUM \(\s*'INTERNAL',\s*'FILED',\s*'DECIDED',\s*'OFFICIAL'/,
    );
    expect(migration).toMatch(
      /"evidenceState" = 'INTERNAL'[\s\S]*"externalAt" IS NULL[\s\S]*"evidenceState" <> 'INTERNAL'[\s\S]*"externalReference"/,
    );
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX "ScrutinyDeclaration_one_official_scope_key"[\s\S]*WHERE "status" = 'OFFICIAL'/,
    );
  });

  it('models all essential electoral documents and explicit applicability', () => {
    for (const type of [
      'E14_CLAVEROS',
      'E16_CREDENTIAL',
      'E23',
      'E24',
      'E25',
      'E26',
      'GENERAL_ACT',
      'RESOLUTION',
      'APPEAL',
      'NOTICE',
      'DECLARATION_CREDENTIAL',
    ]) {
      expect(migration).toContain(`'${type}'`);
    }
    expect(migration).toMatch(
      /CREATE TYPE "ScrutinyRequirementApplicability" AS ENUM \(\s*'PENDING',\s*'REQUIRED',\s*'NOT_APPLICABLE'/,
    );
  });

  it('uses tenant-scoped composite references for every operational relationship', () => {
    const tables = [
      'ScrutinyCommission',
      'ScrutinyDocumentRequirement',
      'ScrutinyCommissionEvent',
      'ScrutinyDocument',
      'ScrutinyCommissionCoverage',
      'ScrutinyCustodyEvent',
      'ScrutinyDiscrepancy',
      'ScrutinyAction',
      'ScrutinyActionVersion',
      'ScrutinyActionDecision',
      'ScrutinyDeclaration',
      'ScrutinyDeclaredResultLine',
      'ScrutinyCommand',
    ];
    for (const table of tables) {
      expect(migration).toMatch(
        new RegExp(
          `CREATE TABLE "${table}" \\([\\s\\S]*?"tenantId" TEXT NOT NULL`,
        ),
      );
      expect(migration).toMatch(
        new RegExp(
          `ALTER TABLE "${table}"[\\s\\S]*?FOREIGN KEY \\("tenantId"\\) REFERENCES "Tenant"`,
        ),
      );
    }
    expect(migration).toMatch(
      /FOREIGN KEY \("commissionId", "tenantId"\) REFERENCES "ScrutinyCommission"\("id", "tenantId"\)/,
    );
    expect(migration).toMatch(
      /FOREIGN KEY \("documentId", "tenantId"\) REFERENCES "ScrutinyDocument"\("id", "tenantId"\)/,
    );
  });

  it('makes evidence ledgers append-only and reviews final', () => {
    for (const table of [
      'ScrutinyCommand',
      'ScrutinyCommissionEvent',
      'ScrutinyCustodyEvent',
      'ScrutinyActionVersion',
      'ScrutinyDeclaredResultLine',
    ]) {
      expect(migration).toContain(`${table}_append_only_update_delete`);
      expect(migration).toContain(`${table}_append_only_truncate`);
    }
    expect(migration).toContain('a scrutiny document review is final');
    expect(migration).toContain('invalid or repeated scrutiny decision review');
    expect(migration).toContain(
      'invalid or repeated scrutiny declaration review',
    );
  });

  it('enforces four-eyes boundaries and external filing evidence in PostgreSQL', () => {
    expect(migration).toMatch(/"reviewedById" <> "createdById"/);
    expect(migration).toMatch(/"approvedById" <> "draftedById"/);
    expect(migration).toMatch(/"filedById" <> "draftedById"/);
    expect(migration).toMatch(/"filedById" <> "approvedById"/);
    expect(migration).toMatch(/"reviewedById" <> "recordedById"/);
    expect(migration).toMatch(
      /"status" IN \('FILED_EXTERNAL', 'DECIDED_EXTERNAL', 'APPEALED_EXTERNAL', 'CLOSED'\)[\s\S]*"filingDocumentId" IS NOT NULL/,
    );
  });

  it('does not collect elector or voter personal data in scrutiny tables', () => {
    expect(migration).not.toMatch(
      /"(?:voterName|voterDocument|voterPhone|voterAddress|signatureImage|biometricData)"/i,
    );
  });
});
