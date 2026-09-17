BEGIN;

-- Durable, tenant-scoped witness planning. This migration creates planning
-- records and concurrency fences only; it never infers coverage from the
-- legacy User.divisionId relation.
CREATE TYPE "WitnessAssignmentType" AS ENUM ('PRIMARY', 'BACKUP');
CREATE TYPE "WitnessAssignmentStatus" AS ENUM (
  'PLANNED',
  'CONFIRMED',
  'CANCELLED'
);
CREATE TYPE "WitnessCoverageWindowCommandType" AS ENUM ('CREATE', 'UPDATE');

CREATE TABLE "WitnessCoverageWindow" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "clientRequestId" UUID NOT NULL,
  "payloadSha256" CHAR(64) NOT NULL,
  "captureContext" "WitnessCaptureContext" NOT NULL,
  "puestoId" TEXT NOT NULL,
  "localDate" DATE NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "timeZone" VARCHAR(64) NOT NULL,
  "utcOffsetMinutes" INTEGER NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WitnessCoverageWindow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WitnessAssignment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "coverageWindowId" TEXT NOT NULL,
  "clientRequestId" UUID NOT NULL,
  "payloadSha256" CHAR(64) NOT NULL,
  "captureContext" "WitnessCaptureContext" NOT NULL,
  "puestoId" TEXT NOT NULL,
  "tableStart" INTEGER NOT NULL,
  "tableEnd" INTEGER NOT NULL,
  "shiftStartsAt" TIMESTAMP(3) NOT NULL,
  "shiftEndsAt" TIMESTAMP(3) NOT NULL,
  "assignmentType" "WitnessAssignmentType" NOT NULL,
  "status" "WitnessAssignmentStatus" NOT NULL DEFAULT 'PLANNED',
  "witnessId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "confirmedById" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "confirmationClientRequestId" UUID,
  "confirmationPayloadSha256" CHAR(64),
  "cancelledById" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "cancellationClientRequestId" UUID,
  "cancellationPayloadSha256" CHAR(64),
  "cancellationReason" VARCHAR(1000),
  "supersedesAssignmentId" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WitnessAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WitnessCoverageWindowCommand" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "coverageWindowId" TEXT NOT NULL,
  "clientRequestId" UUID NOT NULL,
  "payloadSha256" CHAR(64) NOT NULL,
  "type" "WitnessCoverageWindowCommandType" NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WitnessCoverageWindowCommand_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WitnessCoverageWindow"
  ADD CONSTRAINT "WitnessCoverageWindow_id_tenantId_key"
    UNIQUE ("id", "tenantId"),
  ADD CONSTRAINT "WitnessCoverageWindow_tenant_client_key"
    UNIQUE ("tenantId", "clientRequestId"),
  ADD CONSTRAINT "WitnessCoverageWindow_natural_key"
    UNIQUE (
      "tenantId", "operationProfileId", "captureContext", "puestoId", "localDate"
    );

ALTER TABLE "WitnessCoverageWindowCommand"
  ADD CONSTRAINT "WitnessCoverageWindowCommand_id_tenantId_key"
    UNIQUE ("id", "tenantId"),
  ADD CONSTRAINT "WitnessCoverageWindowCommand_tenant_client_key"
    UNIQUE ("tenantId", "clientRequestId");

ALTER TABLE "WitnessAssignment"
  ADD CONSTRAINT "WitnessAssignment_id_tenantId_key"
    UNIQUE ("id", "tenantId"),
  ADD CONSTRAINT "WitnessAssignment_tenant_client_key"
    UNIQUE ("tenantId", "clientRequestId"),
  ADD CONSTRAINT "WitnessAssignment_tenant_confirm_client_key"
    UNIQUE ("tenantId", "confirmationClientRequestId"),
  ADD CONSTRAINT "WitnessAssignment_tenant_cancel_client_key"
    UNIQUE ("tenantId", "cancellationClientRequestId"),
  ADD CONSTRAINT "WitnessAssignment_supersedes_tenant_key"
    UNIQUE ("supersedesAssignmentId", "tenantId");

