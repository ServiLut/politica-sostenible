import {
  DivisionType,
  ElectoralCodeNamespace,
  OperationClosureType,
  OperationTerminationCause,
  PoliticalOperationStage,
  Role,
  WitnessReportStatus,
} from '../../prisma/generated/prisma';
import type { FinanceComplianceReadiness } from '../finance/finance-compliance';
import {
  FINANCE_CLOSEOUT_READINESS_BLOCKER,
  type FinanceCloseoutReadiness,
  type FinanceCloseoutReadinessBlockerCode,
} from '../finance/finance-closeout-readiness';
import type {
  OperationReadinessCheckDto,
  OperationReadinessCheckStatus,
  OperationReadinessResponseDto,
} from './dto/operation-readiness.dto';
import {
  isWithinElectionOperatingWindow,
  toBogotaDateKey,
  toStoredDateOnlyKey,
} from './election-operating-window';
import {
  buildExactWitnessCoverage,
  type ExactWitnessCoverage,
} from '../witness/witness-assignment-coverage';

export {
  toBogotaDateKey,
  toStoredDateOnlyKey,
} from './election-operating-window';

export const OPERATION_PROFILE_READ_ROLES: readonly Role[] =
  Object.values(Role);

const POST_ELECTION_STAGES = new Set<PoliticalOperationStage>([
  PoliticalOperationStage.POST_ELECTION,
  PoliticalOperationStage.CLOSED,
]);

const PRE_ELECTION_DAY_STAGES = new Set<PoliticalOperationStage>([
  PoliticalOperationStage.EXPLORATION,
  PoliticalOperationStage.PRE_CAMPAIGN,
  PoliticalOperationStage.SIGNATURE_COLLECTION,
  PoliticalOperationStage.CAMPAIGN,
  PoliticalOperationStage.ELECTION_PREPARATION,
  PoliticalOperationStage.SIMULATION,
]);

export const ELECTION_DAY_READINESS_BLOCKER = {
  ELECTION_DAY_OUTSIDE_VOTING_WINDOW_BOGOTA:
    'ELECTION_DAY_OUTSIDE_VOTING_WINDOW_BOGOTA',
  NO_POLLING_PLACES: 'NO_POLLING_PLACES',
  POLLING_PLACES_WITHOUT_EXPECTED_TABLES:
    'POLLING_PLACES_WITHOUT_EXPECTED_TABLES',
  POLLING_PLACES_WITHOUT_COVERAGE_WINDOWS:
    'POLLING_PLACES_WITHOUT_COVERAGE_WINDOWS',
  WITNESS_PRIMARY_TABLE_COVERAGE_INCOMPLETE:
    'WITNESS_PRIMARY_TABLE_COVERAGE_INCOMPLETE',
  WITNESS_BACKUP_TABLE_COVERAGE_INCOMPLETE:
    'WITNESS_BACKUP_TABLE_COVERAGE_INCOMPLETE',
  ELECTORAL_CATALOG_PROJECTION_NOT_READY:
    'ELECTORAL_CATALOG_PROJECTION_NOT_READY',
} as const;

export type ElectionDayReadinessBlocker =
  (typeof ELECTION_DAY_READINESS_BLOCKER)[keyof typeof ELECTION_DAY_READINESS_BLOCKER];

export const CLOSURE_READINESS_BLOCKER = {
  ...FINANCE_CLOSEOUT_READINESS_BLOCKER,
  PENDING_E14_REPORTS: 'PENDING_E14_REPORTS',
  DIVERGENT_E14_TABLES: 'DIVERGENT_E14_TABLES',
  OPEN_URGENT_CASES: 'OPEN_URGENT_CASES',
  OPEN_URGENT_TASKS: 'OPEN_URGENT_TASKS',
  SCRUTINY_NOT_CONFIGURED: 'SCRUTINY_NOT_CONFIGURED',
  SCRUTINY_COMMISSION_NOT_CLOSED: 'SCRUTINY_COMMISSION_NOT_CLOSED',
  SCRUTINY_APPLICABILITY_UNDECIDED: 'SCRUTINY_APPLICABILITY_UNDECIDED',
  SCRUTINY_REQUIRED_DOCUMENTS_MISSING: 'SCRUTINY_REQUIRED_DOCUMENTS_MISSING',
  SCRUTINY_REQUIRED_DOCUMENT_CUSTODY_MISSING:
    'SCRUTINY_REQUIRED_DOCUMENT_CUSTODY_MISSING',
  SCRUTINY_DISCREPANCIES_OPEN: 'SCRUTINY_DISCREPANCIES_OPEN',
  SCRUTINY_ACTIONS_OPEN: 'SCRUTINY_ACTIONS_OPEN',
  SCRUTINY_DECISIONS_PENDING_REVIEW: 'SCRUTINY_DECISIONS_PENDING_REVIEW',
  SCRUTINY_OFFICIAL_DECLARATION_MISSING:
    'SCRUTINY_OFFICIAL_DECLARATION_MISSING',
} as const;

export type ClosureReadinessBlocker =
  (typeof CLOSURE_READINESS_BLOCKER)[keyof typeof CLOSURE_READINESS_BLOCKER];

export interface ReadinessDivision {
  id: string;
  code?: string;
  name?: string;
  parentId: string | null;
  type: DivisionType;
  expectedTables: number | null;
  sourceNamespace: ElectoralCodeNamespace | null;
  sourceReleaseId: string | null;
}

