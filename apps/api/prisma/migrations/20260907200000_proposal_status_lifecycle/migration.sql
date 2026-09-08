BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "PoliticalProposal"
    WHERE
      ("status" IN ('DRAFT', 'PROPOSED') AND "progressPercent" <> 0) OR
      ("status" = 'COMPLETED' AND "progressPercent" <> 100)
  ) THEN
    RAISE EXCEPTION 'Existen propuestas legacy con estado y progreso incoherentes; reconcilie la copia restaurada antes de migrar'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

INSERT INTO "AuditEvent" (
  "id",
  "tenantId",
  "mode",
  "actorType",
  "action",
  "resourceType",
  "resourceId",
  "after",
  "metadata"
)
SELECT
  'proposal-lifecycle-baseline-' || proposal."id",
  proposal."tenantId",
  'CAMPAIGN',
  'SYSTEM',
  'PROPOSAL_LIFECYCLE_BASELINED',
  'PoliticalProposal',
  proposal."id",
  jsonb_build_object(
    'referenceCode', proposal."referenceCode",
    'title', proposal."title",
    'description', proposal."description",
    'category', proposal."category"::text,
    'targetGroup', proposal."targetGroup",
    'territory', proposal."territory",
    'estimatedCost', proposal."estimatedCost"::text,
    'sourceUrl', proposal."sourceUrl",
    'status', proposal."status"::text,
    'progressPercent', proposal."progressPercent",
    'ownerId', proposal."ownerId"
  ),
  jsonb_build_object('reason', 'baseline-before-immutable-lifecycle')
FROM "PoliticalProposal" AS proposal;

CREATE FUNCTION "enforce_political_proposal_status_transition"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'DRAFT' OR NEW."progressPercent" <> 0 THEN
      RAISE EXCEPTION 'Toda propuesta debe iniciar como borrador con progreso 0'
        USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
  END IF;

  IF OLD."status" <> 'DRAFT' AND (
    OLD."title" IS DISTINCT FROM NEW."title" OR
    OLD."description" IS DISTINCT FROM NEW."description" OR
    OLD."category" IS DISTINCT FROM NEW."category" OR
    OLD."targetGroup" IS DISTINCT FROM NEW."targetGroup" OR
    OLD."territory" IS DISTINCT FROM NEW."territory" OR
    OLD."estimatedCost" IS DISTINCT FROM NEW."estimatedCost" OR
    OLD."sourceUrl" IS DISTINCT FROM NEW."sourceUrl"
  ) THEN
    RAISE EXCEPTION 'El contenido comprometido de una propuesta publicada es inmutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."status" IN ('COMPLETED', 'WITHDRAWN') AND (
    OLD."ownerId" IS DISTINCT FROM NEW."ownerId" OR
    OLD."progressPercent" IS DISTINCT FROM NEW."progressPercent"
  ) THEN
    RAISE EXCEPTION 'Una propuesta completada o retirada conserva responsable y progreso finales'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."status" = 'COMPLETED' AND NEW."progressPercent" <> 100 THEN
    RAISE EXCEPTION 'Una propuesta completada requiere progreso 100'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."status" IN ('DRAFT', 'PROPOSED') AND NEW."progressPercent" <> 0 THEN
    RAISE EXCEPTION 'Una propuesta en borrador o propuesta requiere progreso 0'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."status" = NEW."status" OR
    (OLD."status" = 'DRAFT' AND NEW."status" IN ('PROPOSED', 'WITHDRAWN')) OR
    (OLD."status" = 'PROPOSED' AND NEW."status" IN ('IN_PROGRESS', 'WITHDRAWN')) OR
    (OLD."status" = 'IN_PROGRESS' AND NEW."status" IN ('COMPLETED', 'WITHDRAWN'))
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Transicion de estado de propuesta no permitida: % -> %', OLD."status", NEW."status"
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "PoliticalProposal_enforce_status_transition"
BEFORE INSERT OR UPDATE ON "PoliticalProposal"
FOR EACH ROW
EXECUTE FUNCTION "enforce_political_proposal_status_transition"();

ALTER TABLE "PoliticalProposal"
ENABLE ALWAYS TRIGGER "PoliticalProposal_enforce_status_transition";

COMMIT;