CREATE INDEX "WitnessAssignment_tenant_profile_context_status_idx"
  ON "WitnessAssignment"(
    "tenantId", "operationProfileId", "captureContext", "status"
  );
CREATE INDEX "WitnessAssignment_tenant_window_status_idx"
  ON "WitnessAssignment"("tenantId", "coverageWindowId", "status");
CREATE INDEX "WitnessAssignment_tenant_place_tables_idx"
  ON "WitnessAssignment"("tenantId", "puestoId", "tableStart", "tableEnd");
CREATE INDEX "WitnessAssignment_tenant_witness_shift_idx"
  ON "WitnessAssignment"(
    "tenantId", "witnessId", "shiftStartsAt", "shiftEndsAt"
  );
CREATE INDEX "WitnessAssignment_tenant_status_shift_idx"
  ON "WitnessAssignment"(
    "tenantId", "status", "shiftStartsAt", "shiftEndsAt"
  );

CREATE INDEX "WitnessCoverageWindow_tenant_profile_context_date_idx"
  ON "WitnessCoverageWindow"(
    "tenantId", "operationProfileId", "captureContext", "localDate"
  );
CREATE INDEX "WitnessCoverageWindow_tenant_place_time_idx"
  ON "WitnessCoverageWindow"("tenantId", "puestoId", "startsAt", "endsAt");
CREATE INDEX "WitnessCoverageWindowCommand_tenant_window_created_idx"
  ON "WitnessCoverageWindowCommand"(
    "tenantId", "coverageWindowId", "createdAt"
  );

ALTER TABLE "WitnessCoverageWindow"
  ADD CONSTRAINT "WitnessCoverageWindow_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WitnessCoverageWindow_profile_fkey"
    FOREIGN KEY ("operationProfileId", "tenantId")
    REFERENCES "OperationProfile"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WitnessCoverageWindow_puesto_fkey"
    FOREIGN KEY ("puestoId", "tenantId")
    REFERENCES "PoliticalDivision"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WitnessCoverageWindow_creator_fkey"
    FOREIGN KEY ("createdById", "tenantId")
    REFERENCES "User"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WitnessCoverageWindow_updater_fkey"
    FOREIGN KEY ("updatedById", "tenantId")
    REFERENCES "User"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WitnessAssignment"
  ADD CONSTRAINT "WitnessAssignment_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WitnessAssignment_profile_fkey"
    FOREIGN KEY ("operationProfileId", "tenantId")
    REFERENCES "OperationProfile"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WitnessAssignment_window_fkey"
    FOREIGN KEY ("coverageWindowId", "tenantId")
    REFERENCES "WitnessCoverageWindow"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WitnessAssignment_puesto_fkey"
    FOREIGN KEY ("puestoId", "tenantId")
    REFERENCES "PoliticalDivision"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WitnessAssignment_witness_fkey"
    FOREIGN KEY ("witnessId", "tenantId")
    REFERENCES "User"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WitnessAssignment_creator_fkey"
    FOREIGN KEY ("createdById", "tenantId")
    REFERENCES "User"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WitnessAssignment_confirmer_fkey"
    FOREIGN KEY ("confirmedById", "tenantId")
    REFERENCES "User"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WitnessAssignment_canceller_fkey"
    FOREIGN KEY ("cancelledById", "tenantId")
    REFERENCES "User"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WitnessAssignment_supersedes_fkey"
    FOREIGN KEY ("supersedesAssignmentId", "tenantId")
    REFERENCES "WitnessAssignment"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WitnessCoverageWindowCommand"
  ADD CONSTRAINT "WitnessCoverageWindowCommand_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WitnessCoverageWindowCommand_window_fkey"
    FOREIGN KEY ("coverageWindowId", "tenantId")
    REFERENCES "WitnessCoverageWindow"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WitnessCoverageWindowCommand_actor_fkey"
    FOREIGN KEY ("actorUserId", "tenantId")
    REFERENCES "User"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WitnessCoverageWindow"
  ADD CONSTRAINT "WitnessCoverageWindow_payload_check" CHECK (
    "payloadSha256" ~ '^[a-f0-9]{64}$'
    AND "captureContext" <> 'LEGACY_UNCLASSIFIED'
    AND "endsAt" > "startsAt"
    AND "utcOffsetMinutes" BETWEEN -840 AND 840
    AND "version" >= 1
    AND "timeZone" ~ '^[A-Za-z][A-Za-z0-9._+-]*(/[A-Za-z][A-Za-z0-9._+-]*)+$'
    AND ("startsAt" + make_interval(mins => "utcOffsetMinutes"))::date = "localDate"
    AND (
      "endsAt" - INTERVAL '1 millisecond'
      + make_interval(mins => "utcOffsetMinutes")
    )::date = "localDate"
  );