export interface ReadinessWitnessAssignment {
  coverageWindowId: string;
  puestoId: string;
  tableStart: number;
  tableEnd: number;
  shiftStartsAt: Date;
  shiftEndsAt: Date;
  assignmentType: 'PRIMARY' | 'BACKUP';
  status: 'PLANNED' | 'CONFIRMED' | 'CANCELLED';
  witnessEligible: boolean;
}

export interface ReadinessWitnessCoverageWindow {
  id: string;
  puestoId: string;
  localDate: Date;
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
  utcOffsetMinutes: number;
}

export interface E14ReadinessFingerprint {
  puestoId: string;
  mesa: number;
  candidateVotes: number;
  blankVotes: number | null;
  nullVotes: number | null;
  unmarkedVotes: number | null;
  totalTableVotes: number;
  status: WitnessReportStatus;
}

export interface OperationReadinessFacts {
  profile: {
    stage: PoliticalOperationStage;
    electionDate: Date;
    votingStartDate: Date;
    votingEndDate: Date;
    votingWindowSourceUrl: string | null;
    votingWindowReference: string | null;
    closureType: OperationClosureType | null;
    terminatedAt: Date | null;
    terminationCause: OperationTerminationCause | null;
  } | null;
  activeConsentNoticeCount: number;
  financeCompliance: FinanceComplianceReadiness;
  financeReportDeadline: Date | null;
  activeNonAdminTeamCount: number;
  activeElectoralCatalogReleaseIds: string[];
  divisions: ReadinessDivision[];
  witnessCoverageWindows: ReadinessWitnessCoverageWindow[];
  witnessAssignments: ReadinessWitnessAssignment[];
  e14PendingCount: number;
  e14RejectedCount: number;
  e14DivergentTableCount: number;
  openCaseCount: number;
  openTaskCount: number;
  overdueTaskCount: number;
  pendingCommunicationCount: number;
  pendingFinanceCount: number;
  unreportedFinanceCount: number;
  hasOperationalActivity: boolean;
  lifecycleCreatedAuditCount: number;
  lifecycleAdoptionAuditCount: number;
  financeCloseoutReadiness?: FinanceCloseoutReadiness | null;
}

export interface ClosureReadinessFacts {
  financeComplianceReady: boolean;
  financeReportDeadline: Date | null;
  unreportedFinanceCount: number;
  e14PendingCount: number;
  e14DivergentTableCount: number;
  openUrgentCaseCount: number;
  openUrgentTaskCount: number;
  scrutinyCommissionCount?: number;
  scrutinyOpenCommissionCount?: number;
  scrutinyPendingApplicabilityCount?: number;
  scrutinyRequiredDocumentMissingCount?: number;
  scrutinyRequiredCustodyMissingCount?: number;
  scrutinyOpenDiscrepancyCount?: number;
  scrutinyOpenActionCount?: number;
  scrutinyPendingDecisionReviewCount?: number;
  scrutinyOfficialDeclarationRequired?: boolean;
  scrutinyOfficialDeclarationCount?: number;
  financeCloseoutBlockerCodes?: FinanceCloseoutReadinessBlockerCode[];
}

function check(
  code: string,
  label: string,
  status: OperationReadinessCheckStatus,
  detail: string,
  href: string,
): OperationReadinessCheckDto {
  return { code, label, status, detail, href };
}

function plural(count: number, singular: string, pluralValue: string): string {
  return count === 1 ? singular : pluralValue;
}

function sumChecks(
  sections: OperationReadinessResponseDto['sections'],
): OperationReadinessCheckDto[] {
  return [
    ...sections.BEFORE_CAMPAIGN,
    ...sections.CAMPAIGN,
    ...sections.ELECTION_DAY,
    ...sections.POST_ELECTION,
  ];
}

export function getWitnessCoverage(
  divisions: ReadinessDivision[],
  witnessCoverageWindows: ReadinessWitnessCoverageWindow[],
  witnessAssignments: ReadinessWitnessAssignment[],
): ExactWitnessCoverage {
  return buildExactWitnessCoverage(
    divisions
      .filter(({ type }) => type === DivisionType.PUESTO)
      .map(({ id, code, name, expectedTables }) => ({
        id,
        code: code ?? id,
        name: name ?? id,
        expectedTables,
      })),
    witnessCoverageWindows,
    witnessAssignments,
  );
}

