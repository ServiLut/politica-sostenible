-- Close the contract after the person-import jobs and tenant-column migrations.
-- Preserve every published migration; only advance the current schema marker.
BEGIN;

DO $marker_update$
DECLARE
    updated_rows INTEGER;
BEGIN
    UPDATE "SystemDatabaseIdentity"
    SET "schemaVersion" = '20261016213000_schema_contract_marker'
    WHERE "id" = 'primary'
      AND "fingerprint" ~ '^[a-f0-9]{64}$'
      AND "schemaVersion" = '20260921182000_schema_contract_marker';

    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    IF updated_rows <> 1 THEN
        RAISE EXCEPTION 'Schema contract marker predecessor is missing or invalid'
          USING ERRCODE = '23514';
    END IF;
END;
$marker_update$;

-- Bind only this application's zero-argument PL/pgSQL functions to its schema.
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