ALTER TABLE "WitnessCoverageWindowCommand"
  ADD CONSTRAINT "WitnessCoverageWindowCommand_hash_check" CHECK (
    "payloadSha256" ~ '^[a-f0-9]{64}$'
  );

ALTER TABLE "WitnessAssignment"
  ADD CONSTRAINT "WitnessAssignment_hashes_check" CHECK (
    "payloadSha256" ~ '^[a-f0-9]{64}$'
    AND (
      "confirmationPayloadSha256" IS NULL
      OR "confirmationPayloadSha256" ~ '^[a-f0-9]{64}$'
    )
    AND (
      "cancellationPayloadSha256" IS NULL
      OR "cancellationPayloadSha256" ~ '^[a-f0-9]{64}$'
    )
  ),
  ADD CONSTRAINT "WitnessAssignment_range_check" CHECK (
    "tableStart" >= 1
    AND "tableEnd" >= "tableStart"
    AND "shiftEndsAt" > "shiftStartsAt"
    AND "version" >= 1
    AND (
      "supersedesAssignmentId" IS NULL
      OR "supersedesAssignmentId" <> "id"
    )
    AND "captureContext" <> 'LEGACY_UNCLASSIFIED'
  ),
  ADD CONSTRAINT "WitnessAssignment_lifecycle_check" CHECK (
    (
      "status" = 'PLANNED'
      AND "confirmedById" IS NULL
      AND "confirmedAt" IS NULL
      AND "confirmationClientRequestId" IS NULL
      AND "confirmationPayloadSha256" IS NULL
      AND "cancelledById" IS NULL
      AND "cancelledAt" IS NULL
      AND "cancellationClientRequestId" IS NULL
      AND "cancellationPayloadSha256" IS NULL
      AND "cancellationReason" IS NULL
    ) OR (
      "status" = 'CONFIRMED'
      AND "confirmedById" IS NOT NULL
      AND "confirmedAt" IS NOT NULL
      AND "confirmationClientRequestId" IS NOT NULL
      AND "confirmationPayloadSha256" IS NOT NULL
      AND "cancelledById" IS NULL
      AND "cancelledAt" IS NULL
      AND "cancellationClientRequestId" IS NULL
      AND "cancellationPayloadSha256" IS NULL
      AND "cancellationReason" IS NULL
    ) OR (
      "status" = 'CANCELLED'
      AND (
        (
          "confirmedById" IS NULL
          AND "confirmedAt" IS NULL
          AND "confirmationClientRequestId" IS NULL
          AND "confirmationPayloadSha256" IS NULL
        ) OR (
          "confirmedById" IS NOT NULL
          AND "confirmedAt" IS NOT NULL
          AND "confirmationClientRequestId" IS NOT NULL
          AND "confirmationPayloadSha256" IS NOT NULL
        )
      )
      AND "cancelledById" IS NOT NULL
      AND "cancelledAt" IS NOT NULL
      AND "cancellationClientRequestId" IS NOT NULL
      AND "cancellationPayloadSha256" IS NOT NULL
      AND length(btrim("cancellationReason")) >= 20
    )
  );

