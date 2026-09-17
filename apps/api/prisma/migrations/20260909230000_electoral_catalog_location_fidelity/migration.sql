BEGIN;

-- Forward-only location fidelity. Historical releases remain readable with a
-- NULL physical count: there is no safe way to reconstruct the identity of a
-- physical location after the source artifact has been discarded.
ALTER TABLE "ElectoralCatalogRelease"
  ADD COLUMN "physicalPollingPlaceCount" INTEGER,
  ADD CONSTRAINT "ElectoralCatalogRelease_physical_polling_place_count_check"
    CHECK (
      "physicalPollingPlaceCount" IS NULL
      OR "physicalPollingPlaceCount" BETWEEN 0 AND "pollingPlaceCount"
    );

ALTER TABLE "ElectoralCatalogEntry"
  ADD COLUMN "sourceLocationCode" VARCHAR(32),
  ADD COLUMN "votingDate" DATE,
  ADD COLUMN "timeZone" VARCHAR(100),
  ADD CONSTRAINT "ElectoralCatalogEntry_source_location_shape_check"
    CHECK (
      (
        "type" <> 'POLLING_PLACE'
        AND "sourceLocationCode" IS NULL
        AND "votingDate" IS NULL
        AND "timeZone" IS NULL
      ) OR (
        "type" = 'POLLING_PLACE'
        AND (
          (
            "sourceLocationCode" IS NULL
            AND "votingDate" IS NULL
            AND "timeZone" IS NULL
          )
          OR (
            "sourceLocationCode" ~ '^[0-9]{1,32}$'
            AND "votingDate" IS NOT NULL
            AND (
              "timeZone" IS NULL
              OR "timeZone" ~ '^[A-Za-z][A-Za-z0-9._+-]*(/[A-Za-z][A-Za-z0-9._+-]*)+$'
            )
          )
        )
      )
    );

ALTER TABLE "PoliticalDivision"
  ADD COLUMN "sourceLocationCode" VARCHAR(32),
  ADD COLUMN "votingDate" DATE,
  ADD COLUMN "timeZone" VARCHAR(100),
  ADD COLUMN "address" VARCHAR(500),
  ADD COLUMN "commune" VARCHAR(240),
  ADD COLUMN "latitude" DECIMAL(9,6),
  ADD COLUMN "longitude" DECIMAL(10,6),
  ADD CONSTRAINT "PoliticalDivision_catalog_location_shape_check"
    CHECK (
      (("latitude" IS NULL) = ("longitude" IS NULL))
      AND ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90)
      AND ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180)
      AND ("address" IS NULL OR length(btrim("address")) > 0)
      AND ("commune" IS NULL OR length(btrim("commune")) > 0)
      AND (
        (
          "sourceLocationCode" IS NULL
          AND "votingDate" IS NULL
          AND "timeZone" IS NULL
        )
        OR (
          "type" = 'PUESTO'
          AND "sourceLocationCode" ~ '^[0-9]{1,32}$'
          AND "votingDate" IS NOT NULL
          AND (
            "timeZone" IS NULL
            OR "timeZone" ~ '^[A-Za-z][A-Za-z0-9._+-]*(/[A-Za-z][A-Za-z0-9._+-]*)+$'
          )
        )
      )
    );

-- A grant issued before this migration remains identifiable but is not
-- silently upgraded. New catalog-backed grants freeze the release, physical
-- location and civil voting day that were authorized.
ALTER TABLE "OfflineE14CaptureGrantPlace"
  ADD COLUMN "sourceReleaseIdAtIssue" TEXT,
  ADD COLUMN "sourceLocationCodeAtIssue" VARCHAR(32),
  ADD COLUMN "votingDateAtIssue" DATE,
  ADD COLUMN "timeZoneAtIssue" VARCHAR(100),
  ADD CONSTRAINT "OfflineE14GrantPlace_location_snapshot_check"
    CHECK (
      (
        "sourceReleaseIdAtIssue" IS NULL
        AND "sourceLocationCodeAtIssue" IS NULL
        AND "votingDateAtIssue" IS NULL
        AND "timeZoneAtIssue" IS NULL
      ) OR (
        "sourceReleaseIdAtIssue" IS NOT NULL
        AND length(btrim("sourceReleaseIdAtIssue")) > 0
        AND "sourceLocationCodeAtIssue" ~ '^[0-9]{1,32}$'
        AND "votingDateAtIssue" IS NOT NULL
        AND (
          "timeZoneAtIssue" IS NULL
          OR "timeZoneAtIssue" ~ '^[A-Za-z][A-Za-z0-9._+-]*(/[A-Za-z][A-Za-z0-9._+-]*)+$'
        )
      )
    );

