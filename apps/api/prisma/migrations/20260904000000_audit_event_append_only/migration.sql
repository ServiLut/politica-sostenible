-- AuditEvent is an append-only security ledger. Enforce immutability in PostgreSQL
-- so direct SQL, maintenance scripts and ORM calls cannot rewrite its history.
CREATE FUNCTION "prevent_audit_event_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = format(
      'AuditEvent es append-only: la operación %s está prohibida; registre un nuevo evento compensatorio',
      TG_OP
    );
END;
$$;

CREATE TRIGGER "AuditEvent_prevent_update_delete"
BEFORE UPDATE OR DELETE ON "AuditEvent"
FOR EACH ROW
EXECUTE FUNCTION "prevent_audit_event_mutation"();

CREATE TRIGGER "AuditEvent_prevent_truncate"
BEFORE TRUNCATE ON "AuditEvent"
FOR EACH STATEMENT
EXECUTE FUNCTION "prevent_audit_event_mutation"();

-- Keep the protection active during replication-style sessions as well.
ALTER TABLE "AuditEvent"
ENABLE ALWAYS TRIGGER "AuditEvent_prevent_update_delete";

ALTER TABLE "AuditEvent"
ENABLE ALWAYS TRIGGER "AuditEvent_prevent_truncate";