export function getElectionDayReadinessBlockers(
  divisions: ReadinessDivision[],
  witnessCoverageWindows: ReadinessWitnessCoverageWindow[],
  witnessAssignments: ReadinessWitnessAssignment[],
  votingStartDate: Date,
  votingEndDate: Date,
  evaluatedAt: Date,
  electoralProjectionReady: boolean,
): ElectionDayReadinessBlocker[] {
  const coverage = getWitnessCoverage(
    divisions,
    witnessCoverageWindows,
    witnessAssignments,
  );
  const blockers: ElectionDayReadinessBlocker[] = [];

  if (
    !isWithinElectionOperatingWindow(
      evaluatedAt,
      votingStartDate,
      votingEndDate,
    )
  ) {
    blockers.push(
      ELECTION_DAY_READINESS_BLOCKER.ELECTION_DAY_OUTSIDE_VOTING_WINDOW_BOGOTA,
    );
  }
  if (coverage.expectedPollingPlaces === 0) {
    blockers.push(ELECTION_DAY_READINESS_BLOCKER.NO_POLLING_PLACES);
  }
  if (coverage.placesWithoutExpectedTables > 0) {
    blockers.push(
      ELECTION_DAY_READINESS_BLOCKER.POLLING_PLACES_WITHOUT_EXPECTED_TABLES,
    );
  }
  if (coverage.placesWithoutCoverageWindows > 0) {
    blockers.push(
      ELECTION_DAY_READINESS_BLOCKER.POLLING_PLACES_WITHOUT_COVERAGE_WINDOWS,
    );
  }
  if (coverage.expectedTables > 0 && coverage.missingPrimaryTables > 0) {
    blockers.push(
      ELECTION_DAY_READINESS_BLOCKER.WITNESS_PRIMARY_TABLE_COVERAGE_INCOMPLETE,
    );
  }
  if (coverage.expectedTables > 0 && coverage.missingBackupTables > 0) {
    blockers.push(
      ELECTION_DAY_READINESS_BLOCKER.WITNESS_BACKUP_TABLE_COVERAGE_INCOMPLETE,
    );
  }
  if (!electoralProjectionReady) {
    blockers.push(
      ELECTION_DAY_READINESS_BLOCKER.ELECTORAL_CATALOG_PROJECTION_NOT_READY,
    );
  }

  return blockers;
}

export function hasExactActiveElectoralProjection(
  divisions: ReadinessDivision[],
  activeReleaseIds: readonly string[],
): boolean {
  if (activeReleaseIds.length !== 1 || divisions.length === 0) return false;
  const [activeReleaseId] = activeReleaseIds;
  return divisions.every(
    (division) =>
      division.sourceNamespace === ElectoralCodeNamespace.RNEC_DIVIPOLE &&
      division.sourceReleaseId === activeReleaseId,
  );
}

export function getClosureReadinessBlockers(
  facts: ClosureReadinessFacts,
  evaluatedAt: Date,
): ClosureReadinessBlocker[] {
  const blockers: ClosureReadinessBlocker[] = [];

  if (facts.financeCloseoutBlockerCodes) {
    blockers.push(...facts.financeCloseoutBlockerCodes);
  } else {
    if (!facts.financeComplianceReady) {
      blockers.push(CLOSURE_READINESS_BLOCKER.FINANCE_COMPLIANCE_NOT_READY);
    }
    if (facts.unreportedFinanceCount > 0) {
      blockers.push(CLOSURE_READINESS_BLOCKER.UNREPORTED_FINANCIAL_ENTRIES);
    }
    if (!facts.financeReportDeadline) {
      blockers.push(
        CLOSURE_READINESS_BLOCKER.POST_ELECTION_REPORT_DEADLINE_NOT_CONFIGURED,
      );
    } else if (
      facts.unreportedFinanceCount > 0 &&
      toStoredDateOnlyKey(facts.financeReportDeadline) <
        toBogotaDateKey(evaluatedAt)
    ) {
      blockers.push(CLOSURE_READINESS_BLOCKER.POST_ELECTION_REPORT_OVERDUE);
    }
  }
  if (facts.e14PendingCount > 0) {
    blockers.push(CLOSURE_READINESS_BLOCKER.PENDING_E14_REPORTS);
  }
  if (facts.e14DivergentTableCount > 0) {
    blockers.push(CLOSURE_READINESS_BLOCKER.DIVERGENT_E14_TABLES);
  }
  if (facts.openUrgentCaseCount > 0) {
    blockers.push(CLOSURE_READINESS_BLOCKER.OPEN_URGENT_CASES);
  }
  if (facts.openUrgentTaskCount > 0) {
    blockers.push(CLOSURE_READINESS_BLOCKER.OPEN_URGENT_TASKS);
  }
  if (facts.scrutinyCommissionCount === 0) {
    blockers.push(CLOSURE_READINESS_BLOCKER.SCRUTINY_NOT_CONFIGURED);
  }
  if ((facts.scrutinyOpenCommissionCount ?? 0) > 0) {
    blockers.push(CLOSURE_READINESS_BLOCKER.SCRUTINY_COMMISSION_NOT_CLOSED);
  }
  if ((facts.scrutinyPendingApplicabilityCount ?? 0) > 0) {
    blockers.push(CLOSURE_READINESS_BLOCKER.SCRUTINY_APPLICABILITY_UNDECIDED);
  }
  if ((facts.scrutinyRequiredDocumentMissingCount ?? 0) > 0) {
    blockers.push(
      CLOSURE_READINESS_BLOCKER.SCRUTINY_REQUIRED_DOCUMENTS_MISSING,
    );
  }
  if ((facts.scrutinyRequiredCustodyMissingCount ?? 0) > 0) {
    blockers.push(
      CLOSURE_READINESS_BLOCKER.SCRUTINY_REQUIRED_DOCUMENT_CUSTODY_MISSING,
    );
  }
  if ((facts.scrutinyOpenDiscrepancyCount ?? 0) > 0) {
    blockers.push(CLOSURE_READINESS_BLOCKER.SCRUTINY_DISCREPANCIES_OPEN);
  }
  if ((facts.scrutinyOpenActionCount ?? 0) > 0) {
    blockers.push(CLOSURE_READINESS_BLOCKER.SCRUTINY_ACTIONS_OPEN);
  }
  if ((facts.scrutinyPendingDecisionReviewCount ?? 0) > 0) {
    blockers.push(CLOSURE_READINESS_BLOCKER.SCRUTINY_DECISIONS_PENDING_REVIEW);
  }
  if (
    facts.scrutinyOfficialDeclarationRequired &&
    (facts.scrutinyOfficialDeclarationCount ?? 0) === 0
  ) {
    blockers.push(
      CLOSURE_READINESS_BLOCKER.SCRUTINY_OFFICIAL_DECLARATION_MISSING,
    );
  }

  return blockers;
}

