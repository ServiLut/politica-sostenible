import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('signature count-correction schema and PostgreSQL controls', () => {
  const schema = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(
    resolve(
      'prisma/migrations/20260909290000_signature_count_corrections/migration.sql',
    ),
    'utf8',
  );
  const service = readFileSync(
    resolve('src/signature-collection/signature-count-correction.service.ts'),
    'utf8',
  );
  const lifecycleService = readFileSync(
    resolve('src/signature-collection/signature-collection.service.ts'),
    'utf8',
  );

  function model(name: string): string {
    const found = schema.match(
      new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`),
    )?.[0];
    if (!found) throw new Error(`Modelo de correccion ausente: ${name}`);
    return found;
  }

  it.each([
    'SignatureCountCorrectionCommand',
    'SignatureCountCorrectionProposal',
    'SignatureCountCorrectionDecision',
  ])('%s is tenant-scoped with a composite identity', (name) => {
    expect(model(name)).toContain('tenantId');
    expect(model(name)).toContain('@@unique([id, tenantId]');
  });

  it('uses composite tenant foreign keys for every operational relationship', () => {
    for (const name of [
      'SignatureCountCorrectionCommand',
      'SignatureCountCorrectionProposal',
      'SignatureCountCorrectionDecision',
    ]) {
      for (const line of model(name)
        .split('\n')
        .filter(
          (value) => value.includes('@relation(') && value.includes('fields:'),
        )) {
        if (/^\s*tenant\s/u.test(line)) continue;
        expect(line).toContain('tenantId]');
        expect(line).toContain('references: [id, tenantId]');
      }
    }
  });

  it('captures all ten before and proposed absolute values with exact equations', () => {
    for (const stem of [
      'PlannedForms',
      'IssuedForms',
      'ReturnedForms',
      'AnnulledForms',
      'MissingForms',
      'InCustodyForms',
      'ReportedSupports',
      'InternalAcceptedSupports',
      'InternalRejectedSupports',
      'PossibleDuplicateSupports',
    ]) {
      expect(model('SignatureCountCorrectionProposal')).toContain(
        `snapshot${stem}`,
      );
      expect(model('SignatureCountCorrectionProposal')).toContain(
        `proposed${stem}`,
      );
    }
    expect(migration).toContain(
      '"proposedReturnedForms" + "proposedAnnulledForms" + "proposedMissingForms" + "proposedInCustodyForms" = "proposedIssuedForms"',
    );
    expect(migration).toContain(
      '"proposedInternalAcceptedSupports" + "proposedInternalRejectedSupports" = "proposedReportedSupports"',
    );
    expect(migration).toContain(
      '"proposedPossibleDuplicateSupports" <= "proposedInternalRejectedSupports"',
    );
  });

  it('requires quarantine, exact snapshots and leaves release to the existing control', () => {
    expect(migration).toContain('batch_row."status" <> \'QUARANTINED\'');
    expect(migration).toContain(
      'Correction snapshot does not exactly match the locked batch',
    );
    expect(migration).not.toContain('QUARANTINE_RELEASED');
    expect(lifecycleService).toContain(
      "code: 'SIGNATURE_COUNT_CORRECTION_PENDING'",
    );
    expect(migration).toContain(
      'signature_count_correction_guard_batch_release',
    );
    expect(migration).toContain(
      'Batch quarantine cannot be released with an unresolved count correction',
    );
  });

  it('enforces deterministic four-eyes roles and applies approval atomically', () => {
    expect(migration).toContain("actual_reviewer_role <> 'AUDITOR'");
    expect(migration).toContain("actual_reviewer_role <> 'COMPLIANCE_OFFICER'");
    expect(migration).toContain(
      'NEW."reviewedById" = proposal_row."requestedById"',
    );
    expect(migration).toContain('IF NEW."decision" = \'APPROVE\' THEN');
    expect(migration).toContain('"version" = batch_row."version" + 1');
    expect(migration).not.toMatch(/SET\s+"status"/iu);
  });

  it('requires confirmed Storage evidence and sends no binary through Nest', () => {
    expect(migration).toContain('storage_row."status" <> \'CONFIRMED\'');
    expect(migration).toContain('storage_row."consumedAt" IS NOT NULL');
    expect(migration).toContain(
      'storage_row."expectedSha256" <> NEW."evidenceSha256"',
    );
    expect(service).toContain('consumeConfirmedStorageUpload(');
    expect(service).not.toMatch(/multipart|base64|BYTEA/iu);
  });

  it('uses JWT tenant context, canonical idempotency, locks and CLOSED fences', () => {
    expect(service).not.toMatch(/dto\.tenantId|body\.tenantId/iu);
    expect(service).toContain('user.tenantId');
    expect(service).toContain('Prisma.TransactionIsolationLevel.Serializable');
    expect(service).toContain('pg_advisory_xact_lock');
    expect(service).toContain('FOR UPDATE');
    expect(service).toContain(
      'context.profile.stage === PoliticalOperationStage.CLOSED',
    );
    expect(model('SignatureCountCorrectionCommand')).toContain(
      '@@unique([tenantId, clientRequestId]',
    );
  });

  it('seals every ledger against update, delete and truncate', () => {
    expect(migration).toContain('signature_count_correction_reject_mutation');
    expect(migration).toContain('BEFORE UPDATE OR DELETE');
    expect(migration).toContain('BEFORE TRUNCATE');
    expect(migration).toContain('ENABLE ALWAYS TRIGGER');
  });

  it('is one additive atomic migration and never edits the 240 contract', () => {
    expect(migration.trimStart()).toMatch(/^--[\s\S]*?\nBEGIN;\n/u);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/u);
    expect(migration).not.toMatch(
      /DROP TABLE|DROP TYPE|DELETE FROM|TRUNCATE TABLE/iu,
    );
    expect(migration).not.toMatch(/ON DELETE CASCADE/iu);
  });
});