CREATE INDEX "ElectoralCatalogEntry_tenant_release_sourceLocation_idx"
  ON "ElectoralCatalogEntry"("tenantId", "releaseId", "sourceLocationCode");
CREATE INDEX "ElectoralCatalogEntry_tenant_release_votingDate_type_idx"
  ON "ElectoralCatalogEntry"("tenantId", "releaseId", "votingDate", "type");
CREATE INDEX "ElectoralCatalogEntry_tenant_release_votingDate_timeZone_idx"
  ON "ElectoralCatalogEntry"(
    "tenantId", "releaseId", "votingDate", "timeZone"
  );
CREATE INDEX "PoliticalDivision_tenant_votingDate_type_active_idx"
  ON "PoliticalDivision"("tenantId", "votingDate", "type", "isActive");
CREATE INDEX "PoliticalDivision_tenant_sourceLocation_votingDate_idx"
  ON "PoliticalDivision"("tenantId", "sourceLocationCode", "votingDate");
CREATE INDEX "PoliticalDivision_tenant_votingDate_timeZone_active_idx"
  ON "PoliticalDivision"(
    "tenantId", "votingDate", "timeZone", "isActive"
  );

CREATE FUNCTION "validate_electoral_catalog_location_release"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  observed_physical INTEGER;
  incomplete_places INTEGER;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD."physicalPollingPlaceCount" IS DISTINCT FROM NEW."physicalPollingPlaceCount" THEN
    RAISE EXCEPTION 'El conteo fisico de un release electoral es inmutable'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD."status" = 'STAGED'
     AND NEW."status" IN ('VALIDATED', 'REJECTED')
     AND NEW."physicalPollingPlaceCount" IS NOT NULL THEN
    SELECT
      count(DISTINCT "sourceLocationCode"),
      count(*) FILTER (
        WHERE "sourceLocationCode" IS NULL OR "votingDate" IS NULL
      )
    INTO observed_physical, incomplete_places
    FROM "ElectoralCatalogEntry"
    WHERE "tenantId" = NEW."tenantId"
      AND "releaseId" = NEW."id"
      AND "type" = 'POLLING_PLACE';

    IF incomplete_places <> 0
       OR observed_physical <> NEW."physicalPollingPlaceCount" THEN
      RAISE EXCEPTION 'La identidad fisica y jornada de los puestos no coincide con el release'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ElectoralCatalogRelease_validate_location_fidelity"
BEFORE UPDATE ON "ElectoralCatalogRelease"
FOR EACH ROW
EXECUTE FUNCTION "validate_electoral_catalog_location_release"();

ALTER TABLE "ElectoralCatalogRelease"
  ENABLE ALWAYS TRIGGER "ElectoralCatalogRelease_validate_location_fidelity";

CREATE FUNCTION "validate_catalog_division_location_projection"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  entry_row "ElectoralCatalogEntry"%ROWTYPE;
  release_physical_count INTEGER;
BEGIN
  IF NEW."sourceNamespace" <> 'RNEC_DIVIPOLE'
     OR NEW."type" <> 'PUESTO'
     OR NEW."sourceReleaseId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT release."physicalPollingPlaceCount"
    INTO release_physical_count
  FROM "ElectoralCatalogRelease" release
  WHERE release."id" = NEW."sourceReleaseId"
    AND release."tenantId" = NEW."tenantId";

  SELECT entry.*
    INTO entry_row
  FROM "ElectoralCatalogEntry" entry
  WHERE entry."tenantId" = NEW."tenantId"
    AND entry."releaseId" = NEW."sourceReleaseId"
    AND entry."namespace" = NEW."sourceNamespace"
    AND 'RNEC_DIVIPOLE:' || entry."canonicalCode" = NEW."code"
    AND entry."type" = 'POLLING_PLACE';

  IF release_physical_count IS NOT NULL
     AND (
       entry_row."id" IS NULL
       OR entry_row."sourceLocationCode" IS NULL
       OR entry_row."votingDate" IS NULL
       OR ROW(
         NEW."sourceLocationCode", NEW."votingDate", NEW."address",
         NEW."commune", NEW."latitude", NEW."longitude", NEW."timeZone"
       ) IS DISTINCT FROM ROW(
         entry_row."sourceLocationCode", entry_row."votingDate",
         entry_row."address", entry_row."commune", entry_row."latitude",
         entry_row."longitude", entry_row."timeZone"
       )
     ) THEN
    RAISE EXCEPTION 'La proyeccion territorial no conserva codigo fisico, jornada y geografia del release'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "PoliticalDivision_validate_catalog_location_projection"