function e14VoteFingerprint(report: E14ReadinessFingerprint): string {
  return [
    report.candidateVotes,
    report.blankVotes ?? 'legacy',
    report.nullVotes ?? 'legacy',
    report.unmarkedVotes ?? 'legacy',
    report.totalTableVotes,
  ].join(':');
}

export function countDivergentE14Tables(
  reports: E14ReadinessFingerprint[],
): number {
  const tables = new Map<
    string,
    { hasPending: boolean; fingerprints: Set<string> }
  >();

  for (const report of reports) {
    const key = `${report.puestoId}:${report.mesa}`;
    const table = tables.get(key) ?? {
      hasPending: false,
      fingerprints: new Set<string>(),
    };
    table.hasPending ||= report.status === WitnessReportStatus.PENDING;
    table.fingerprints.add(e14VoteFingerprint(report));
    tables.set(key, table);
  }

  return [...tables.values()].filter(
    ({ hasPending, fingerprints }) => hasPending && fingerprints.size > 1,
  ).length;
}

function lifecycleCheck(
  facts: OperationReadinessFacts,
): OperationReadinessCheckDto {
  const href = '/dashboard/operation-profile';
  if (!facts.profile && facts.hasOperationalActivity) {
    return check(
      'LIFECYCLE_HISTORY_NOT_ESTABLISHED',
      'Historial del ciclo',
      'WARN',
      'Hay actividad operativa pero no existe un perfil que establezca desde que etapa se adopto la plataforma. La etapa no se infiere ni se reconstruye automaticamente.',
      href,
    );
  }
  if (facts.profile && facts.lifecycleAdoptionAuditCount > 0) {
    return check(
      'LIFECYCLE_HISTORY_NOT_ESTABLISHED',
      'Historial del ciclo',
      'WARN',
      'La operacion fue adoptada con el ciclo ya iniciado; el historial anterior a esa adopcion permanece expresamente sin establecer.',
      href,
    );
  }
  if (facts.profile && facts.lifecycleCreatedAuditCount === 0) {
    return check(
      'LIFECYCLE_HISTORY_NOT_ESTABLISHED',
      'Historial del ciclo',
      'WARN',
      'El perfil existe, pero no se encontro el evento de auditoria que establece el inicio de su historial en la plataforma.',
      href,
    );
  }
  return check(
    'LIFECYCLE_HISTORY_NOT_ESTABLISHED',
    'Historial del ciclo',
    'PASS',
    facts.profile
      ? 'El inicio del perfil cuenta con trazabilidad en la plataforma.'
      : 'No hay actividad operativa registrada que obligue a conciliar un ciclo previo.',
    href,
  );
}

function electionDateCheck(
  profile: OperationReadinessFacts['profile'],
  generatedAt: Date,
): OperationReadinessCheckDto {
  const href = '/dashboard/operation-profile';
  if (!profile) {
    return check(
      'ELECTION_DATE',
      'Fecha electoral',
      'BLOCK',
      'Falta el perfil que define la fecha electoral.',
      href,
    );
  }

  const today = toBogotaDateKey(generatedAt);
  const electionDay = toStoredDateOnlyKey(profile.electionDate);
  const votingStart = toStoredDateOnlyKey(profile.votingStartDate);
  const votingEnd = toStoredDateOnlyKey(profile.votingEndDate);
  const multiday = votingStart !== votingEnd;
  const sourceReady = Boolean(
    profile.votingWindowSourceUrl && profile.votingWindowReference,
  );
  if (multiday && !sourceReady) {
    return check(
      'ELECTION_OPERATING_WINDOW',
      'Ventana operativa electoral',
      'BLOCK',
      'La ventana de varios dias no tiene fuente HTTPS y referencia documental completas.',
      href,
    );
  }
  if (PRE_ELECTION_DAY_STAGES.has(profile.stage) && votingStart <= today) {
    return check(
      'ELECTION_OPERATING_WINDOW',
      'Ventana operativa electoral',
      'BLOCK',
      today <= votingEnd
        ? 'En Bogota la ventana electoral ya esta activa, pero la operacion aun no esta en Dia D.'
        : 'En Bogota la ventana electoral ya termino y la operacion sigue en una etapa anterior a Dia D.',
      href,
    );
  }
  if (
    profile.stage === PoliticalOperationStage.ELECTION_DAY &&
    (today < votingStart || today > votingEnd)
  ) {
    return check(
      'ELECTION_OPERATING_WINDOW',
      'Ventana operativa electoral',
      'BLOCK',
      today > votingEnd
        ? 'La operacion permanece en Dia D despues de terminar la ventana electoral de Bogota.'
        : 'La operacion esta en Dia D antes de iniciar la ventana electoral de Bogota.',
      href,
    );
  }
  if (POST_ELECTION_STAGES.has(profile.stage) && votingStart > today) {
    return check(
      'ELECTION_OPERATING_WINDOW',
      'Ventana operativa electoral',
      'BLOCK',
      'La operacion figura en poseleccion aunque la ventana electoral de Bogota aun no ha iniciado.',
      href,
    );
  }

  return check(
    'ELECTION_OPERATING_WINDOW',
    'Ventana operativa electoral',
    'PASS',
    `La fecha principal ${electionDay} y la ventana inclusiva ${votingStart} a ${votingEnd} son coherentes con la etapa al ${today} en Bogota.${multiday ? ' La plataforma conserva la referencia declarada sin certificar su oficialidad.' : ''}`,
    href,
  );
}

