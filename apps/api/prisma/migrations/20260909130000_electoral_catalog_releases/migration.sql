BEGIN;

CREATE TYPE "ElectoralCatalogType" AS ENUM (
  'ADMINISTRATIVE_DANE',
  'ELECTORAL_RNEC'
);

CREATE TYPE "ElectoralCatalogStatus" AS ENUM (
  'STAGED',
  'VALIDATED',
  'ACTIVE',
  'REJECTED',
  'SUPERSEDED'
);

CREATE TYPE "ElectoralCodeNamespace" AS ENUM (
  'DANE_DIVIPOLA',
  'RNEC_DIVIPOLE'
);

CREATE TYPE "ElectoralCatalogEntryType" AS ENUM (
  'DEPARTMENT',
  'MUNICIPALITY',
  'NON_MUNICIPALIZED_AREA',
  'ISLAND',
  'ZONE',
  'POLLING_PLACE'
);

CREATE TABLE "ElectoralCatalogRelease" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "catalogKey" VARCHAR(160) NOT NULL,
  "type" "ElectoralCatalogType" NOT NULL,
  "status" "ElectoralCatalogStatus" NOT NULL DEFAULT 'STAGED',
  "sourceUrl" VARCHAR(2048) NOT NULL,
  "sourceOrganization" VARCHAR(200) NOT NULL,
  "sourceDataset" VARCHAR(300) NOT NULL,
  "sourceCutoffAt" TIMESTAMP(3),
  "electionDate" DATE,
  "contentSha256" CHAR(64) NOT NULL,
  "parserVersion" VARCHAR(80) NOT NULL,
  "authorizationReference" VARCHAR(500),
  "licenseDeclaration" VARCHAR(500),
  "sourceArtifactPath" VARCHAR(512),
  "recordCount" INTEGER NOT NULL,
  "departmentCount" INTEGER NOT NULL,
  "municipalityCount" INTEGER NOT NULL,
  "zoneCount" INTEGER NOT NULL,
  "pollingPlaceCount" INTEGER NOT NULL,
  "expectedTableCount" INTEGER NOT NULL,
  "validationSummary" JSONB,
  "rejectionReason" VARCHAR(1000),
  "createdById" TEXT NOT NULL,
  "validatedById" TEXT,
  "activatedById" TEXT,
  "approvedById" TEXT,
  "supersededByReleaseId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validatedAt" TIMESTAMP(3),
  "activatedAt" TIMESTAMP(3),
  "supersededAt" TIMESTAMP(3),

  CONSTRAINT "ElectoralCatalogRelease_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ElectoralCatalogRelease_nonempty_metadata_check" CHECK (
    length(btrim("catalogKey")) >= 3
    AND length(btrim("sourceUrl")) > 0
    AND length(btrim("sourceOrganization")) > 0
    AND length(btrim("sourceDataset")) > 0
    AND length(btrim("parserVersion")) > 0
    AND ("authorizationReference" IS NULL OR length(btrim("authorizationReference")) > 0)
    AND ("licenseDeclaration" IS NULL OR length(btrim("licenseDeclaration")) > 0)
    AND ("sourceArtifactPath" IS NULL OR length(btrim("sourceArtifactPath")) > 0)
  ),
  CONSTRAINT "ElectoralCatalogRelease_sha256_check" CHECK (
    "contentSha256" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "ElectoralCatalogRelease_counts_check" CHECK (
    "departmentCount" >= 0
    AND "municipalityCount" >= 0
    AND "zoneCount" >= 0
    AND "pollingPlaceCount" >= 0
    AND "expectedTableCount" >= 0
    AND "recordCount" = "departmentCount" + "municipalityCount" + "zoneCount" + "pollingPlaceCount"
  ),
  CONSTRAINT "ElectoralCatalogRelease_election_date_check" CHECK (
    "type" <> 'ELECTORAL_RNEC' OR "electionDate" IS NOT NULL
  ),
  CONSTRAINT "ElectoralCatalogRelease_lifecycle_check" CHECK (
    (
      "status" = 'STAGED'
      AND "validatedAt" IS NULL
      AND "validatedById" IS NULL
      AND "activatedAt" IS NULL
      AND "activatedById" IS NULL
      AND "approvedById" IS NULL
      AND "supersededAt" IS NULL
      AND "supersededByReleaseId" IS NULL
      AND "rejectionReason" IS NULL
      AND "validationSummary" IS NULL
    ) OR (
      "status" = 'VALIDATED'
      AND "validatedAt" IS NOT NULL
      AND "validatedById" IS NOT NULL
      AND "validationSummary" IS NOT NULL
      AND "activatedAt" IS NULL
      AND "activatedById" IS NULL
      AND "approvedById" IS NULL
      AND "supersededAt" IS NULL
      AND "supersededByReleaseId" IS NULL
      AND "rejectionReason" IS NULL
    ) OR (
      "status" = 'ACTIVE'
      AND "validatedAt" IS NOT NULL
      AND "validatedById" IS NOT NULL
      AND "validationSummary" IS NOT NULL
      AND "activatedAt" IS NOT NULL
      AND "activatedById" IS NOT NULL
      AND "approvedById" IS NOT NULL
      AND "approvedById" = "activatedById"
      AND "approvedById" <> "createdById"
      AND "authorizationReference" IS NOT NULL
      AND length(btrim("authorizationReference")) > 0
      AND "licenseDeclaration" IS NOT NULL
      AND length(btrim("licenseDeclaration")) > 0
      AND "supersededAt" IS NULL
      AND "supersededByReleaseId" IS NULL
      AND "rejectionReason" IS NULL
    ) OR (
      "status" = 'REJECTED'
      AND "validatedAt" IS NOT NULL
      AND "validatedById" IS NOT NULL
      AND "validationSummary" IS NOT NULL
      AND "rejectionReason" IS NOT NULL
      AND length(btrim("rejectionReason")) > 0
      AND "activatedAt" IS NULL
      AND "activatedById" IS NULL
      AND "approvedById" IS NULL
      AND "supersededAt" IS NULL
      AND "supersededByReleaseId" IS NULL
    ) OR (
      "status" = 'SUPERSEDED'
      AND "validatedAt" IS NOT NULL
      AND "validatedById" IS NOT NULL
      AND "validationSummary" IS NOT NULL
      AND "activatedAt" IS NOT NULL
      AND "activatedById" IS NOT NULL
      AND "approvedById" IS NOT NULL
      AND "approvedById" = "activatedById"
      AND "approvedById" <> "createdById"
      AND "supersededAt" IS NOT NULL
      AND "supersededByReleaseId" IS NOT NULL
      AND "rejectionReason" IS NULL
    )
  )
);

