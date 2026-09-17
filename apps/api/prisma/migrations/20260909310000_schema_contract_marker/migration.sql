-- Bind this application candidate to the exact database contract it expects.
-- The fingerprint expansion deliberately makes pre-marker API images fail their
-- 32-character readiness check after this migration is applied.
BEGIN;

ALTER TABLE "SystemDatabaseIdentity"
ADD COLUMN "schemaVersion" VARCHAR(64);

UPDATE "SystemDatabaseIdentity"
SET
    "fingerprint" = "fingerprint" || "fingerprint",
    "schemaVersion" = '20260909310000_schema_contract_marker'
WHERE "id" = 'primary'
  AND length("fingerprint") = 32
  AND "schemaVersion" IS NULL;

ALTER TABLE "SystemDatabaseIdentity"
ALTER COLUMN "schemaVersion" SET NOT NULL;

ALTER TABLE "SystemDatabaseIdentity"
ADD CONSTRAINT "SystemDatabaseIdentity_fingerprint_format_check"
CHECK ("fingerprint" ~ '^[a-f0-9]{64}$');

ALTER TABLE "SystemDatabaseIdentity"
ADD CONSTRAINT "SystemDatabaseIdentity_schema_version_format_check"
CHECK ("schemaVersion" ~ '^[0-9]{14}_[a-z0-9_]+$');

-- Trigger functions must resolve operational tables inside the configured
-- application schema. Relying on the caller's default search_path works in
-- public but fails (and is unsafe) for the production-style custom schema.
DO $function_search_path$
DECLARE
    function_row RECORD;
    application_schema TEXT := current_schema();
BEGIN
    FOR function_row IN
        SELECT procedure.proname
        FROM pg_proc AS procedure
        JOIN pg_namespace AS namespace
          ON namespace.oid = procedure.pronamespace
        JOIN pg_language AS language
          ON language.oid = procedure.prolang
        WHERE namespace.nspname = application_schema
          AND language.lanname = 'plpgsql'
          AND procedure.pronargs = 0
    LOOP
        EXECUTE format(
            'ALTER FUNCTION %I.%I() SET search_path TO %I, pg_catalog',
            application_schema,
            function_row.proname,
            application_schema
        );
    END LOOP;
END;
$function_search_path$;

COMMIT;