function postElectionFinanceCheck(
  facts: OperationReadinessFacts,
  generatedAt: Date,
): OperationReadinessCheckDto {
  const href = '/dashboard/finance';
  if (facts.financeCloseoutReadiness) {
    const financeReadiness = facts.financeCloseoutReadiness;
    if (financeReadiness.readyForCloseout) {
      return check(
        'POST_ELECTION_FINANCE_OBLIGATIONS',
        'Obligaciones financieras poselectorales',
        'PASS',
        'El expediente financiero comparte el mismo alistamiento verificado por la puerta de cierre ordinario.',
        href,
      );
    }
    const stageRequiresClosure = Boolean(
      facts.profile && POST_ELECTION_STAGES.has(facts.profile.stage),
    );
    return check(
      'POST_ELECTION_FINANCE_OBLIGATIONS',
      'Obligaciones financieras poselectorales',
      stageRequiresClosure ? 'BLOCK' : 'WARN',
      `El cierre financiero tiene bloqueos verificables: ${financeReadiness.blockers
        .map(({ code }) => code)
        .join(', ')}.`,
      href,
    );
  }
  if (facts.unreportedFinanceCount === 0) {
    return check(
      'POST_ELECTION_FINANCE_OBLIGATIONS',
      'Obligaciones financieras poselectorales',
      'PASS',
      'No hay movimientos financieros pendientes de marcar como reportados.',
      href,
    );
  }

  const stageRequiresClosure = Boolean(
    facts.profile && POST_ELECTION_STAGES.has(facts.profile.stage),
  );
  const deadlinePassed = Boolean(
    facts.financeReportDeadline &&
    toStoredDateOnlyKey(facts.financeReportDeadline) <
      toBogotaDateKey(generatedAt),
  );
  const status: OperationReadinessCheckStatus =
    stageRequiresClosure || deadlinePassed ? 'BLOCK' : 'WARN';
  const entryWord = plural(
    facts.unreportedFinanceCount,
    'movimiento',
    'movimientos',
  );

  return check(
    'POST_ELECTION_FINANCE_OBLIGATIONS',
    'Obligaciones financieras poselectorales',
    status,
    `${facts.unreportedFinanceCount} ${entryWord} ${plural(
      facts.unreportedFinanceCount,
      'no esta',
      'no estan',
    )} marcado${facts.unreportedFinanceCount === 1 ? '' : 's'} como reportado${
      facts.unreportedFinanceCount === 1 ? '' : 's'
    }.`,
    href,
  );
}

function postElectionCloseoutCheck(
  facts: OperationReadinessFacts,
): OperationReadinessCheckDto {
  const openItems =
    facts.openCaseCount +
    facts.openTaskCount +
    facts.pendingCommunicationCount +
    facts.pendingFinanceCount +
    facts.e14PendingCount +
    facts.e14RejectedCount +
    facts.e14DivergentTableCount;
  if (openItems === 0) {
    return check(
      'POST_ELECTION_OPERATIONAL_CLOSEOUT',
      'Cierre operativo poselectoral',
      'PASS',
      'No quedan asuntos operativos abiertos en los modulos verificables.',
      '/dashboard/executive',
    );
  }

  const status: OperationReadinessCheckStatus =
    facts.profile && POST_ELECTION_STAGES.has(facts.profile.stage)
      ? 'BLOCK'
      : 'WARN';
  return check(
    'POST_ELECTION_OPERATIONAL_CLOSEOUT',
    'Cierre operativo poselectoral',
    status,
    `${openItems} ${plural(openItems, 'asunto verificable sigue', 'asuntos verificables siguen')} abierto${
      openItems === 1 ? '' : 's'
    }; el sistema no presume su cierre.`,
    '/dashboard/executive',
  );
}

function exceptionalTerminationCheck(
  facts: OperationReadinessFacts,
): OperationReadinessCheckDto | null {
  if (facts.profile?.closureType !== OperationClosureType.CLOSED_EXCEPTIONAL) {
    return null;
  }
  return check(
    'EXCEPTIONAL_TERMINATION_SURVIVING_DUTIES',
    'Cierre excepcional y obligaciones supervivientes',
    'WARN',
    'La operacion termino por una causal excepcional. Este estado no acredita cumplimiento, radicacion ante autoridad ni extincion de obligaciones financieras, documentales o de proteccion de datos.',
    '/dashboard/operation-profile',
  );
}

