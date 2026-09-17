import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('transition handover durable snapshot invariants', () => {
  const schema = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(
    resolve(
      'prisma/migrations/20260909320000_transition_handover_reports/migration.sql',
    ),
    'utf8',
  );
  const service = readFileSync(
    resolve('src/transition-handover/transition-handover.service.ts'),
    'utf8',
  );
  const report = schema.match(
    /model TransitionHandoverReport \{[\s\S]*?\n\}/u,
  )?.[0];

  it('owns every snapshot through mandatory tenant-composite relationships', () => {
    expect(report).toBeDefined();
    expect(report).toContain('tenantId');
    expect(report).toContain('@@unique([id, tenantId]');
    expect(report).toContain(
      'fields: [operationProfileId, tenantId], references: [id, tenantId]',
    );
    expect(report).toContain(
      'fields: [generatedById, tenantId], references: [id, tenantId]',
    );
    expect(report).toContain('@@index([tenantId, generatedAt]');
  });

  it('stores an exact identity, lifecycle classification, JSON payload and SHA-256', () => {
    for (const field of [
      'operationProfileId',
      'generatedById',
      'generatedAt',
      'status',
      'packageKind',
      'payload',
      'sha256',
    ]) {
      expect(report).toContain(field);
    }
    expect(migration).toContain(
      'TransitionHandoverReport_payload_identity_check',
    );
    expect(migration).toContain(
      'TransitionHandoverReport_payload_generated_at_check',
    );
    expect(migration).toContain(
      'TransitionHandoverReport_payload_status_check',
    );
    expect(migration).toContain('TransitionHandoverReport_payload_kind_check');
    expect(migration).toContain('REPORT_BODY_WITHOUT_INTEGRITY');
    expect(migration).toContain('CHECK ("sha256" ~ \'^[0-9a-f]{64}$\')');
    expect(migration.match(/\) IS TRUE/gu)).toHaveLength(6);
  });

  it('physically rejects update, delete and truncate even for privileged writes', () => {
    expect(migration).toContain('BEFORE UPDATE OR DELETE');
    expect(migration).toContain('BEFORE TRUNCATE');
    expect(migration).toContain('ENABLE ALWAYS TRIGGER');
    expect(service).not.toMatch(/transitionHandoverReport\.(?:update|delete)/u);
  });

  it('never certifies compliance or official filing', () => {
    expect(migration).toContain(
      'TransitionHandoverReport_non_certification_check',
    );
    expect(migration).toContain(
      `"payload"#>>'{lifecycle,complianceCertified}' = 'false'`,
    );
    expect(migration).toContain(
      `"payload"#>>'{lifecycle,authorityFilingCertified}' = 'false'`,
    );
    expect(service).toContain('complianceCertified: false');
    expect(service).toContain('authorityFilingCertified: false');
  });

  it('is additive and cannot cascade-delete retained evidence', () => {
    expect(migration).not.toMatch(/DROP TABLE|DROP TYPE|DELETE FROM/iu);
    expect(migration).not.toMatch(/^\s*TRUNCATE\s/imu);
    expect(migration).not.toMatch(/ON DELETE CASCADE/iu);
  });

  it('always derives tenant scope from authenticated context in reads and writes', () => {
    expect(service).toContain('tenantId: user.tenantId');
    expect(service).toContain(
      'where: { id: reportId, tenantId: user.tenantId }',
    );
    expect(service).not.toMatch(/tenantId:\s*(?:input|query|dto|body)\b/iu);
  });
});