-- btree_gist lets PostgreSQL enforce range overlap rules atomically, including
-- for direct SQL writers and concurrent transactions.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "WitnessAssignment"
  ADD CONSTRAINT "WitnessAssignment_no_duplicate_table_shift"
  EXCLUDE USING gist (
    "tenantId" WITH =,
    "operationProfileId" WITH =,
    "captureContext" WITH =,
    "puestoId" WITH =,
    "assignmentType" WITH =,
    int4range("tableStart", "tableEnd", '[]') WITH &&,
    tsrange("shiftStartsAt", "shiftEndsAt", '[)') WITH &&
  ) WHERE ("status" IN ('PLANNED', 'CONFIRMED')),
  ADD CONSTRAINT "WitnessAssignment_no_witness_double_booking"
  EXCLUDE USING gist (
    "tenantId" WITH =,
    "operationProfileId" WITH =,
    "witnessId" WITH =,
    tsrange("shiftStartsAt", "shiftEndsAt", '[)') WITH &&
  ) WHERE ("status" IN ('PLANNED', 'CONFIRMED'));

CREATE FUNCTION validate_witness_coverage_window_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  profile_stage "PoliticalOperationStage";
  voting_start DATE;
  voting_end DATE;
  expected_tables INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('operation-profile-lifecycle:' || NEW."tenantId", 0)
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended('witness-assignment:' || NEW."tenantId", 0)
  );

  SELECT profile."stage", profile."votingStartDate", profile."votingEndDate"
  INTO profile_stage, voting_start, voting_end
  FROM "OperationProfile" profile
  WHERE profile."id" = NEW."operationProfileId"
    AND profile."tenantId" = NEW."tenantId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WitnessCoverageWindow requires a tenant-scoped operation profile';
  END IF;
  IF profile_stage NOT IN (
    'PRE_CAMPAIGN', 'CAMPAIGN', 'ELECTION_PREPARATION',
    'SIMULATION', 'ELECTION_DAY'
  ) THEN
    RAISE EXCEPTION 'WitnessCoverageWindow is not mutable in this operation stage';
  END IF;
  IF NEW."captureContext" = 'SIMULATION'
    AND profile_stage NOT IN ('CAMPAIGN', 'ELECTION_PREPARATION', 'SIMULATION')
  THEN
    RAISE EXCEPTION 'SIMULATION coverage windows are not allowed in this stage';
  END IF;

  SELECT place."expectedTables"
  INTO expected_tables
  FROM "PoliticalDivision" place
  WHERE place."id" = NEW."puestoId"
    AND place."tenantId" = NEW."tenantId"
    AND place."type" = 'PUESTO'
    AND place."isActive" = true;

  IF NOT FOUND OR expected_tables IS NULL OR expected_tables <= 0 THEN
    RAISE EXCEPTION 'WitnessCoverageWindow requires an active polling place with expected tables';
  END IF;

  IF NEW."captureContext" = 'REAL'
    AND (NEW."localDate" < voting_start OR NEW."localDate" > voting_end)
  THEN
    RAISE EXCEPTION 'REAL coverage date must fit the configured voting window';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION enforce_witness_coverage_window_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'WitnessCoverageWindow version must increase exactly once';
  END IF;
  IF ROW(
    NEW."id", NEW."tenantId", NEW."operationProfileId",
    NEW."clientRequestId", NEW."captureContext", NEW."puestoId",
    NEW."localDate", NEW."createdById", NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD."id", OLD."tenantId", OLD."operationProfileId",
    OLD."clientRequestId", OLD."captureContext", OLD."puestoId",
    OLD."localDate", OLD."createdById", OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'WitnessCoverageWindow identity is immutable';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "WitnessAssignment" assignment
    WHERE assignment."tenantId" = OLD."tenantId"
      AND assignment."coverageWindowId" = OLD."id"
      AND assignment."status" IN ('PLANNED', 'CONFIRMED')
  ) THEN
    RAISE EXCEPTION 'WitnessCoverageWindow with active assignments is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION prevent_witness_coverage_window_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'WitnessCoverageWindow history is durable and cannot be deleted';