function electoralProjectionCheck(
  facts: OperationReadinessFacts,
  absentStatus: OperationReadinessCheckStatus,
): OperationReadinessCheckDto {
  const releaseCount = facts.activeElectoralCatalogReleaseIds.length;
  const exactProjection = hasExactActiveElectoralProjection(
    facts.divisions,
    facts.activeElectoralCatalogReleaseIds,
  );

  if (exactProjection) {
    return check(
      'ELECTORAL_CATALOG_PROVENANCE',
      'Trazabilidad del catalogo electoral',
      'PASS',
      'Toda la geografia operativa vigente proviene del unico release electoral RNEC activo.',
      '/dashboard/territory',
    );
  }

  if (releaseCount === 0) {
    return check(
      'ELECTORAL_CATALOG_PROVENANCE',
      'Trazabilidad del catalogo electoral',
      absentStatus,
      'No hay un release electoral RNEC activo; la geografia vigente no puede certificarse como DIVIPOLE para esta eleccion.',
      '/dashboard/territory',
    );
  }

  return check(
    'ELECTORAL_CATALOG_PROVENANCE',
    'Trazabilidad del catalogo electoral',
    'BLOCK',
    releaseCount === 1
      ? 'Existe un release RNEC activo, pero hay divisiones vigentes ausentes de su proyeccion o enlazadas a otra procedencia.'
      : `Hay ${releaseCount} releases RNEC activos; la proyeccion electoral debe ser unica por organizacion.`,
    '/dashboard/territory',
  );
}

