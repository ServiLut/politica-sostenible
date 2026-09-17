import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('operation exceptional termination database invariants', () => {
  const schema = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(
    resolve(
      'prisma/migrations/20260909180000_operation_exceptional_termination/migration.sql',
    ),
    'utf8',
  );
  const request = schema.match(
    /model OperationTerminationRequest \{[\s\S]*?\n\}/,
  )?.[0];
  const profile = schema.match(/model OperationProfile \{[\s\S]*?\n\}/)?.[0];

  it('owns the request, profile and every actor through tenant composite keys', () => {
    expect(request).toBeDefined();
    expect(request).toContain('tenantId');
    expect(request).toContain('@@unique([id, tenantId])');
    for (const relation of [
      'fields: [operationProfileId, tenantId], references: [id, tenantId]',
      'fields: [requestedById, tenantId], references: [id, tenantId]',
      'fields: [reviewedById, tenantId], references: [id, tenantId]',
      'fields: [cancelledById, tenantId], references: [id, tenantId]',
    ]) {
      expect(request).toContain(relation);
    }
  });

  it('has no implicit status or causal defaults and preserves exact evidence receipts', () => {
    expect(request).toContain('status');
    expect(request).not.toMatch(
      /status\s+OperationTerminationStatus\s+@default/,
    );
    expect(request).not.toMatch(/cause\s+OperationTerminationCause\s+@default/);
    for (const field of [
      'clientRequestId',
      'payloadSha256',
      'profileSnapshotSha256',
      'operationCycleSha256',
      'expectedProfileUpdatedAt',
      'authorityName',
      'officialActType',
      'officialActReference',
      'evidenceReference',
      'evidenceSha256',
      'consequencesAcknowledged',
    ]) {
      expect(request).toContain(field);
    }
  });

  it('classifies old closures as normal without assuming any exceptional cause', () => {
    expect(migration).toContain(`SET "closureType" = 'CLOSED_NORMAL'`);
    expect(migration).toContain(`WHERE "stage" = 'CLOSED'`);
    expect(migration).not.toMatch(
      /UPDATE "OperationProfile"[\s\S]*SET "terminationCause"/u,
    );
    expect(profile).toContain('closureType');
    expect(profile).toContain('terminationRequestId');
  });

  it('enforces one pending/approved request, HTTPS evidence, four eyes and expiry in PostgreSQL', () => {
    expect(migration).toContain(
      'OperationTerminationRequest_one_pending_per_profile',
    );
    expect(migration).toContain(
      'OperationTerminationRequest_one_approved_per_profile',
    );
    expect(migration).toContain(
      'OperationTerminationRequest_requires_open_profile',
    );
    expect(migration).toContain(
      'OperationTerminationRequest_evidence_https_check',
    );
    expect(migration).toContain('"reviewedById" <> "requestedById"');
    expect(migration).toContain('"reviewedAt" < "expiresAt"');
    expect(migration).toContain('"cancelledAt" < "expiresAt"');
    expect(migration).toContain('"consequencesAcknowledged" = true');
  });

  it('makes payload and terminal outcomes immutable and prevents delete/truncate', () => {
    expect(migration).toContain('enforce_operation_termination_update');
    expect(migration).toContain(
      'OperationTerminationRequest_lifecycle_only_update',
    );
    expect(migration).toContain('OLD."status" <> \'PENDING\'');
    expect(migration).toContain('OperationTerminationRequest_prevent_delete');
    expect(migration).toContain('OperationTerminationRequest_prevent_truncate');
    expect(migration).toContain('ENABLE ALWAYS TRIGGER');
  });

  it('binds an approved request and exceptional profile in both directions', () => {
    expect(migration).toContain('DEFERRABLE INITIALLY DEFERRED');
    expect(migration).toContain(
      'OperationProfile_exceptional_closure_matches_request',
    );
    expect(migration).toContain(
      'OperationTerminationRequest_approval_matches_profile',
    );
    expect(migration).toContain(
      'A CLOSED operation profile is immutable and cannot be reopened',
    );
    expect(migration).toContain('OperationProfile_closure_metadata_check');
  });

  it('is additive and never deletes campaign data', () => {
    expect(migration).not.toMatch(/DROP TABLE|DROP TYPE|DELETE FROM/iu);
    expect(migration).not.toMatch(/^\s*TRUNCATE\s/imu);
    expect(migration).not.toMatch(/ON DELETE CASCADE/iu);
  });
});
