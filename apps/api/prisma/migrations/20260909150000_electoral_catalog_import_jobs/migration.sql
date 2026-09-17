BEGIN;

ALTER TYPE "StorageObjectModule" ADD VALUE 'ELECTORAL_CATALOG';

CREATE TYPE "ElectoralCatalogImportStatus" AS ENUM (
  'QUEUED',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED'
);

CREATE UNIQUE INDEX "StoredObject_tenantId_path_key"
  ON "StoredObject"("tenantId", "path");

CREATE TABLE "ElectoralCatalogImportJob" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "clientRequestId" UUID NOT NULL,
  "payloadSha256" CHAR(64) NOT NULL,
  "status" "ElectoralCatalogImportStatus" NOT NULL DEFAULT 'QUEUED',
  "catalogKey" VARCHAR(160) NOT NULL,
  "sourceUrl" VARCHAR(2048) NOT NULL,
  "sourceDataset" VARCHAR(300) NOT NULL,
  "sourceCutoffAt" TIMESTAMP(3) NOT NULL,
  "electionDate" DATE NOT NULL,
  "authorizationReference" VARCHAR(500) NOT NULL,
  "licenseDeclaration" VARCHAR(500) NOT NULL,
  "sourceArtifactPath" VARCHAR(512) NOT NULL,
  "expectedContentSha256" CHAR(64) NOT NULL,
  "requestedById" TEXT NOT NULL,
  "releaseId" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "lastErrorCode" VARCHAR(80),
  "lastErrorMessage" VARCHAR(1000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ElectoralCatalogImportJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ElectoralCatalogImportJob_hashes_check" CHECK (
    "payloadSha256" ~ '^[0-9a-f]{64}$'
    AND "expectedContentSha256" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "ElectoralCatalogImportJob_metadata_check" CHECK (
    length(btrim("catalogKey")) >= 3
    AND length(btrim("sourceUrl")) > 0
    AND length(btrim("sourceDataset")) > 0
    AND length(btrim("authorizationReference")) > 0
    AND length(btrim("licenseDeclaration")) > 0
    AND length(btrim("sourceArtifactPath")) > 0
    AND "attempts" >= 0
  ),
  CONSTRAINT "ElectoralCatalogImportJob_state_check" CHECK (
    (
      "status" = 'QUEUED'
      AND "startedAt" IS NULL
      AND "completedAt" IS NULL
      AND "releaseId" IS NULL
      AND "lastErrorCode" IS NULL
      AND "lastErrorMessage" IS NULL
    ) OR (
      "status" = 'PROCESSING'
      AND "attempts" >= 1
      AND "startedAt" IS NOT NULL
      AND "completedAt" IS NULL
      AND "releaseId" IS NULL
      AND "lastErrorCode" IS NULL
      AND "lastErrorMessage" IS NULL
    ) OR (
      "status" = 'SUCCEEDED'
      AND "attempts" >= 1
      AND "startedAt" IS NOT NULL
      AND "completedAt" IS NOT NULL
      AND "releaseId" IS NOT NULL
      AND "lastErrorCode" IS NULL
      AND "lastErrorMessage" IS NULL
    ) OR (
      "status" = 'FAILED'
      AND "attempts" >= 1
      AND "startedAt" IS NOT NULL
      AND "completedAt" IS NOT NULL
      AND "releaseId" IS NULL
      AND "lastErrorCode" IS NOT NULL
      AND length(btrim("lastErrorCode")) > 0
      AND "lastErrorMessage" IS NOT NULL
      AND length(btrim("lastErrorMessage")) > 0
    )
  )
);

CREATE UNIQUE INDEX "ElectoralCatalogImportJob_id_tenantId_key"
  ON "ElectoralCatalogImportJob"("id", "tenantId");
CREATE UNIQUE INDEX "ElectoralCatalogImportJob_tenant_clientRequestId_key"
  ON "ElectoralCatalogImportJob"("tenantId", "clientRequestId");
CREATE UNIQUE INDEX "ElectoralCatalogImportJob_tenant_sourceArtifactPath_key"
  ON "ElectoralCatalogImportJob"("tenantId", "sourceArtifactPath");
CREATE INDEX "ElectoralCatalogImportJob_tenant_status_createdAt_idx"
  ON "ElectoralCatalogImportJob"("tenantId", "status", "createdAt");
CREATE INDEX "ElectoralCatalogImportJob_tenant_requestedBy_createdAt_idx"
  ON "ElectoralCatalogImportJob"("tenantId", "requestedById", "createdAt");
CREATE INDEX "ElectoralCatalogImportJob_tenant_releaseId_idx"
  ON "ElectoralCatalogImportJob"("tenantId", "releaseId");