BEFORE INSERT OR UPDATE OF
  "sourceReleaseId", "sourceLocationCode", "votingDate", "address",
  "commune", "latitude", "longitude", "timeZone", "isActive"
ON "PoliticalDivision"
FOR EACH ROW
EXECUTE FUNCTION "validate_catalog_division_location_projection"();

ALTER TABLE "PoliticalDivision"
  ENABLE ALWAYS TRIGGER "PoliticalDivision_validate_catalog_location_projection";

-- A REAL coverage window is valid only for the exact logical day and IANA
-- time zone projected from its polling place. SIMULATION remains independent.
CREATE FUNCTION "validate_real_witness_window_catalog_day"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  place_voting_date DATE;
  place_time_zone VARCHAR(100);
BEGIN
  IF NEW."captureContext" <> 'REAL' THEN
    RETURN NEW;
  END IF;

  SELECT place."votingDate", place."timeZone"
    INTO place_voting_date, place_time_zone
  FROM "PoliticalDivision" place
  WHERE place."id" = NEW."puestoId"
    AND place."tenantId" = NEW."tenantId"
    AND place."type" = 'PUESTO'
    AND place."isActive" = true;

  IF NOT FOUND
     OR place_voting_date IS NULL
     OR place_time_zone IS NULL THEN
    RAISE EXCEPTION 'REAL witness coverage requires a documented polling-place day and time zone'
      USING ERRCODE = '23514';
  END IF;
  IF NEW."localDate" IS DISTINCT FROM place_voting_date
     OR NEW."timeZone" IS DISTINCT FROM place_time_zone THEN
    RAISE EXCEPTION 'REAL witness coverage must match the polling-place logical day and time zone'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "WitnessCoverageWindow_catalog_day_guard"
BEFORE INSERT OR UPDATE OF
  "captureContext", "puestoId", "tenantId", "localDate", "timeZone"
ON "WitnessCoverageWindow"
FOR EACH ROW
EXECUTE FUNCTION "validate_real_witness_window_catalog_day"();

ALTER TABLE "WitnessCoverageWindow"
  ENABLE ALWAYS TRIGGER "WitnessCoverageWindow_catalog_day_guard";

-- Catalog replacement cannot silently invalidate an active REAL planning
-- window. Operators must resolve/cancel the planning state first.
CREATE FUNCTION "preserve_real_witness_window_catalog_day"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "WitnessCoverageWindow" coverage
    WHERE coverage."tenantId" = OLD."tenantId"
      AND coverage."puestoId" = OLD."id"
      AND coverage."captureContext" = 'REAL'
      AND (
        coverage."localDate" IS DISTINCT FROM NEW."votingDate"
        OR coverage."timeZone" IS DISTINCT FROM NEW."timeZone"
      )
  ) THEN
    RAISE EXCEPTION 'Polling-place day or time zone is referenced by REAL witness coverage'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "PoliticalDivision_preserve_real_witness_window"
BEFORE UPDATE OF "votingDate", "timeZone" ON "PoliticalDivision"
FOR EACH ROW
EXECUTE FUNCTION "preserve_real_witness_window_catalog_day"();

ALTER TABLE "PoliticalDivision"
  ENABLE ALWAYS TRIGGER "PoliticalDivision_preserve_real_witness_window";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "WitnessCoverageWindow" coverage
    JOIN "PoliticalDivision" place
      ON place."id" = coverage."puestoId"
     AND place."tenantId" = coverage."tenantId"
    WHERE coverage."captureContext" = 'REAL'
      AND (
        place."votingDate" IS NULL
        OR place."timeZone" IS NULL
        OR coverage."localDate" IS DISTINCT FROM place."votingDate"
        OR coverage."timeZone" IS DISTINCT FROM place."timeZone"
      )
  ) THEN
    RAISE EXCEPTION 'Existing REAL witness coverage lacks an exact catalog day/time-zone match'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

COMMIT;
