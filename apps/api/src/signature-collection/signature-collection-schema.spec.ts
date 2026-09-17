import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('signature collection database invariants', () => {
  const schema = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(
    resolve(
      'prisma/migrations/20260909240000_signature_collection_operations/migration.sql',
    ),
    'utf8',
  );
  const service = readFileSync(
    resolve('src/signature-collection/signature-collection.service.ts'),
    'utf8',
  );
  const operationProfileService = readFileSync(
    resolve('src/operation-profile/operation-profile.service.ts'),
    'utf8',
  );

  function model(name: string): string {
    const value = schema.match(
      new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`),
    )?.[0];
    if (!value) throw new Error(`Modelo ausente: ${name}`);
    return value;
  }

  it.each([
    'SignatureCollectionPlan',
    'SignatureCollectionBatch',
    'SignatureCollectionCommand',
    'SignatureCustodyEvent',
    'SignatureAuthorityResult',
    'SignatureAuthorityResultReview',
  ])('%s has tenant-scoped composite identity', (name) => {
    expect(model(name)).toContain('tenantId');
    expect(model(name)).toMatch(
      /@@unique\(\[id, tenantId\](?:,\s*map:\s*"[^"]+")?\)/u,
    );
  });

  it('uses composite tenant foreign keys throughout the operational graph', () => {
    for (const name of [
      'SignatureCollectionPlan',
      'SignatureCollectionBatch',
      'SignatureCollectionCommand',
      'SignatureCustodyEvent',
      'SignatureAuthorityResult',
      'SignatureAuthorityResultReview',
    ]) {
      for (const relation of model(name)
        .split('\n')
        .filter(
          (line) => line.includes('@relation(') && line.includes('fields:'),
        )) {
        if (/^\s*tenant\s/u.test(relation)) continue;
        expect(relation).toContain('tenantId]');
        expect(relation).toContain('references: [id, tenantId]');
      }
    }
  });

  it('cannot persist supporter identity, address, signature, image or binary data', () => {
    const operationalModels = [
      model('SignatureCollectionPlan'),
      model('SignatureCollectionBatch'),
      model('SignatureCollectionCommand'),
      model('SignatureCustodyEvent'),
      model('SignatureAuthorityResult'),
      model('SignatureAuthorityResultReview'),
    ].join('\n');
    expect(operationalModels).not.toMatch(
      /supporter(Name|Document|Address|Signature)|signer(Name|Document|Address)|signatureImage|base64|bytea/iu,
    );
    expect(migration).not.toMatch(/multipart|base64|BYTEA/iu);
  });

  it('enforces exact arithmetic, committee, threshold, chronology and HTTPS evidence', () => {
    for (const invariant of [
      'SignatureCollectionPlan_committee_check',
      'SignatureCollectionPlan_dates_check',
      'SignatureCollectionPlan_threshold_check',
      'SignatureCollectionPlan_https_check',
      'SignatureCollectionBatch_counts_check',
      'SignatureCollectionBatch_state_check',
      'SignatureCustodyEvent_counts_check',
      'SignatureAuthorityResult_counts_check',
    ]) {
      expect(migration).toContain(invariant);
    }
  });

  it('makes command, custody, authority result and review ledgers append-only', () => {
    for (const table of [
      'SignatureCollectionCommand',
      'SignatureCustodyEvent',
      'SignatureAuthorityResult',
      'SignatureAuthorityResultReview',
    ]) {
      expect(migration).toContain(`'${table}'`);
    }
    expect(migration).toContain("table_name || '_prevent_update_delete'");
    expect(migration).toContain("table_name || '_prevent_truncate'");
    expect(migration).toContain('ENABLE ALWAYS TRIGGER');
  });

  it('fences commands against closure, serializes them and binds idempotency to tenant', () => {
    expect(service).toContain('operation-profile-lifecycle:${user.tenantId}');
    expect(service).toContain('FOR UPDATE');
    expect(service).toContain('Prisma.TransactionIsolationLevel.Serializable');
    expect(service).toContain(
      'profile.stage === PoliticalOperationStage.CLOSED',
    );
    expect(model('SignatureCollectionCommand')).toContain(
      '@@unique([tenantId, clientRequestId]',
    );
  });

  it('wires entry and exit readiness into the real operation-stage transaction', () => {
    expect(operationProfileService).toContain(
      'currentProfile.stage === PoliticalOperationStage.PRE_CAMPAIGN',
    );
    expect(operationProfileService).toContain(
      'dto.stage === PoliticalOperationStage.SIGNATURE_COLLECTION',
    );
    expect(operationProfileService).toContain(
      'await this.assertSignatureCollectionEntryReadiness(',
    );
    expect(operationProfileService).toMatch(
      /currentProfile\.stage\s*===\s*PoliticalOperationStage\.SIGNATURE_COLLECTION/u,
    );
    expect(operationProfileService).toContain(
      'await this.assertSignatureCollectionExitReadiness(',
    );
    expect(operationProfileService).toContain(
      "code: 'SIGNATURE_COLLECTION_EXIT_BLOCKED'",
    );
  });

  it('adds the electronic signature uniqueness requested through a conservative preflight', () => {
    expect(migration).toContain(
      'ElectronicSignature contains duplicate tenant/document/signer records',
    );
    expect(migration).toContain(
      '"ElectronicSignature_tenant_document_signer_key"',
    );
    expect(model('ElectronicSignature')).toContain(
      '@@unique([tenantId, documentId, signerId]',
    );
  });

  it('is an atomic additive migration', () => {
    expect(migration.trimStart()).toMatch(/^--[\s\S]*?\nBEGIN;\n/u);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/u);
    expect(migration).not.toMatch(
      /DROP TABLE|DROP TYPE|DELETE FROM|TRUNCATE TABLE/iu,
    );
    expect(migration).not.toMatch(/ON DELETE CASCADE/iu);
  });
});