CREATE TABLE "ElectoralCatalogEntry" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "releaseId" TEXT NOT NULL,
  "namespace" "ElectoralCodeNamespace" NOT NULL,
  "type" "ElectoralCatalogEntryType" NOT NULL,
  "canonicalCode" VARCHAR(32) NOT NULL,
  "departmentCode" VARCHAR(2) NOT NULL,
  "municipalityCode" VARCHAR(3),
  "zoneCode" VARCHAR(2),
  "pollingPlaceCode" VARCHAR(2),
  "parentId" TEXT,
  "name" VARCHAR(240) NOT NULL,
  "nameIsDerived" BOOLEAN NOT NULL DEFAULT false,
  "address" VARCHAR(500),
  "commune" VARCHAR(240),
  "latitude" DECIMAL(9,6),
  "longitude" DECIMAL(10,6),
  "expectedTables" INTEGER,

  CONSTRAINT "ElectoralCatalogEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ElectoralCatalogEntry_name_check" CHECK (
    length(btrim("name")) > 0
    AND (NOT "nameIsDerived" OR "type" = 'ZONE')
    AND ("commune" IS NULL OR length(btrim("commune")) > 0)
  ),
  CONSTRAINT "ElectoralCatalogEntry_coordinates_check" CHECK (
    (("latitude" IS NULL) = ("longitude" IS NULL))
    AND ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90)
    AND ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180)
  ),
  CONSTRAINT "ElectoralCatalogEntry_shape_check" CHECK (
    (
      "type" = 'DEPARTMENT'
      AND "departmentCode" ~ '^[0-9]{2}$'
      AND "municipalityCode" IS NULL
      AND "zoneCode" IS NULL
      AND "pollingPlaceCode" IS NULL
      AND "canonicalCode" = "departmentCode"
      AND "parentId" IS NULL
      AND "expectedTables" IS NULL
    ) OR (
      "type" IN ('MUNICIPALITY', 'NON_MUNICIPALIZED_AREA', 'ISLAND')
      AND "departmentCode" ~ '^[0-9]{2}$'
      AND "municipalityCode" IS NOT NULL
      AND "municipalityCode" ~ '^[0-9]{3}$'
      AND "zoneCode" IS NULL
      AND "pollingPlaceCode" IS NULL
      AND "canonicalCode" = "departmentCode" || '/' || "municipalityCode"
      AND "parentId" IS NOT NULL
      AND "expectedTables" IS NULL
    ) OR (
      "type" = 'ZONE'
      AND "departmentCode" ~ '^[0-9]{2}$'
      AND "municipalityCode" IS NOT NULL
      AND "municipalityCode" ~ '^[0-9]{3}$'
      AND "zoneCode" IS NOT NULL
      AND "zoneCode" ~ '^[0-9]{2}$'
      AND "pollingPlaceCode" IS NULL
      AND "canonicalCode" = "departmentCode" || '/' || "municipalityCode" || '/' || "zoneCode"
      AND "parentId" IS NOT NULL
      AND "expectedTables" IS NULL
    ) OR (
      "type" = 'POLLING_PLACE'
      AND "departmentCode" ~ '^[0-9]{2}$'
      AND "municipalityCode" IS NOT NULL
      AND "municipalityCode" ~ '^[0-9]{3}$'
      AND "zoneCode" IS NOT NULL
      AND "zoneCode" ~ '^[0-9]{2}$'
      AND "pollingPlaceCode" IS NOT NULL
      AND "pollingPlaceCode" ~ '^[0-9]{2}$'
      AND "canonicalCode" = "departmentCode" || '/' || "municipalityCode" || '/' || "zoneCode" || '/' || "pollingPlaceCode"
      AND "parentId" IS NOT NULL
      AND "expectedTables" IS NOT NULL
      AND "expectedTables" BETWEEN 1 AND 99999
      AND "address" IS NOT NULL
      AND length(btrim("address")) > 0
    )
  )
);

