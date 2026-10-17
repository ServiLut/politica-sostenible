import {
  CommitmentStatus,
  IssueCaseStatus,
  PqrsdDeadlineCalculationStatus,
  PqrsdDossierStatus,
  PqrsdRiskLevel,
  Prisma,
  TaskStatus,
} from '../../prisma/generated/prisma';

/**
 * Each partition fixes the computed overdue/blocked flags. PostgreSQL can then
 * order by the persisted priority and dates before LIMIT. Fetching at most N
 * rows per disjoint partition contains the true top N of their union, without
 * reading a tenant's complete backlog into Node.js.
 */
export function taskRankingPartitions(now: Date): Prisma.TaskWhereInput[] {
  const blocked: Prisma.TaskWhereInput = {
    OR: [{ status: TaskStatus.BLOCKED }, { assigneeId: null }],
  };
  return [
    { dueAt: { lt: now } },
    { OR: [{ dueAt: { gte: now } }, { dueAt: null }] },
  ].flatMap((deadline) => [
    { AND: [deadline, blocked] },
    { AND: [deadline, { NOT: blocked }] },
  ]);
}

export function caseRankingPartitions(now: Date): Prisma.IssueCaseWhereInput[] {
  const blocked: Prisma.IssueCaseWhereInput = {
    OR: [
      {
        status: {
          in: [
            IssueCaseStatus.WAITING_ON_CITIZEN,
            IssueCaseStatus.WAITING_ON_EXTERNAL_ENTITY,
          ],
        },
      },
      { assigneeId: null },
    ],
  };
  return [
    { dueAt: { lt: now } },
    { OR: [{ dueAt: { gte: now } }, { dueAt: null }] },
  ].flatMap((deadline) => [
    { AND: [deadline, blocked] },
    { AND: [deadline, { NOT: blocked }] },
  ]);
}

export function commitmentRankingPartitions(
  now: Date,
): Prisma.CommitmentWhereInput[] {
  return [
    { targetDate: { lt: now } },
    { OR: [{ targetDate: { gte: now } }, { targetDate: null }] },
  ].flatMap((deadline) => [
    { AND: [deadline, { status: CommitmentStatus.AT_RISK }] },
    {
      AND: [
        deadline,
        { status: { not: CommitmentStatus.AT_RISK }, ownerId: null },
      ],
    },
    {
      AND: [
        deadline,
        { status: { not: CommitmentStatus.AT_RISK }, ownerId: { not: null } },
      ],
    },
  ]);
}

/**
 * Prisma cannot order a dossier by fields of its latest deadline. Select only
 * bounded IDs in SQL, then hydrate through the original authorized Prisma scope
 * in the same RepeatableRead snapshot. All values are bound parameters; every
 * table and relationship is constrained to the authenticated tenant.
 */
export function rankedPqrsdIdsSql(
  tenantId: string,
  openStatuses: readonly PqrsdDossierStatus[],
  now: Date,
  limit: number,
): Prisma.Sql {
  // Prisma's DateTime columns are UTC timestamp(3), without a time zone. Bind
  // ISO strings and convert explicitly so pg/client or session time zones do
  // not shift the now / three-day boundaries.
  const nowUtc = Prisma.sql`(${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
  const nearDeadline = Prisma.sql`(${new Date(now.getTime() + 3 * 24 * 60 * 60 * 1_000).toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
  const unblockedWorkflow = [
    PqrsdDossierStatus.CLASSIFIED,
    PqrsdDossierStatus.ASSIGNED,
    PqrsdDossierStatus.IN_PROGRESS,
    PqrsdDossierStatus.DRAFT_RESPONSE,
    PqrsdDossierStatus.REVIEWED,
    PqrsdDossierStatus.DELIVERED,
  ];
  return Prisma.sql`
    SELECT dossier."id"
    FROM "PqrsdDossier" AS dossier
    LEFT JOIN LATERAL (
      SELECT deadline."dueAt", deadline."calculationStatus"
      FROM "PqrsdDeadlineVersion" AS deadline
      WHERE deadline."tenantId" = ${tenantId}
        AND deadline."dossierId" = dossier."id"
      ORDER BY deadline."versionNumber" DESC
      LIMIT 1
    ) AS latest ON true
    LEFT JOIN "User" AS primary_user
      ON primary_user."id" = dossier."currentPrimaryAssigneeId"
      AND primary_user."tenantId" = ${tenantId}
    LEFT JOIN "User" AS backup_user
      ON backup_user."id" = dossier."currentBackupAssigneeId"
      AND backup_user."tenantId" = ${tenantId}
    CROSS JOIN LATERAL (
      SELECT COALESCE(latest."calculationStatus"::text IN (
        ${PqrsdDeadlineCalculationStatus.CALCULATED},
        ${PqrsdDeadlineCalculationStatus.MANUAL_REVIEWED}
      ), false) AS resolved
    ) AS deadline_status
    CROSS JOIN LATERAL (
      SELECT CASE WHEN deadline_status.resolved THEN latest."dueAt" END AS due
    ) AS effective
    WHERE dossier."tenantId" = ${tenantId}
      AND dossier."status"::text IN (${Prisma.join(openStatuses)})
    ORDER BY
      COALESCE(effective.due < ${nowUtc}, false) DESC,
      CASE
        WHEN dossier."riskLevel"::text = ${PqrsdRiskLevel.HIGH}
          OR effective.due < ${nowUtc} THEN 4
        WHEN effective.due <= ${nearDeadline} THEN 3
        ELSE 2
      END DESC,
      (
        NOT deadline_status.resolved
        OR NOT COALESCE(primary_user."isActive", false)
        OR NOT COALESCE(backup_user."isActive", false)
        OR dossier."status"::text NOT IN (${Prisma.join(unblockedWorkflow)})
      ) DESC,
      effective.due ASC NULLS LAST,
      dossier."createdAt" ASC,
      dossier."id" ASC
    LIMIT ${limit}
  `;
}