export function buildOperationReadiness(
  facts: OperationReadinessFacts,
  generatedAt: Date,
): OperationReadinessResponseDto {
  const coverage = getWitnessCoverage(
    facts.divisions,
    facts.witnessCoverageWindows,
    facts.witnessAssignments,
  );
  const departments = facts.divisions.filter(
    ({ type }) => type === DivisionType.DEPARTAMENTO,
  ).length;
  const municipalities = facts.divisions.filter(
    ({ type }) => type === DivisionType.MUNICIPIO,
  ).length;
  const zones = facts.divisions.filter(
    ({ type }) => type === DivisionType.ZONA,
  ).length;
  const missingComplianceFields = facts.financeCompliance.missingFields.length;
  const invalidComplianceFields = facts.financeCompliance.invalidFields.length;
  const exceptionalTermination = exceptionalTerminationCheck(facts);
  const scheduledWitnessTables =
    coverage.scheduledPrimaryTables + coverage.scheduledBackupTables;
  const scheduledPollingPlaces = coverage.places.filter(
    ({ primary, backup }) =>
      primary.scheduledTables > 0 || backup.scheduledTables > 0,
  ).length;

  const sections: OperationReadinessResponseDto['sections'] = {
    BEFORE_CAMPAIGN: [
      check(
        'PROFILE_CONFIGURED',
        'Perfil de la operacion',
        facts.profile ? 'PASS' : 'BLOCK',
        facts.profile
          ? 'El perfil operativo esta configurado para esta organizacion.'
          : 'Falta configurar el perfil operativo de esta organizacion.',
        '/dashboard/operation-profile',
      ),
      lifecycleCheck(facts),
      check(
        'ACTIVE_CONSENT_NOTICE',
        'Aviso de consentimiento activo',
        facts.activeConsentNoticeCount === 1 ? 'PASS' : 'BLOCK',
        facts.activeConsentNoticeCount === 1
          ? 'Existe un aviso activo para comunicaciones politicas.'
          : facts.activeConsentNoticeCount === 0
            ? 'No existe un aviso activo para comunicaciones politicas.'
            : `Hay ${facts.activeConsentNoticeCount} avisos activos para comunicaciones politicas; debe existir uno solo para evitar ambiguedad.`,
        '/dashboard/settings',
      ),
      check(
        'FINANCE_COMPLIANCE_CONFIGURED',
        'Configuracion financiera y de cumplimiento',
        facts.financeCompliance.ready ? 'PASS' : 'BLOCK',
        facts.financeCompliance.ready
          ? 'El expediente financiero tiene completos sus campos obligatorios y validaciones.'
          : `El expediente financiero tiene ${missingComplianceFields} campos faltantes y ${invalidComplianceFields} validaciones incumplidas.`,
        '/dashboard/finance',
      ),
      check(
        'ACTIVE_NON_ADMIN_TEAM',
        'Equipo operativo activo',
        facts.activeNonAdminTeamCount > 0 ? 'PASS' : 'BLOCK',
        facts.activeNonAdminTeamCount > 0
          ? `${facts.activeNonAdminTeamCount} integrantes activos distintos de administracion.`
          : 'No hay integrantes activos distintos de administracion.',
        '/dashboard/team',
      ),
      check(
        'ADMINISTRATIVE_GEOGRAPHY',
        'Geografia administrativa',
        departments > 0 && municipalities > 0 ? 'PASS' : 'BLOCK',
        departments > 0 && municipalities > 0
          ? `Hay ${departments} departamentos y ${municipalities} municipios configurados.`
          : `Faltan niveles administrativos: departamentos ${departments}, municipios ${municipalities}.`,
        '/dashboard/territory',
      ),
      electoralProjectionCheck(facts, 'WARN'),
      check(
        'ZONES_CONFIGURED',
        'Zonas territoriales',
        zones > 0 ? 'PASS' : 'WARN',
        zones > 0
          ? `${zones} ${plural(zones, 'zona configurada', 'zonas configuradas')}.`
          : 'No hay zonas configuradas; confirme si la operacion realmente no usa este nivel territorial.',
        '/dashboard/territory',
      ),
    ],
    CAMPAIGN: [
      electoralProjectionCheck(facts, 'BLOCK'),
      check(
        'POLLING_PLACES_CONFIGURED',
        'Puestos de votacion',
        coverage.expectedPollingPlaces > 0 ? 'PASS' : 'BLOCK',
        coverage.expectedPollingPlaces > 0
          ? `${coverage.expectedPollingPlaces} ${plural(
              coverage.expectedPollingPlaces,
              'puesto configurado',
              'puestos configurados',
            )}.`
          : 'No hay puestos de votacion configurados.',
        '/dashboard/territory',
      ),
      check(
        'POLLING_PLACE_TABLES_CONFIGURED',
        'Mesas esperadas por puesto',
        coverage.expectedPollingPlaces > 0 &&
          coverage.placesWithoutExpectedTables === 0
          ? 'PASS'
          : 'BLOCK',
        coverage.expectedPollingPlaces === 0
          ? 'No es posible verificar mesas esperadas sin puestos de votacion.'
          : coverage.placesWithoutExpectedTables === 0
            ? 'Todos los puestos tienen una cantidad de mesas esperadas mayor que cero.'
            : `${coverage.placesWithoutExpectedTables} ${plural(
                coverage.placesWithoutExpectedTables,
                'puesto no tiene',
                'puestos no tienen',
              )} una cantidad de mesas esperadas mayor que cero.`,
        '/dashboard/territory',
      ),
      check(
        'ACTIVE_WITNESSES_ASSIGNED',
        'Testigos activos asignados',
        scheduledWitnessTables > 0 ? 'PASS' : 'BLOCK',
        scheduledWitnessTables > 0
          ? `${scheduledWitnessTables} coberturas de mesa tienen un TESTIGO activo planificado o confirmado.`
          : 'No hay mesas con una asignacion exacta de TESTIGO activo.',
        '/dashboard/witness-planning',
      ),
      check(
        'WITNESS_COVERAGE_WINDOWS_CONFIGURED',
        'Jornadas y horarios por puesto',
        coverage.expectedPollingPlaces > 0 &&
          coverage.placesWithoutCoverageWindows === 0
          ? 'PASS'
          : 'BLOCK',
        coverage.expectedPollingPlaces === 0
          ? 'No hay puestos sobre los cuales declarar una jornada operativa.'
          : coverage.placesWithoutCoverageWindows === 0
            ? `Los ${coverage.expectedPollingPlaces} puestos tienen al menos una ventana local explícita; no se presume un horario universal.`
            : `${coverage.placesWithoutCoverageWindows} puestos no tienen una ventana local explícita con inicio, fin, zona IANA y offset.`,
        '/dashboard/witness-planning',
      ),
      check(
        'WITNESS_POLLING_PLACE_COVERAGE',
        'Cobertura territorial de testigos',
        coverage.expectedPollingPlaces === 0 || scheduledPollingPlaces === 0
          ? 'BLOCK'
          : scheduledPollingPlaces === coverage.expectedPollingPlaces
            ? 'PASS'
            : 'WARN',
        coverage.expectedPollingPlaces === 0
          ? 'No hay puestos sobre los cuales calcular cobertura.'
          : `${scheduledPollingPlaces} de ${coverage.expectedPollingPlaces} puestos tienen al menos una cobertura exacta de mesa; una asignacion ancestral no cuenta.`,
        '/dashboard/witness-planning',
      ),
      check(
        'OPEN_INCIDENTS_CASES',
        'Incidentes y casos abiertos',
        facts.openCaseCount === 0 ? 'PASS' : 'WARN',
        facts.openCaseCount === 0
          ? 'No hay incidentes o casos abiertos.'
          : `${facts.openCaseCount} ${plural(facts.openCaseCount, 'incidente o caso abierto', 'incidentes o casos abiertos')}.`,
        '/dashboard/cases',
      ),
      check(
        'OPEN_TASKS',
        'Tareas abiertas',
        facts.openTaskCount === 0 ? 'PASS' : 'WARN',
        facts.openTaskCount === 0
          ? 'No hay tareas abiertas.'
          : `${facts.openTaskCount} ${plural(facts.openTaskCount, 'tarea abierta', 'tareas abiertas')}.`,
        '/dashboard/tasks',
      ),
      check(
        'OVERDUE_TASKS',
        'Tareas vencidas',
        facts.overdueTaskCount === 0 ? 'PASS' : 'BLOCK',
        facts.overdueTaskCount === 0
          ? 'No hay tareas abiertas con fecha vencida.'
          : `${facts.overdueTaskCount} ${plural(facts.overdueTaskCount, 'tarea abierta esta vencida', 'tareas abiertas estan vencidas')}.`,
        '/dashboard/tasks',
      ),
      check(
        'PENDING_COMMUNICATIONS',
        'Comunicaciones pendientes',
        facts.pendingCommunicationCount === 0 ? 'PASS' : 'WARN',
        facts.pendingCommunicationCount === 0
          ? 'No hay comunicaciones pendientes de decision.'
          : `${facts.pendingCommunicationCount} ${plural(facts.pendingCommunicationCount, 'comunicacion espera', 'comunicaciones esperan')} decision.`,
        '/dashboard/communications',
      ),
      check(
        'PENDING_FINANCES',
        'Finanzas pendientes',
        facts.pendingFinanceCount === 0 ? 'PASS' : 'WARN',
        facts.pendingFinanceCount === 0
          ? 'No hay movimientos financieros pendientes de revision.'
          : `${facts.pendingFinanceCount} ${plural(facts.pendingFinanceCount, 'movimiento financiero pendiente', 'movimientos financieros pendientes')}.`,
        '/dashboard/finance',
      ),
    ],
    ELECTION_DAY: [
      electionDateCheck(facts.profile, generatedAt),
      electoralProjectionCheck(facts, 'BLOCK'),
      check(
        'WITNESS_PRIMARY_TABLE_COVERAGE',
        'Titulares confirmados por mesa y horario',
        coverage.expectedTables > 0 && coverage.missingPrimaryTables === 0
          ? 'PASS'
          : 'BLOCK',
        coverage.expectedTables === 0
          ? 'No hay jornadas de mesa configuradas sobre las cuales verificar titulares.'
          : coverage.missingPrimaryTables === 0
            ? `Las ${coverage.expectedTables} combinaciones mesa-jornada tienen cobertura PRIMARY confirmada durante toda su ventana.`
            : `${coverage.missingPrimaryTables} de ${coverage.expectedTables} combinaciones mesa-jornada tienen huecos PRIMARY; faltan ${coverage.confirmedPrimaryUncoveredMinutes} minutos-mesa confirmados.`,
        '/dashboard/witness-planning',
      ),
      check(
        'WITNESS_BACKUP_TABLE_COVERAGE',
        'Suplentes confirmados por mesa y horario',
        coverage.expectedTables > 0 && coverage.missingBackupTables === 0
          ? 'PASS'
          : 'BLOCK',
        coverage.expectedTables === 0
          ? 'No hay jornadas de mesa configuradas sobre las cuales verificar suplentes.'
          : coverage.missingBackupTables === 0
            ? `Las ${coverage.expectedTables} combinaciones mesa-jornada tienen cobertura BACKUP confirmada durante toda su ventana.`
            : `${coverage.missingBackupTables} de ${coverage.expectedTables} combinaciones mesa-jornada tienen huecos BACKUP; faltan ${coverage.confirmedBackupUncoveredMinutes} minutos-mesa confirmados.`,
        '/dashboard/witness-planning',
      ),
      check(
        'E14_PENDING',
        'E-14 pendientes',
        facts.e14PendingCount === 0 ? 'PASS' : 'WARN',
        facts.e14PendingCount === 0
          ? 'No hay formularios E-14 pendientes de revision.'
          : `${facts.e14PendingCount} formularios E-14 pendientes de revision.`,
        '/dashboard/war-room',
      ),
      check(
        'E14_REJECTED',
        'E-14 rechazados',
        facts.e14RejectedCount === 0 ? 'PASS' : 'WARN',
        facts.e14RejectedCount === 0
          ? 'No hay formularios E-14 rechazados.'
          : `${facts.e14RejectedCount} formularios E-14 rechazados requieren conciliacion operativa.`,
        '/dashboard/war-room',
      ),
      check(
        'E14_DIVERGENT',
        'Mesas con E-14 divergentes',
        facts.e14DivergentTableCount === 0 ? 'PASS' : 'BLOCK',
        facts.e14DivergentTableCount === 0
          ? 'No hay mesas con capturas E-14 pendientes que discrepen entre si.'
          : `${facts.e14DivergentTableCount} ${plural(
              facts.e14DivergentTableCount,
              'mesa tiene',
              'mesas tienen',
            )} capturas E-14 pendientes con resultados divergentes.`,
        '/dashboard/war-room',
      ),
    ],
    POST_ELECTION: [
      ...(exceptionalTermination ? [exceptionalTermination] : []),
      postElectionFinanceCheck(facts, generatedAt),
      postElectionCloseoutCheck(facts),
    ],
  };
  const checks = sumChecks(sections);
  const overall = checks.some(({ status }) => status === 'BLOCK')
    ? 'BLOCKED'
    : checks.some(({ status }) => status === 'WARN')
      ? 'ATTENTION'
      : 'READY';

  return {
    stage: facts.profile?.stage ?? null,
    electionDate: facts.profile?.electionDate.toISOString() ?? null,
    votingStartDate: facts.profile
      ? toStoredDateOnlyKey(facts.profile.votingStartDate)
      : null,
    votingEndDate: facts.profile
      ? toStoredDateOnlyKey(facts.profile.votingEndDate)
      : null,
    votingWindowSourceUrl: facts.profile?.votingWindowSourceUrl ?? null,
    votingWindowReference: facts.profile?.votingWindowReference ?? null,
    generatedAt: generatedAt.toISOString(),
    overall,
    sections,
    closure: facts.profile?.closureType
      ? {
          type: facts.profile.closureType,
          terminatedAt: facts.profile.terminatedAt?.toISOString() ?? null,
          cause: facts.profile.terminationCause,
          complianceCertified: false,
          authorityFilingCertified: false,
        }
      : null,
  };
}