-- La proyeccion operativa conserva el id de cada codigo entre releases. Las
-- filas retiradas permanecen disponibles para relaciones historicas.
ALTER TABLE "PoliticalDivision"
  ADD COLUMN "sourceNamespace" "ElectoralCodeNamespace",
  ADD COLUMN "sourceReleaseId" TEXT,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "retiredAt" TIMESTAMP(3),
  ADD CONSTRAINT "PoliticalDivision_retirement_check" CHECK (
    ("isActive" AND "retiredAt" IS NULL)
    OR (NOT "isActive" AND "retiredAt" IS NOT NULL)
  ),
  ADD CONSTRAINT "PoliticalDivision_provenance_shape_check" CHECK (
    (
      "sourceNamespace" IS NULL
      AND "sourceReleaseId" IS NULL
      AND "code" NOT LIKE 'RNEC_DIVIPOLE:%'
    ) OR (
      "sourceNamespace" = 'RNEC_DIVIPOLE'
      AND "sourceReleaseId" IS NOT NULL
      AND "code" LIKE 'RNEC_DIVIPOLE:%'
    ) OR (
      "sourceNamespace" = 'DANE_DIVIPOLA'
      AND "sourceReleaseId" IS NOT NULL
      AND "code" NOT LIKE 'RNEC_DIVIPOLE:%'
    )
  );

CREATE UNIQUE INDEX "ElectoralCatalogRelease_id_tenantId_key"
  ON "ElectoralCatalogRelease"("id", "tenantId");
CREATE UNIQUE INDEX "ElectoralCatalogRelease_idempotency_key"
  ON "ElectoralCatalogRelease"("tenantId", "type", "sourceDataset", "contentSha256", "parserVersion");
CREATE INDEX "ElectoralCatalogRelease_tenant_catalog_status_idx"
  ON "ElectoralCatalogRelease"("tenantId", "catalogKey", "status");