ALTER TABLE "ElectoralCatalogImportJob"
  ADD CONSTRAINT "ElectoralCatalogImportJob_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ElectoralCatalogImportJob"
  ADD CONSTRAINT "ElectoralCatalogImportJob_requestedBy_fkey"
  FOREIGN KEY ("requestedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ElectoralCatalogImportJob"
  ADD CONSTRAINT "ElectoralCatalogImportJob_release_fkey"
  FOREIGN KEY ("releaseId", "tenantId") REFERENCES "ElectoralCatalogRelease"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ElectoralCatalogImportJob"
  ADD CONSTRAINT "ElectoralCatalogImportJob_sourceObject_fkey"
  FOREIGN KEY ("tenantId", "sourceArtifactPath") REFERENCES "StoredObject"("tenantId", "path") ON DELETE RESTRICT ON UPDATE CASCADE;

-- La fecha de corte es parte del minimo probatorio para cualquier proyeccion
-- oficial activa, incluso si una escritura eludiera el servicio de aplicacion.
ALTER TABLE "ElectoralCatalogRelease"
  ADD CONSTRAINT "ElectoralCatalogRelease_active_cutoff_check" CHECK (
    "status" NOT IN ('ACTIVE', 'SUPERSEDED') OR "sourceCutoffAt" IS NOT NULL
  );

CREATE FUNCTION "enforce_electoral_catalog_import_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    OLD."id", OLD."tenantId", OLD."clientRequestId", OLD."payloadSha256",
    OLD."catalogKey", OLD."sourceUrl", OLD."sourceDataset",
    OLD."sourceCutoffAt", OLD."electionDate", OLD."authorizationReference",
    OLD."licenseDeclaration", OLD."sourceArtifactPath",
    OLD."expectedContentSha256", OLD."requestedById", OLD."createdAt"
  ) IS DISTINCT FROM ROW(
    NEW."id", NEW."tenantId", NEW."clientRequestId", NEW."payloadSha256",
    NEW."catalogKey", NEW."sourceUrl", NEW."sourceDataset",
    NEW."sourceCutoffAt", NEW."electionDate", NEW."authorizationReference",
    NEW."licenseDeclaration", NEW."sourceArtifactPath",
    NEW."expectedContentSha256", NEW."requestedById", NEW."createdAt"
  ) THEN
    RAISE EXCEPTION 'La solicitud y procedencia de una ingesta electoral son inmutables'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."status" = NEW."status" THEN
    IF NOT (
      OLD."status" = 'PROCESSING'
      AND NEW."attempts" = OLD."attempts" + 1
      AND NEW."startedAt" IS NOT NULL
      AND NEW."completedAt" IS NULL
      AND NEW."releaseId" IS NULL
      AND NEW."lastErrorCode" IS NULL
      AND NEW."lastErrorMessage" IS NULL
    ) THEN
      RAISE EXCEPTION 'No se puede mutar una ingesta sin una transicion valida'
        USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD."status" = 'QUEUED' AND NEW."status" = 'PROCESSING')
    OR (OLD."status" = 'PROCESSING' AND NEW."status" IN ('SUCCEEDED', 'FAILED'))
    OR (OLD."status" = 'FAILED' AND NEW."status" IN ('QUEUED', 'PROCESSING'))
  ) THEN
    RAISE EXCEPTION 'Transicion de ingesta electoral no permitida: % -> %', OLD."status", NEW."status"
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ElectoralCatalogImportJob_enforce_update"
BEFORE UPDATE ON "ElectoralCatalogImportJob"
FOR EACH ROW
EXECUTE FUNCTION "enforce_electoral_catalog_import_update"();

CREATE TRIGGER "ElectoralCatalogImportJob_prevent_delete"
BEFORE DELETE ON "ElectoralCatalogImportJob"
FOR EACH ROW
EXECUTE FUNCTION "prevent_electoral_catalog_history_mutation"();
CREATE TRIGGER "ElectoralCatalogImportJob_prevent_truncate"
BEFORE TRUNCATE ON "ElectoralCatalogImportJob"
FOR EACH STATEMENT
EXECUTE FUNCTION "prevent_electoral_catalog_history_mutation"();

ALTER TABLE "ElectoralCatalogImportJob"
  ENABLE ALWAYS TRIGGER "ElectoralCatalogImportJob_enforce_update";
ALTER TABLE "ElectoralCatalogImportJob"
  ENABLE ALWAYS TRIGGER "ElectoralCatalogImportJob_prevent_delete";
ALTER TABLE "ElectoralCatalogImportJob"
  ENABLE ALWAYS TRIGGER "ElectoralCatalogImportJob_prevent_truncate";

COMMIT;
