import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('retention governance database invariants', () => {
  const schema = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(
    resolve(
      'prisma/migrations/20260909190000_retention_governance/migration.sql',
    ),
    'utf8',
  );
  const disposition = schema.match(
    /model RetentionDispositionRequest \{[\s\S]*?\n\}/,
  )?.[0];
  const hold = schema.match(/model RetentionLegalHold \{[\s\S]*?\n\}/)?.[0];
  const revocation = schema.match(
    /model RetentionLegalHoldRevocation \{[\s\S]*?\n\}/,
  )?.[0];

  it('binds every record and actor through tenant composite keys', () => {
    for (const model of [disposition, hold, revocation]) {
      expect(model).toBeDefined();
      expect(model).toContain('tenantId');
      expect(model).toContain('@@unique([id, tenantId])');
    }
    for (const relation of [
      'fields: [operationProfileId, tenantId], references: [id, tenantId]',
      'fields: [requestedById, tenantId], references: [id, tenantId]',
      'fields: [reviewedById, tenantId], references: [id, tenantId]',
      'fields: [cancelledById, tenantId], references: [id, tenantId]',
    ]) {
      expect(disposition).toContain(relation);
    }
    expect(hold).toContain(
      'fields: [createdById, tenantId], references: [id, tenantId]',
    );
    expect(revocation).toContain(
      'fields: [legalHoldId, tenantId], references: [id, tenantId]',
    );
    expect(revocation).toContain(
      'fields: [revokedById, tenantId], references: [id, tenantId]',
    );
  });

  it('records approvals as explicitly not executed', () => {
    expect(schema).toContain('APPROVED_NOT_EXECUTED');
    expect(migration).toContain("'APPROVED_NOT_EXECUTED'");
    expect(migration).toContain('"executorUnavailableAcknowledged" = true');
    expect(migration).toContain('"backupRestoreRequiredAcknowledged" = true');
    expect(migration).toContain('"legalPolicyRequiredAcknowledged" = true');
    expect(migration).not.toMatch(/\bEXECUTED\b/u);
  });

  it('requires exact ordinary closure and rechecks legal holds in PostgreSQL', () => {
    expect(migration).toContain(
      'RetentionDispositionRequest_requires_closed_normal_profile',
    );
    expect(migration).toContain('profile."stage" = \'CLOSED\'');
    expect(migration).toContain('profile."closureType" = \'CLOSED_NORMAL\'');
    expect(migration).toContain(
      'Active legal hold blocks this retention disposition scope',
    );
    expect(migration).toContain('"cutoffAt" >= "retentionDueAt"');
  });

  it('enforces four eyes, one open decision and idempotency', () => {
    expect(migration).toContain('"reviewedById" <> "requestedById"');
    expect(migration).toContain(
      'RetentionDispositionRequest_one_pending_per_scope',
    );
    expect(migration).toContain(
      'RetentionDispositionRequest_one_approved_unexecuted_per_scope',
    );
    expect(disposition).toContain('@@unique([tenantId, clientRequestId]');
    expect(disposition).toContain('@@unique([tenantId, reviewClientRequestId]');
    expect(revocation).toContain('@@unique([tenantId, clientRequestId]');
  });

  it('keeps payloads and legal-hold history immutable', () => {
    expect(migration).toContain('enforce_retention_disposition_update');
    expect(migration).toContain(
      'RetentionDispositionRequest_lifecycle_only_update',
    );
    expect(migration).toContain('RetentionLegalHold_prevent_update_delete');
    expect(migration).toContain(
      'RetentionLegalHoldRevocation_prevent_update_delete',
    );
    expect(migration).toContain('ENABLE ALWAYS TRIGGER');
  });

  it('is additive and contains no purge operation', () => {
    expect(migration).not.toMatch(/DROP TABLE|DROP TYPE|DELETE FROM/iu);
    expect(migration).not.toMatch(/^\s*TRUNCATE\s/imu);
    expect(migration).not.toMatch(/ON DELETE CASCADE/iu);
    expect(migration).not.toMatch(/\bdeleteMany\b/u);
  });
});
