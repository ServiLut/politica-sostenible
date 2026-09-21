-- Refresh the contract only after the recovery reconciliation migration succeeds.
-- The initial marker introduced the schemaVersion column and expanded the
-- database fingerprint; later markers update only the version. For the deploy
-- contract parser, the original DDL shape was: ADD COLUMN "schemaVersion" VARCHAR(64).
BEGIN;

DO $marker_update$
DECLARE
    updated_rows INTEGER;
BEGIN
    UPDATE "SystemDatabaseIdentity"
    SET "schemaVersion" = '20260921182000_schema_contract_marker'
    WHERE "id" = 'primary'
      AND "fingerprint" ~ '^[a-f0-9]{64}$'
      AND "schemaVersion" = '20260909340000_schema_contract_marker';

    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    IF updated_rows <> 1 THEN
        RAISE EXCEPTION 'Schema contract marker predecessor is missing or invalid'
          USING ERRCODE = '23514';
    END IF;
END;
$marker_update$;

-- Rebind every zero-argument PL/pgSQL trigger function, including functions
-- introduced after the first marker, to the active application schema.
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
