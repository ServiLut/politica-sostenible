import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('electoral catalog database invariants', () => {
  const schema = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(
    resolve(
      'prisma/migrations/20260909130000_electoral_catalog_releases/migration.sql',
    ),
    'utf8',
  );
  const importMigration = readFileSync(
    resolve(
      'prisma/migrations/20260909150000_electoral_catalog_import_jobs/migration.sql',
    ),
    'utf8',
  );
  const release = schema.match(
    /model ElectoralCatalogRelease \{[\s\S]*?\n\}/,
  )?.[0];
  const entry = schema.match(/model ElectoralCatalogEntry \{[\s\S]*?\n\}/)?.[0];
  const division = schema.match(/model PoliticalDivision \{[\s\S]*?\n\}/)?.[0];
  const importJob = schema.match(
    /model ElectoralCatalogImportJob \{[\s\S]*?\n\}/,
  )?.[0];

  it('makes releases and entries tenant-owned with compound references', () => {
    expect(release).toBeDefined();
    expect(entry).toBeDefined();
    expect(release).toContain('tenantId');
    expect(release).toContain('@@unique([id, tenantId])');
    expect(entry).toContain('tenantId');
    expect(entry).toContain(
      '@@unique([id, tenantId, releaseId], map: "ElectoralCatalogEntry_id_tenant_release_key")',
    );
    expect(entry).toContain(
      '@relation(fields: [releaseId, tenantId], references: [id, tenantId], map: "ElectoralCatalogEntry_release_fkey")',
    );
    expect(entry).toContain(
      'fields: [parentId, tenantId, releaseId], references: [id, tenantId, releaseId]',
    );
  });

  it('stores provenance, authorization, lifecycle actors and explicit counts', () => {
    for (const field of [
      'sourceUrl',
      'sourceOrganization',
      'sourceDataset',
      'sourceCutoffAt',
      'electionDate',
      'contentSha256',
      'parserVersion',
      'authorizationReference',
      'licenseDeclaration',
      'recordCount',
      'expectedTableCount',
      'createdById',
      'validatedById',
      'activatedById',
      'approvedById',
    ]) {
      expect(release).toContain(field);
    }
    expect(schema).toContain('ADMINISTRATIVE_DANE');
    expect(schema).toContain('ELECTORAL_RNEC');
    expect(schema).toContain('SUPERSEDED');
  });

  it('keeps official code segments, hierarchy and table counts without mesa rows', () => {
    for (const field of [
      'namespace',
      'canonicalCode',
      'departmentCode',
      'municipalityCode',
      'zoneCode',
      'pollingPlaceCode',
      'parentId',
      'address',
      'commune',
      'latitude',
      'longitude',
      'expectedTables',
    ]) {
      expect(entry).toContain(field);
    }
    expect(schema).not.toMatch(/model ElectoralTable\s*\{/);
    expect(entry).not.toMatch(/document|voter|phone|email|mesaId/i);
  });

  it('enforces one active release per tenant catalog and immutable history', () => {
    expect(migration).toContain(
      '"ElectoralCatalogRelease_one_active_catalog_key"',
    );
    expect(migration).toContain(
      '"ElectoralCatalogRelease_one_active_rnec_projection"',
    );
    expect(migration).toContain('WHERE "status" = \'ACTIVE\'');
    expect(migration).toContain('enforce_electoral_catalog_release_update');
    expect(migration).toContain('ElectoralCatalogEntry_prevent_update_delete');
    expect(migration).toContain('ElectoralCatalogEntry_prevent_truncate');
    expect(migration).toContain('ElectoralCatalogRelease_prevent_delete');
    expect(migration).toContain('ENABLE ALWAYS TRIGGER');
  });

  it('backs hash, hierarchy, coordinates, count and two-person rules in PostgreSQL', () => {
    expect(migration).toContain("~ '^[0-9a-f]{64}$'");
    expect(migration).toContain('ElectoralCatalogRelease_counts_check');
    expect(migration).toContain('ElectoralCatalogEntry_shape_check');
    expect(migration).toContain('ElectoralCatalogEntry_coordinates_check');
    expect(migration).toContain('"approvedById" <> "createdById"');
    expect(migration).toContain(
      'FOREIGN KEY ("parentId", "tenantId", "releaseId")',
    );
    expect(migration).toContain(
      'Solo se pueden insertar entradas en un release STAGED',
    );
  });

  it('tracks source and retirement without deleting referenced divisions', () => {
    expect(division).toBeDefined();
    for (const field of [
      'sourceNamespace',
      'sourceReleaseId',
      'isActive',
      'retiredAt',
      'sourceRelease',
    ]) {
      expect(division).toContain(field);
    }
    expect(division).toContain('@default(true)');
    expect(division).toContain(
      'fields: [sourceReleaseId, tenantId], references: [id, tenantId]',
    );
    expect(migration).toContain('PoliticalDivision_retirement_check');
    expect(migration).toContain('PoliticalDivision_provenance_shape_check');
    expect(migration).toContain('"PoliticalDivision_tenant_source_code_key"');
    expect(migration).toContain('validate_political_division_source');
    expect(migration).toContain(
      'No se puede activar un release sin materializar toda su proyeccion territorial',
    );
    expect(migration).toContain(
      'No se puede retirar un release mientras conserve divisiones activas',
    );
    expect(migration).toContain('PoliticalDivision_prevent_catalog_delete');
    expect(migration).toContain('debe retirarse con isActive=false');
    expect(migration).not.toContain('prevent_mixed_rnec_legacy_divisions');
    expect(migration).not.toContain(
      'PoliticalDivision_prevent_mixed_rnec_legacy',
    );
  });

  it('is forward-only and never seeds or bundles a Registraduria dataset', () => {
    expect(migration).not.toMatch(/DROP TABLE|DROP TYPE|DELETE FROM/);
    expect(migration).not.toMatch(/^\s*TRUNCATE\s/imu);
    expect(migration).not.toMatch(/INSERT INTO "ElectoralCatalogEntry"/);
    expect(migration).not.toMatch(/congreso-de-la-republica\/data|data\.json/i);
  });

  it('makes asynchronous imports durable, tenant-owned and idempotent', () => {
    expect(importJob).toBeDefined();
    for (const field of [
      'tenantId',
      'clientRequestId',
      'payloadSha256',
      'expectedContentSha256',
      'sourceArtifactPath',
      'requestedById',
      'releaseId',
      'status',
      'attempts',
    ]) {
      expect(importJob).toContain(field);
    }
    expect(importJob).toContain('@@unique([id, tenantId])');
    expect(importJob).toContain(
      '@@unique([tenantId, clientRequestId], map: "ElectoralCatalogImportJob_tenant_clientRequestId_key")',
    );
    expect(importJob).toContain(
      '@@unique([tenantId, sourceArtifactPath], map: "ElectoralCatalogImportJob_tenant_sourceArtifactPath_key")',
    );
    expect(importJob).toContain(
      'fields: [requestedById, tenantId], references: [id, tenantId]',
    );
    expect(importJob).toContain(
      'fields: [releaseId, tenantId], references: [id, tenantId]',
    );
  });

  it('backs import integrity and append-only lifecycle transitions in PostgreSQL', () => {
    expect(importMigration).toContain('ElectoralCatalogImportJob_hashes_check');
    expect(importMigration).toContain('ElectoralCatalogImportJob_state_check');
    expect(importMigration).toContain(
      'ElectoralCatalogImportJob_tenant_clientRequestId_key',
    );
    expect(importMigration).toContain(
      'FOREIGN KEY ("tenantId", "sourceArtifactPath")',
    );
    expect(importMigration).toContain(
      'enforce_electoral_catalog_import_update',
    );
    expect(importMigration).toContain(
      'ElectoralCatalogImportJob_prevent_delete',
    );
    expect(importMigration).toContain(
      'ElectoralCatalogImportJob_prevent_truncate',
    );
    expect(importMigration).toContain('ENABLE ALWAYS TRIGGER');
    expect(importMigration).toContain(
      'ElectoralCatalogRelease_active_cutoff_check',
    );
    expect(importMigration).not.toMatch(/INSERT INTO "ElectoralCatalogEntry"/);
  });
});