CREATE INDEX "ElectoralCatalogRelease_tenant_type_status_idx"
  ON "ElectoralCatalogRelease"("tenantId", "type", "status");
CREATE INDEX "ElectoralCatalogRelease_tenant_electionDate_idx"
  ON "ElectoralCatalogRelease"("tenantId", "electionDate");
CREATE INDEX "ElectoralCatalogRelease_tenant_createdAt_idx"
  ON "ElectoralCatalogRelease"("tenantId", "createdAt");
CREATE UNIQUE INDEX "ElectoralCatalogRelease_one_active_catalog_key"
  ON "ElectoralCatalogRelease"("tenantId", "catalogKey")
  WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "ElectoralCatalogRelease_one_active_rnec_projection"
  ON "ElectoralCatalogRelease"("tenantId")
  WHERE "status" = 'ACTIVE' AND "type" = 'ELECTORAL_RNEC';

CREATE UNIQUE INDEX "ElectoralCatalogEntry_id_tenant_release_key"
  ON "ElectoralCatalogEntry"("id", "tenantId", "releaseId");
CREATE UNIQUE INDEX "ElectoralCatalogEntry_canonical_key"
  ON "ElectoralCatalogEntry"("tenantId", "releaseId", "namespace", "canonicalCode");
CREATE INDEX "ElectoralCatalogEntry_tenant_release_type_idx"
  ON "ElectoralCatalogEntry"("tenantId", "releaseId", "type");
CREATE INDEX "ElectoralCatalogEntry_tenant_release_parent_idx"
  ON "ElectoralCatalogEntry"("tenantId", "releaseId", "parentId");

CREATE INDEX "PoliticalDivision_tenant_source_active_type_idx"
  ON "PoliticalDivision"("tenantId", "sourceNamespace", "isActive", "type");
CREATE INDEX "PoliticalDivision_tenant_sourceRelease_active_idx"
  ON "PoliticalDivision"("tenantId", "sourceReleaseId", "isActive");
CREATE UNIQUE INDEX "PoliticalDivision_tenant_source_code_key"
  ON "PoliticalDivision"("tenantId", "sourceNamespace", "code")
  WHERE "sourceNamespace" IS NOT NULL;