END;
$$;

CREATE FUNCTION prevent_witness_coverage_command_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'WitnessCoverageWindowCommand receipts are append-only';
END;
$$;

CREATE FUNCTION prevent_witness_planning_truncate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Witness planning history is durable and cannot be truncated';
END;
$$;

CREATE FUNCTION validate_witness_assignment_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  profile_stage "PoliticalOperationStage";
  expected_tables INTEGER;
  witness_valid BOOLEAN;
  window_profile_id TEXT;
  window_context "WitnessCaptureContext";
  window_puesto_id TEXT;
  window_starts_at TIMESTAMP(3);
  window_ends_at TIMESTAMP(3);
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('operation-profile-lifecycle:' || NEW."tenantId", 0)
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended('witness-assignment:' || NEW."tenantId", 0)
  );

  SELECT profile."stage"
  INTO profile_stage
  FROM "OperationProfile" profile
  WHERE profile."id" = NEW."operationProfileId"
    AND profile."tenantId" = NEW."tenantId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WitnessAssignment requires a tenant-scoped operation profile';
  END IF;
  IF profile_stage NOT IN (
    'PRE_CAMPAIGN', 'CAMPAIGN', 'ELECTION_PREPARATION',
    'SIMULATION', 'ELECTION_DAY'
  ) THEN
    RAISE EXCEPTION 'WitnessAssignment is not mutable in this operation stage';
  END IF;
  IF NEW."captureContext" = 'SIMULATION'
    AND profile_stage NOT IN ('CAMPAIGN', 'ELECTION_PREPARATION', 'SIMULATION')
  THEN
    RAISE EXCEPTION 'SIMULATION witness assignments are not allowed in this stage';
  END IF;

  SELECT coverage_window."operationProfileId", coverage_window."captureContext",
         coverage_window."puestoId", coverage_window."startsAt", coverage_window."endsAt"
  INTO window_profile_id, window_context, window_puesto_id,
       window_starts_at, window_ends_at
  FROM "WitnessCoverageWindow" coverage_window
  WHERE coverage_window."id" = NEW."coverageWindowId"
    AND coverage_window."tenantId" = NEW."tenantId";

  IF NOT FOUND
    OR window_profile_id <> NEW."operationProfileId"
    OR window_context <> NEW."captureContext"
    OR window_puesto_id <> NEW."puestoId"
  THEN
    RAISE EXCEPTION 'WitnessAssignment window scope does not match profile, context and polling place';
  END IF;
  IF NEW."shiftStartsAt" < window_starts_at
    OR NEW."shiftEndsAt" > window_ends_at
  THEN
    RAISE EXCEPTION 'WitnessAssignment shift must fit its declared coverage window';
  END IF;

  SELECT place."expectedTables"
  INTO expected_tables
  FROM "PoliticalDivision" place
  WHERE place."id" = NEW."puestoId"
    AND place."tenantId" = NEW."tenantId"
    AND place."type" = 'PUESTO'
    AND place."isActive" = true;

  IF NOT FOUND OR expected_tables IS NULL OR expected_tables <= 0 THEN
    RAISE EXCEPTION 'WitnessAssignment requires an active polling place with expected tables';
  END IF;
  IF NEW."tableEnd" > expected_tables THEN
    RAISE EXCEPTION 'WitnessAssignment table range exceeds polling-place capacity';
  END IF;

  IF NEW."status" <> 'CANCELLED' THEN
    SELECT EXISTS (
      SELECT 1
      FROM "User" witness
      WHERE witness."id" = NEW."witnessId"
        AND witness."tenantId" = NEW."tenantId"
        AND witness."role" = 'WITNESS'
        AND witness."isActive" = true
    ) INTO witness_valid;
    IF NOT witness_valid THEN
      RAISE EXCEPTION 'WitnessAssignment requires an active WITNESS in the same tenant';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION enforce_witness_assignment_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" = 'CANCELLED' THEN
    RAISE EXCEPTION 'Cancelled WitnessAssignment rows are immutable';
  END IF;
  IF NOT (
    (OLD."status" = 'PLANNED' AND NEW."status" IN ('CONFIRMED', 'CANCELLED'))
    OR (OLD."status" = 'CONFIRMED' AND NEW."status" = 'CANCELLED')
  ) THEN
    RAISE EXCEPTION 'Invalid WitnessAssignment status transition';
  END IF;
  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'WitnessAssignment version must increase exactly once';
  END IF;
  IF ROW(
    NEW."id", NEW."tenantId", NEW."operationProfileId", NEW."coverageWindowId",
    NEW."clientRequestId", NEW."payloadSha256", NEW."captureContext",
    NEW."puestoId", NEW."tableStart", NEW."tableEnd",
    NEW."shiftStartsAt", NEW."shiftEndsAt", NEW."assignmentType",
    NEW."witnessId", NEW."createdById", NEW."supersedesAssignmentId",
    NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD."id", OLD."tenantId", OLD."operationProfileId", OLD."coverageWindowId",
    OLD."clientRequestId", OLD."payloadSha256", OLD."captureContext",
    OLD."puestoId", OLD."tableStart", OLD."tableEnd",
    OLD."shiftStartsAt", OLD."shiftEndsAt", OLD."assignmentType",
    OLD."witnessId", OLD."createdById", OLD."supersedesAssignmentId",
    OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'WitnessAssignment planning payload is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION prevent_witness_assignment_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'WitnessAssignment history is durable and cannot be deleted';
END;
$$;

CREATE TRIGGER "WitnessAssignment_scope_guard"
  BEFORE INSERT OR UPDATE ON "WitnessAssignment"
  FOR EACH ROW EXECUTE FUNCTION validate_witness_assignment_scope();

CREATE TRIGGER "WitnessAssignment_lifecycle_guard"
  BEFORE UPDATE ON "WitnessAssignment"
  FOR EACH ROW EXECUTE FUNCTION enforce_witness_assignment_lifecycle();

CREATE TRIGGER "WitnessAssignment_delete_guard"
  BEFORE DELETE ON "WitnessAssignment"
  FOR EACH ROW EXECUTE FUNCTION prevent_witness_assignment_delete();

CREATE TRIGGER "WitnessCoverageWindow_scope_guard"
  BEFORE INSERT OR UPDATE ON "WitnessCoverageWindow"
  FOR EACH ROW EXECUTE FUNCTION validate_witness_coverage_window_scope();

CREATE TRIGGER "WitnessCoverageWindow_update_guard"
  BEFORE UPDATE ON "WitnessCoverageWindow"
  FOR EACH ROW EXECUTE FUNCTION enforce_witness_coverage_window_update();

CREATE TRIGGER "WitnessCoverageWindow_delete_guard"
  BEFORE DELETE ON "WitnessCoverageWindow"
  FOR EACH ROW EXECUTE FUNCTION prevent_witness_coverage_window_delete();

CREATE TRIGGER "WitnessCoverageWindowCommand_update_guard"
  BEFORE UPDATE ON "WitnessCoverageWindowCommand"
  FOR EACH ROW EXECUTE FUNCTION prevent_witness_coverage_command_mutation();

CREATE TRIGGER "WitnessCoverageWindowCommand_delete_guard"
  BEFORE DELETE ON "WitnessCoverageWindowCommand"
  FOR EACH ROW EXECUTE FUNCTION prevent_witness_coverage_command_mutation();

CREATE TRIGGER "WitnessAssignment_truncate_guard"
  BEFORE TRUNCATE ON "WitnessAssignment"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_witness_planning_truncate();

CREATE TRIGGER "WitnessCoverageWindow_truncate_guard"
  BEFORE TRUNCATE ON "WitnessCoverageWindow"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_witness_planning_truncate();

CREATE TRIGGER "WitnessCoverageWindowCommand_truncate_guard"
  BEFORE TRUNCATE ON "WitnessCoverageWindowCommand"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_witness_planning_truncate();

COMMIT;
