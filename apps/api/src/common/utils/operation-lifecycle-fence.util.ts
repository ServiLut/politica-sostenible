import { ConflictException } from '@nestjs/common';
import {
  PoliticalOperationMode,
  PoliticalOperationStage,
  Prisma,
} from '../../../prisma/generated/prisma';

export const OPERATION_LIFECYCLE_LOCK_PREFIX =
  'operation-profile-lifecycle' as const;

type OperationLifecycleTransaction = Pick<
  Prisma.TransactionClient,
  '$queryRaw'
>;

type LockedOperationProfile = Readonly<{
  stage: PoliticalOperationStage;
}>;

async function lockOperationLifecycle(
  transaction: OperationLifecycleTransaction,
  tenantId: string,
): Promise<void> {
  // PostgreSQL exposes advisory-lock functions as `void`. Projecting a
  // boolean through a materialized CTE keeps Prisma driver adapters from
  // attempting to deserialize that unsupported pseudo-type while guaranteeing
  // the volatile lock call is executed.
  await transaction.$queryRaw<Array<{ locked: boolean }>>(
    Prisma.sql`
      WITH lifecycle_lock AS MATERIALIZED (
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`${OPERATION_LIFECYCLE_LOCK_PREFIX}:${tenantId}`}, 0)
        )
      )
      SELECT TRUE AS "locked" FROM lifecycle_lock
    `,
  );
}

/**
 * Serializes a durable lifecycle snapshot with stage mutations while allowing
 * the snapshot itself in CLOSED. Callers must re-read and validate the profile
 * after acquiring this lock; unlike mutation fences this function deliberately
 * does not reject the terminal stage.
 */
export async function lockOperationLifecycleSnapshot(
  transaction: OperationLifecycleTransaction,
  tenantId: string,
): Promise<void> {
  await lockOperationLifecycle(transaction, tenantId);
}

async function assertLockedOperationOpen(
  transaction: OperationLifecycleTransaction,
  tenantId: string,
): Promise<PoliticalOperationStage | null> {
  const profiles = await transaction.$queryRaw<LockedOperationProfile[]>(
    Prisma.sql`
      SELECT "stage"
      FROM "OperationProfile"
      WHERE "tenantId" = ${tenantId}
      FOR SHARE
    `,
  );
  const stage = profiles[0]?.stage ?? null;

  if (stage === PoliticalOperationStage.CLOSED) {
    throw new OperationClosedForMutationException();
  }

  return stage;
}

export class OperationClosedForMutationException extends ConflictException {
  constructor() {
    super({
      code: 'OPERATION_CLOSED',
      message:
        'La operacion esta cerrada y conserva sus registros operativos en modo de solo lectura',
      currentStage: PoliticalOperationStage.CLOSED,
    });
  }
}

/**
 * Serializes every campaign mutation with both normal and exceptional closure.
 *
 * This must be the first database operation inside the mutation transaction.
 * The advisory lock also covers tenants whose OperationProfile has not been
 * created yet; the row lock makes the stage decision stable until commit once
 * a profile exists.
 */
export async function lockAndAssertOperationOpen(
  transaction: OperationLifecycleTransaction,
  tenantId: string,
): Promise<PoliticalOperationStage | null> {
  await lockOperationLifecycle(transaction, tenantId);
  return assertLockedOperationOpen(transaction, tenantId);
}

/** PUBLIC_OFFICE has its own institutional lifecycle and must not inherit the
 * campaign OperationProfile boundary. Calling this as the first transaction
 * step keeps mixed-mode services explicit without creating a fake profile. */
export async function lockAndAssertCampaignOperationOpen(
  transaction: OperationLifecycleTransaction,
  tenantId: string,
  mode: PoliticalOperationMode,
): Promise<PoliticalOperationStage | null> {
  // Even PUBLIC_OFFICE transactions take the same tenant key first. They do
  // not inherit campaign closure semantics, but this keeps mode changes and a
  // campaign close totally ordered without consulting a stale profile.
  await lockOperationLifecycle(transaction, tenantId);
  if (mode === PoliticalOperationMode.PUBLIC_OFFICE) {
    return null;
  }
  return assertLockedOperationOpen(transaction, tenantId);
}
