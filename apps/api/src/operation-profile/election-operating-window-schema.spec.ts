import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('election operating window database invariants', () => {
  const schema = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(
    resolve(
      'prisma/migrations/20260909200000_election_operating_window/migration.sql',
    ),
    'utf8',
  );

  it('stores the exact window on profiles, adoption requests and E-14 grants', () => {
    for (const model of [
      'OperationProfile',
      'OperationStageAdoptionRequest',
      'OfflineE14CaptureGrant',
    ]) {
      const block = schema.match(
        new RegExp(`model ${model} \\{[\\s\\S]*?\\n\\}`),
      )?.[0];
      expect(block).toBeDefined();
      expect(block).toContain('votingStartDate');
      expect(block).toContain('votingEndDate');
    }
    const grant = schema.match(
      /model OfflineE14CaptureGrant \{[\s\S]*?\n\}/,
    )?.[0];
    expect(grant).toContain('electionWindowSha256');
    expect(grant).toContain('tenantId');
  });

  it('backfills the declared civil date without a Bogota instant conversion', () => {
    expect(migration).toMatch(
      /UPDATE "OperationProfile"[\s\S]*"votingStartDate" = "electionDate"::date[\s\S]*"votingEndDate" = "electionDate"::date/,
    );
    expect(migration).not.toMatch(/AT TIME ZONE\s+'America\/Bogota'/i);
    expect(migration).toContain(
      'Reinterpreting UTC midnight as a Bogota instant would shift YYYY-MM-DD back',
    );
  });

  it('enforces inclusive order, principal-date containment and a 14-day maximum', () => {
    for (const constraint of [
      'OperationProfile_voting_window_dates_check',
      'OperationStageAdoptionRequest_voting_window_dates_check',
      'OfflineE14Grant_election_window_check',
    ]) {
      expect(migration).toContain(constraint);
    }
    expect(migration).toMatch(
      /"votingStartDate" <= "electionDate"::date[\s\S]*"electionDate"::date <= "votingEndDate"[\s\S]*BETWEEN 0 AND 13/,
    );
  });

  it('requires provenance for a multi-day profile and validates the durable hash', () => {
    expect(migration).toContain(
      'OperationProfile_voting_window_source_pair_check',
    );
    expect(migration).toContain(
      'OperationProfile_voting_window_source_https_check',
    );
    expect(migration).toMatch(
      /"votingStartDate" = "votingEndDate"[\s\S]*OR "votingWindowSourceUrl" IS NOT NULL/,
    );
    expect(migration).toContain('OfflineE14Grant_window_sha256_check');
    expect(migration).toContain("~ '^[0-9a-f]{64}$'");
  });

  it('revokes legacy grants instead of reclassifying their window snapshot', () => {
    expect(migration).toMatch(
      /UPDATE "OfflineE14CaptureGrant"[\s\S]*"electionWindowSha256" = repeat\('0', 64\)[\s\S]*"revokedAt" = COALESCE\("revokedAt", CURRENT_TIMESTAMP\)/,
    );
    expect(migration).not.toMatch(/UPDATE\s+"WitnessReport"/i);
  });

  it('keeps adoption payload window fields immutable and restores both fences', () => {
    for (const field of [
      'OLD."votingStartDate"',
      'OLD."votingEndDate"',
      'OLD."votingWindowSourceUrl"',
      'OLD."votingWindowReference"',
    ]) {
      expect(migration).toContain(field);
    }
    expect(migration).toContain(
      'ENABLE ALWAYS TRIGGER "OperationProfile_prevent_closed_mutation"',
    );
    expect(migration).toContain(
      'ENABLE ALWAYS TRIGGER "OperationStageAdoptionRequest_enforce_update"',
    );
  });

  it('is forward-only and never deletes election evidence', () => {
    expect(migration).not.toMatch(
      /DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE/iu,
    );
    expect(migration).not.toMatch(/UPDATE\s+"WitnessReport"/iu);
  });
});
