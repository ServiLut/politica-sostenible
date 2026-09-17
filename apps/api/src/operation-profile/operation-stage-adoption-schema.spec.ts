import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('operation stage adoption database invariants', () => {
  const schema = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(
    resolve(
      'prisma/migrations/20260909140000_operation_stage_adoption/migration.sql',
    ),
    'utf8',
  );
  const request = schema.match(
    /model OperationStageAdoptionRequest \{[\s\S]*?\n\}/,
  )?.[0];

  it('owns every request and actor relation through the tenant', () => {
    expect(request).toBeDefined();
    expect(request).toContain('tenantId');
    expect(request).toContain('@@unique([id, tenantId])');
    for (const relation of [
      'fields: [requestedById, tenantId], references: [id, tenantId]',
      'fields: [reviewedById, tenantId], references: [id, tenantId]',
      'fields: [responsibleDataUserId, tenantId], references: [id, tenantId]',
      'fields: [operationProfileId, tenantId], references: [id, tenantId]',
    ]) {
      expect(request).toContain(relation);
    }
  });

  it('stores the complete immutable profile, evidence hashes and review receipt', () => {
    for (const field of [
      'clientRequestId',
      'payloadSha256',
      'targetStage',
      'effectiveAt',
      'justification',
      'evidenceReference',
      'evidenceSha256',
      'incompleteHistoryAcknowledged',
      'expiresAt',
      'reviewClientRequestId',
      'reviewPayloadSha256',
      'operationProfileId',
    ]) {
      expect(request).toContain(field);
    }
    expect(migration).toContain('enforce_operation_stage_adoption_update');
    expect(migration).toContain('OperationStageAdoptionRequest_prevent_delete');
    expect(migration).toContain(
      'OperationStageAdoptionRequest_prevent_truncate',
    );
    expect(migration).toContain('ENABLE ALWAYS TRIGGER');
  });

  it('backs target, timing, acknowledgement and two-person review in PostgreSQL', () => {
    expect(migration).toContain('OperationStageAdoptionRequest_target_check');
    expect(migration).not.toMatch(/'EXPLORATION'|'PRE_CAMPAIGN'|'CLOSED'/u);
    expect(migration).toContain('"effectiveAt" <= "createdAt"');
    expect(migration).toContain('"incompleteHistoryAcknowledged" = true');
    expect(migration).toContain('"reviewedById" <> "requestedById"');
    expect(migration).toContain('"reviewedAt" < "expiresAt"');
    expect(migration).toContain(`NEW."status" <> 'PENDING'`);
    expect(migration).toContain('OperationStageAdoptionRequest_hashes_check');
    expect(migration).toContain('DEFERRABLE INITIALLY DEFERRED');
  });

  it('allows only one pending request and prevents request/profile creation races', () => {
    expect(migration).toContain(
      'OperationStageAdoptionRequest_one_pending_per_tenant',
    );
    expect(migration).toContain('WHERE "status" = \'PENDING\'');
    expect(migration).toContain('guard_adoption_request_without_profile');
    expect(migration).toContain('guard_profile_without_pending_adoption');
  });

  it('is forward-only and never creates an emergency bypass', () => {
    expect(migration).not.toMatch(/DROP TABLE|DROP TYPE|DELETE FROM/iu);
    expect(migration).not.toMatch(/^\s*TRUNCATE\s/imu);
    expect(migration).not.toMatch(/emergency|bypass/iu);
  });
});