ALTER TABLE "ElectoralCatalogRelease"
  ADD CONSTRAINT "ElectoralCatalogRelease_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ElectoralCatalogRelease"
  ADD CONSTRAINT "ElectoralCatalogRelease_createdBy_fkey"
  FOREIGN KEY ("createdById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ElectoralCatalogRelease"
  ADD CONSTRAINT "ElectoralCatalogRelease_validatedBy_fkey"
  FOREIGN KEY ("validatedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ElectoralCatalogRelease"
  ADD CONSTRAINT "ElectoralCatalogRelease_activatedBy_fkey"
  FOREIGN KEY ("activatedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ElectoralCatalogRelease"
  ADD CONSTRAINT "ElectoralCatalogRelease_approvedBy_fkey"
  FOREIGN KEY ("approvedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ElectoralCatalogRelease"
  ADD CONSTRAINT "ElectoralCatalogRelease_supersededBy_fkey"
  FOREIGN KEY ("supersededByReleaseId", "tenantId") REFERENCES "ElectoralCatalogRelease"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ElectoralCatalogEntry"
  ADD CONSTRAINT "ElectoralCatalogEntry_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ElectoralCatalogEntry"
  ADD CONSTRAINT "ElectoralCatalogEntry_release_fkey"
  FOREIGN KEY ("releaseId", "tenantId") REFERENCES "ElectoralCatalogRelease"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ElectoralCatalogEntry"
  ADD CONSTRAINT "ElectoralCatalogEntry_parent_fkey"
  FOREIGN KEY ("parentId", "tenantId", "releaseId") REFERENCES "ElectoralCatalogEntry"("id", "tenantId", "releaseId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PoliticalDivision"
  ADD CONSTRAINT "PoliticalDivision_sourceRelease_fkey"
  FOREIGN KEY ("sourceReleaseId", "tenantId") REFERENCES "ElectoralCatalogRelease"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "enforce_electoral_catalog_release_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    OLD."id", OLD."tenantId", OLD."catalogKey", OLD."type", OLD."sourceUrl",
    OLD."sourceOrganization", OLD."sourceDataset", OLD."sourceCutoffAt",
    OLD."electionDate", OLD."contentSha256", OLD."parserVersion",
    OLD."authorizationReference", OLD."licenseDeclaration",
    OLD."sourceArtifactPath", OLD."recordCount", OLD."departmentCount",
    OLD."municipalityCount", OLD."zoneCount", OLD."pollingPlaceCount",
    OLD."expectedTableCount", OLD."createdById", OLD."createdAt"
  ) IS DISTINCT FROM ROW(
    NEW."id", NEW."tenantId", NEW."catalogKey", NEW."type", NEW."sourceUrl",
    NEW."sourceOrganization", NEW."sourceDataset", NEW."sourceCutoffAt",
    NEW."electionDate", NEW."contentSha256", NEW."parserVersion",
    NEW."authorizationReference", NEW."licenseDeclaration",
    NEW."sourceArtifactPath", NEW."recordCount", NEW."departmentCount",
    NEW."municipalityCount", NEW."zoneCount", NEW."pollingPlaceCount",
    NEW."expectedTableCount", NEW."createdById", NEW."createdAt"
  ) THEN
    RAISE EXCEPTION 'El contenido y la procedencia de un release electoral son inmutables'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."status" = NEW."status" THEN
    IF OLD IS DISTINCT FROM NEW THEN
      RAISE EXCEPTION 'No se pueden mutar campos de lifecycle sin una transicion de estado'
        USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD."status" = 'STAGED' AND NEW."status" IN ('VALIDATED', 'REJECTED'))
    OR (OLD."status" = 'VALIDATED' AND NEW."status" IN ('ACTIVE', 'REJECTED'))
    OR (OLD."status" = 'ACTIVE' AND NEW."status" = 'SUPERSEDED')
  ) THEN
    RAISE EXCEPTION 'Transicion de release electoral no permitida: % -> %', OLD."status", NEW."status"
      USING ERRCODE = '23514';
  END IF;

  IF OLD."status" = 'VALIDATED' AND NEW."status" = 'ACTIVE'
     AND (
       SELECT count(*)
       FROM "PoliticalDivision"
       WHERE "tenantId" = NEW."tenantId"
         AND "sourceReleaseId" = NEW."id"
         AND "isActive"
     ) <> NEW."recordCount" THEN
    RAISE EXCEPTION 'No se puede activar un release sin materializar toda su proyeccion territorial'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."status" = 'ACTIVE' AND NEW."status" = 'SUPERSEDED'
     AND EXISTS (
       SELECT 1
       FROM "PoliticalDivision"
       WHERE "tenantId" = OLD."tenantId"
         AND "sourceReleaseId" = OLD."id"
         AND "isActive"
     ) THEN
    RAISE EXCEPTION 'No se puede retirar un release mientras conserve divisiones activas'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."status" = 'VALIDATED' AND NEW."status" IN ('ACTIVE', 'REJECTED')
     AND ROW(OLD."validatedAt", OLD."validatedById", OLD."validationSummary")
       IS DISTINCT FROM
       ROW(NEW."validatedAt", NEW."validatedById", NEW."validationSummary") THEN
    RAISE EXCEPTION 'La evidencia de validacion de un release es inmutable'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."status" = 'ACTIVE' AND NEW."status" = 'SUPERSEDED'
     AND ROW(
       OLD."validatedAt", OLD."validatedById", OLD."validationSummary",
       OLD."activatedAt", OLD."activatedById", OLD."approvedById"
     ) IS DISTINCT FROM ROW(
       NEW."validatedAt", NEW."validatedById", NEW."validationSummary",
       NEW."activatedAt", NEW."activatedById", NEW."approvedById"
     ) THEN
    RAISE EXCEPTION 'La evidencia validada y aprobada de un release activo es inmutable'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ElectoralCatalogRelease_enforce_update"
BEFORE UPDATE ON "ElectoralCatalogRelease"
FOR EACH ROW
EXECUTE FUNCTION "enforce_electoral_catalog_release_update"();

CREATE FUNCTION "validate_electoral_catalog_entry_insert"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  release_type "ElectoralCatalogType";
  release_status "ElectoralCatalogStatus";
  parent_type "ElectoralCatalogEntryType";
BEGIN
  SELECT "type", "status" INTO release_type, release_status
  FROM "ElectoralCatalogRelease"
  WHERE "id" = NEW."releaseId" AND "tenantId" = NEW."tenantId";

  IF release_status IS DISTINCT FROM 'STAGED' THEN
    RAISE EXCEPTION 'Solo se pueden insertar entradas en un release STAGED'
      USING ERRCODE = '23514';
  END IF;

  IF (release_type = 'ELECTORAL_RNEC' AND NEW."namespace" <> 'RNEC_DIVIPOLE')
     OR (release_type = 'ADMINISTRATIVE_DANE' AND NEW."namespace" <> 'DANE_DIVIPOLA') THEN
    RAISE EXCEPTION 'El namespace de la entrada no corresponde al tipo de release'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."type" = 'DEPARTMENT' THEN
    RETURN NEW;
  END IF;

  SELECT "type" INTO parent_type
  FROM "ElectoralCatalogEntry"
  WHERE "id" = NEW."parentId"
    AND "tenantId" = NEW."tenantId"
    AND "releaseId" = NEW."releaseId";

  IF parent_type IS NULL
     OR (NEW."type" IN ('MUNICIPALITY', 'NON_MUNICIPALIZED_AREA', 'ISLAND') AND parent_type <> 'DEPARTMENT')
     OR (NEW."type" = 'ZONE' AND parent_type NOT IN ('MUNICIPALITY', 'NON_MUNICIPALIZED_AREA', 'ISLAND'))
     OR (NEW."type" = 'POLLING_PLACE' AND parent_type <> 'ZONE') THEN
    RAISE EXCEPTION 'Jerarquia electoral invalida para %', NEW."canonicalCode"
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ElectoralCatalogEntry_validate_insert"
BEFORE INSERT ON "ElectoralCatalogEntry"
FOR EACH ROW
EXECUTE FUNCTION "validate_electoral_catalog_entry_insert"();

CREATE FUNCTION "prevent_electoral_catalog_history_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'El historial del catalogo electoral es inmutable: % no esta permitido', TG_OP
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "ElectoralCatalogEntry_prevent_update_delete"
BEFORE UPDATE OR DELETE ON "ElectoralCatalogEntry"
FOR EACH ROW
EXECUTE FUNCTION "prevent_electoral_catalog_history_mutation"();
CREATE TRIGGER "ElectoralCatalogEntry_prevent_truncate"
BEFORE TRUNCATE ON "ElectoralCatalogEntry"
FOR EACH STATEMENT
EXECUTE FUNCTION "prevent_electoral_catalog_history_mutation"();
CREATE TRIGGER "ElectoralCatalogRelease_prevent_delete"
BEFORE DELETE ON "ElectoralCatalogRelease"
FOR EACH ROW
EXECUTE FUNCTION "prevent_electoral_catalog_history_mutation"();
CREATE TRIGGER "ElectoralCatalogRelease_prevent_truncate"
BEFORE TRUNCATE ON "ElectoralCatalogRelease"
FOR EACH STATEMENT
EXECUTE FUNCTION "prevent_electoral_catalog_history_mutation"();

ALTER TABLE "ElectoralCatalogEntry"
  ENABLE ALWAYS TRIGGER "ElectoralCatalogEntry_validate_insert";
ALTER TABLE "ElectoralCatalogEntry"
  ENABLE ALWAYS TRIGGER "ElectoralCatalogEntry_prevent_update_delete";
ALTER TABLE "ElectoralCatalogEntry"
  ENABLE ALWAYS TRIGGER "ElectoralCatalogEntry_prevent_truncate";
ALTER TABLE "ElectoralCatalogRelease"
  ENABLE ALWAYS TRIGGER "ElectoralCatalogRelease_enforce_update";
ALTER TABLE "ElectoralCatalogRelease"
  ENABLE ALWAYS TRIGGER "ElectoralCatalogRelease_prevent_delete";
ALTER TABLE "ElectoralCatalogRelease"
  ENABLE ALWAYS TRIGGER "ElectoralCatalogRelease_prevent_truncate";

-- La procedencia de cada proyeccion se comprueba contra el snapshot del mismo
-- tenant. No se prohibe la coexistencia historica: `isActive` distingue la
-- proyeccion vigente sin borrar filas que ya tienen referencias.
CREATE FUNCTION "validate_political_division_source"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  release_type "ElectoralCatalogType";
  release_status "ElectoralCatalogStatus";
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD."sourceNamespace" IS NOT NULL
     AND ROW(OLD."id", OLD."tenantId", OLD."code", OLD."sourceNamespace")
       IS DISTINCT FROM
       ROW(NEW."id", NEW."tenantId", NEW."code", NEW."sourceNamespace") THEN
    RAISE EXCEPTION 'El id, tenant, namespace y codigo de una division catalogada son inmutables'
      USING ERRCODE = '55000';
  END IF;

  IF NEW."sourceReleaseId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "type", "status" INTO release_type, release_status
  FROM "ElectoralCatalogRelease"
  WHERE "id" = NEW."sourceReleaseId"
    AND "tenantId" = NEW."tenantId";

  IF release_type IS NULL
     OR release_status NOT IN ('VALIDATED', 'ACTIVE', 'SUPERSEDED') THEN
    RAISE EXCEPTION 'La procedencia territorial no pertenece a un release utilizable del tenant'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."isActive" AND release_status NOT IN ('VALIDATED', 'ACTIVE') THEN
    RAISE EXCEPTION 'Una division activa no puede provenir de un release retirado'
      USING ERRCODE = '23514';
  END IF;

  IF (NEW."sourceNamespace" = 'RNEC_DIVIPOLE' AND release_type <> 'ELECTORAL_RNEC')
     OR (NEW."sourceNamespace" = 'DANE_DIVIPOLA' AND release_type <> 'ADMINISTRATIVE_DANE') THEN
    RAISE EXCEPTION 'El namespace territorial no corresponde al tipo de release'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "ElectoralCatalogEntry" entry
    WHERE entry."tenantId" = NEW."tenantId"
      AND entry."releaseId" = NEW."sourceReleaseId"
      AND entry."namespace" = NEW."sourceNamespace"
      AND (
        (NEW."sourceNamespace" = 'RNEC_DIVIPOLE'
          AND 'RNEC_DIVIPOLE:' || entry."canonicalCode" = NEW."code")
        OR (NEW."sourceNamespace" = 'DANE_DIVIPOLA'
          AND entry."canonicalCode" = NEW."code")
      )
      AND (
        (NEW."type" = 'DEPARTAMENTO' AND entry."type" = 'DEPARTMENT')
        OR (NEW."type" = 'MUNICIPIO' AND entry."type" IN ('MUNICIPALITY', 'NON_MUNICIPALIZED_AREA', 'ISLAND'))
        OR (NEW."type" = 'ZONA' AND entry."type" = 'ZONE')
        OR (NEW."type" = 'PUESTO' AND entry."type" = 'POLLING_PLACE')
      )
  ) THEN
    RAISE EXCEPTION 'La division no corresponde a una entrada de su release de procedencia'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "PoliticalDivision_validate_source"
BEFORE INSERT OR UPDATE OF "tenantId", "code", "type", "sourceNamespace", "sourceReleaseId", "isActive", "retiredAt"
ON "PoliticalDivision"
FOR EACH ROW
EXECUTE FUNCTION "validate_political_division_source"();

ALTER TABLE "PoliticalDivision"
  ENABLE ALWAYS TRIGGER "PoliticalDivision_validate_source";

CREATE FUNCTION "prevent_catalog_political_division_delete"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."sourceNamespace" IS NOT NULL THEN
    RAISE EXCEPTION 'Una division proveniente de catalogo no se borra; debe retirarse con isActive=false'
      USING ERRCODE = '55000';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "PoliticalDivision_prevent_catalog_delete"
BEFORE DELETE ON "PoliticalDivision"
FOR EACH ROW
EXECUTE FUNCTION "prevent_catalog_political_division_delete"();

ALTER TABLE "PoliticalDivision"
  ENABLE ALWAYS TRIGGER "PoliticalDivision_prevent_catalog_delete";

COMMIT;
