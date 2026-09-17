import {
  DivisionType,
  ElectoralCodeNamespace,
  OperationClosureType,
  OperationTerminationCause,
  PoliticalOperationStage,
  Prisma,
  WitnessReportStatus,
} from '../../prisma/generated/prisma';
import { evaluateFinanceCloseoutReadiness } from '../finance/finance-closeout-readiness';
import type { OperationReadinessCheckDto } from './dto/operation-readiness.dto';
import {
  buildOperationReadiness,
  CLOSURE_READINESS_BLOCKER,
  countDivergentE14Tables,
  ELECTION_DAY_READINESS_BLOCKER,
  getElectionDayReadinessBlockers,
  getClosureReadinessBlockers,
  getWitnessCoverage,
  type E14ReadinessFingerprint,
  type OperationReadinessFacts,
  toBogotaDateKey,
  toStoredDateOnlyKey,
} from './operation-readiness';

const generatedAt = new Date('2026-09-09T15:00:00.000Z');
const witnessCoverageWindows: OperationReadinessFacts['witnessCoverageWindows'] =
  [
    {
      id: 'window-a',
      puestoId: 'place-a',
      localDate: new Date('2027-10-31T00:00:00.000Z'),
      startsAt: new Date('2027-10-31T12:00:00.000Z'),
      endsAt: new Date('2027-10-31T22:00:00.000Z'),
      timeZone: 'America/Bogota',
      utcOffsetMinutes: -300,
    },
  ];

function confirmedExactCoverage(
  tableEnd = 8,
): OperationReadinessFacts['witnessAssignments'] {
  return (['PRIMARY', 'BACKUP'] as const).map((assignmentType) => ({
    coverageWindowId: 'window-a',
    puestoId: 'place-a',
    tableStart: 1,
    tableEnd,
    shiftStartsAt: new Date('2027-10-31T12:00:00.000Z'),
    shiftEndsAt: new Date('2027-10-31T22:00:00.000Z'),
    assignmentType,
    status: 'CONFIRMED',
    witnessEligible: true,
  }));
}

function readyFacts(
  overrides: Partial<OperationReadinessFacts> = {},
): OperationReadinessFacts {
  return {
    profile: {
      stage: PoliticalOperationStage.PRE_CAMPAIGN,
      electionDate: new Date('2027-10-31T00:00:00.000Z'),
      votingStartDate: new Date('2027-10-31T00:00:00.000Z'),
      votingEndDate: new Date('2027-10-31T00:00:00.000Z'),
      votingWindowSourceUrl: null,
      votingWindowReference: null,
      closureType: null,
      terminatedAt: null,
      terminationCause: null,
    },
    activeConsentNoticeCount: 1,
    financeCompliance: {
      ready: true,
      missingFields: [],
      invalidFields: [],
    },
    financeReportDeadline: new Date('2027-11-30T00:00:00.000Z'),
    activeNonAdminTeamCount: 4,
    activeElectoralCatalogReleaseIds: ['release-active'],
    divisions: [
      {
        id: 'department-a',
        parentId: null,
        type: DivisionType.DEPARTAMENTO,
        expectedTables: null,
        sourceNamespace: ElectoralCodeNamespace.RNEC_DIVIPOLE,
        sourceReleaseId: 'release-active',
      },
      {
        id: 'municipality-a',
        parentId: 'department-a',
        type: DivisionType.MUNICIPIO,
        expectedTables: null,
        sourceNamespace: ElectoralCodeNamespace.RNEC_DIVIPOLE,
        sourceReleaseId: 'release-active',
      },
      {
        id: 'zone-a',
        parentId: 'municipality-a',
        type: DivisionType.ZONA,
        expectedTables: null,
        sourceNamespace: ElectoralCodeNamespace.RNEC_DIVIPOLE,
        sourceReleaseId: 'release-active',
      },
      {
        id: 'place-a',
        parentId: 'zone-a',
        type: DivisionType.PUESTO,
        expectedTables: 8,
        sourceNamespace: ElectoralCodeNamespace.RNEC_DIVIPOLE,
        sourceReleaseId: 'release-active',
      },
    ],
    witnessCoverageWindows,
    witnessAssignments: confirmedExactCoverage(),
    e14PendingCount: 0,
    e14RejectedCount: 0,
    e14DivergentTableCount: 0,
    openCaseCount: 0,
    openTaskCount: 0,
    overdueTaskCount: 0,
    pendingCommunicationCount: 0,
    pendingFinanceCount: 0,
    unreportedFinanceCount: 0,
    hasOperationalActivity: true,
    lifecycleCreatedAuditCount: 1,
    lifecycleAdoptionAuditCount: 0,
    ...overrides,
  };
}

function findCheck(
  facts: OperationReadinessFacts,
  code: string,
  now = generatedAt,
): OperationReadinessCheckDto {
  const result = buildOperationReadiness(facts, now);
  const checks: OperationReadinessCheckDto[] = [
    ...result.sections.BEFORE_CAMPAIGN,
    ...result.sections.CAMPAIGN,
    ...result.sections.ELECTION_DAY,
    ...result.sections.POST_ELECTION,
  ];
  const selected = checks.find((item) => item.code === code);
  if (!selected) throw new Error(`No existe el check ${code}`);
  return selected;
}

describe('operation readiness rules', () => {
  it('returns the stable complete contract when the electoral projection is exact', () => {
    const result = buildOperationReadiness(readyFacts(), generatedAt);

    expect(result).toMatchObject({
      stage: PoliticalOperationStage.PRE_CAMPAIGN,
      electionDate: '2027-10-31T00:00:00.000Z',
      votingStartDate: '2027-10-31',
      votingEndDate: '2027-10-31',
      votingWindowSourceUrl: null,
      votingWindowReference: null,
      generatedAt: '2026-09-09T15:00:00.000Z',
      overall: 'READY',
    });
    expect(Object.keys(result.sections)).toEqual([
      'BEFORE_CAMPAIGN',
      'CAMPAIGN',
      'ELECTION_DAY',
      'POST_ELECTION',
    ]);
    const checks: OperationReadinessCheckDto[] = [
      ...result.sections.BEFORE_CAMPAIGN,
      ...result.sections.CAMPAIGN,
      ...result.sections.ELECTION_DAY,
      ...result.sections.POST_ELECTION,
    ];
    expect(checks.map(({ code }) => code)).toEqual([
      'PROFILE_CONFIGURED',
      'LIFECYCLE_HISTORY_NOT_ESTABLISHED',
      'ACTIVE_CONSENT_NOTICE',
      'FINANCE_COMPLIANCE_CONFIGURED',
      'ACTIVE_NON_ADMIN_TEAM',
      'ADMINISTRATIVE_GEOGRAPHY',
      'ELECTORAL_CATALOG_PROVENANCE',
      'ZONES_CONFIGURED',
      'ELECTORAL_CATALOG_PROVENANCE',
      'POLLING_PLACES_CONFIGURED',
      'POLLING_PLACE_TABLES_CONFIGURED',
      'ACTIVE_WITNESSES_ASSIGNED',
      'WITNESS_COVERAGE_WINDOWS_CONFIGURED',
      'WITNESS_POLLING_PLACE_COVERAGE',
      'OPEN_INCIDENTS_CASES',
      'OPEN_TASKS',
      'OVERDUE_TASKS',
      'PENDING_COMMUNICATIONS',
      'PENDING_FINANCES',
      'ELECTION_OPERATING_WINDOW',
      'ELECTORAL_CATALOG_PROVENANCE',
      'WITNESS_PRIMARY_TABLE_COVERAGE',
      'WITNESS_BACKUP_TABLE_COVERAGE',
      'E14_PENDING',
      'E14_REJECTED',
      'E14_DIVERGENT',
      'POST_ELECTION_FINANCE_OBLIGATIONS',
      'POST_ELECTION_OPERATIONAL_CLOSEOUT',
    ]);
    for (const item of checks) {
      expect(item).toEqual({
        code: expect.any(String),
        label: expect.any(String),
        status: 'PASS',
        detail: expect.any(String),
        href: expect.stringMatching(/^\/dashboard\//),
      });
    }
  });

  it('never presents an active catalog release as linked to operational geography without provenance', () => {
    const selected = findCheck(
      readyFacts({
        divisions: readyFacts().divisions.map((division) => ({
          ...division,
          sourceReleaseId: 'different-release',
        })),
      }),
      'ELECTORAL_CATALOG_PROVENANCE',
    );

    expect(selected).toMatchObject({ status: 'BLOCK' });
    expect(selected.detail).toContain('ausentes de su proyeccion');
  });

  it('distinguishes exceptional closure and never upgrades it to a compliance certificate', () => {
    const result = buildOperationReadiness(
      readyFacts({
        profile: {
          stage: PoliticalOperationStage.CLOSED,
          electionDate: new Date('2026-10-25T00:00:00.000Z'),
          votingStartDate: new Date('2026-10-25T00:00:00.000Z'),
          votingEndDate: new Date('2026-10-25T00:00:00.000Z'),
          votingWindowSourceUrl: null,
          votingWindowReference: null,
          closureType: OperationClosureType.CLOSED_EXCEPTIONAL,
          terminatedAt: new Date('2026-09-09T12:00:00.000Z'),
          terminationCause: OperationTerminationCause.REGISTRATION_REVOKED,
        },
      }),
      generatedAt,
    );

    expect(result.closure).toEqual({
      type: OperationClosureType.CLOSED_EXCEPTIONAL,
      terminatedAt: '2026-09-09T12:00:00.000Z',
      cause: OperationTerminationCause.REGISTRATION_REVOKED,
      complianceCertified: false,
      authorityFilingCertified: false,
    });
    expect(result.overall).not.toBe('READY');
    expect(
      result.sections.POST_ELECTION.find(
        ({ code }) => code === 'EXCEPTIONAL_TERMINATION_SURVIVING_DUTIES',
      ),
    ).toMatchObject({ status: 'WARN' });
  });

  it('blocks a missing profile but only warns about history when real activity exists', () => {
    const withoutActivity = readyFacts({
      profile: null,
      hasOperationalActivity: false,
      lifecycleCreatedAuditCount: 0,
    });
    const withActivity = { ...withoutActivity, hasOperationalActivity: true };

    expect(findCheck(withoutActivity, 'PROFILE_CONFIGURED').status).toBe(
      'BLOCK',
    );
    expect(
      findCheck(withoutActivity, 'LIFECYCLE_HISTORY_NOT_ESTABLISHED').status,
    ).toBe('PASS');
    expect(
      findCheck(withActivity, 'LIFECYCLE_HISTORY_NOT_ESTABLISHED'),
    ).toMatchObject({ status: 'WARN' });
    expect(
      findCheck(withActivity, 'LIFECYCLE_HISTORY_NOT_ESTABLISHED').detail,
    ).toContain('no se infiere');
  });

  it('warns instead of fabricating history for an adopted or unaudited profile', () => {
    expect(
      findCheck(
        readyFacts({ lifecycleCreatedAuditCount: 0 }),
        'LIFECYCLE_HISTORY_NOT_ESTABLISHED',
      ).status,
    ).toBe('WARN');
    expect(
      findCheck(
        readyFacts({ lifecycleAdoptionAuditCount: 1 }),
        'LIFECYCLE_HISTORY_NOT_ESTABLISHED',
      ),
    ).toMatchObject({ status: 'WARN' });
  });

  it.each([0, 2])(
    'blocks when active consent notice count is %i rather than exactly one',
    (activeConsentNoticeCount) => {
      expect(
        findCheck(
          readyFacts({ activeConsentNoticeCount }),
          'ACTIVE_CONSENT_NOTICE',
        ).status,
      ).toBe('BLOCK');
    },
  );

  it('blocks incomplete finance compliance without returning field values', () => {
    const selected = findCheck(
      readyFacts({
        financeCompliance: {
          ready: false,
          missingFields: ['financialManagerDocument'],
          invalidFields: ['OFFICIAL_LIMITS_URL_NOT_HTTPS'],
        },
      }),
      'FINANCE_COMPLIANCE_CONFIGURED',
    );

    expect(selected).toMatchObject({ status: 'BLOCK' });
    expect(selected.detail).toBe(
      'El expediente financiero tiene 1 campos faltantes y 1 validaciones incumplidas.',
    );
    expect(selected.detail).not.toContain('financialManagerDocument');
  });

  it.each([
    ['ACTIVE_NON_ADMIN_TEAM', { activeNonAdminTeamCount: 0 }, 'BLOCK'],
    [
      'ADMINISTRATIVE_GEOGRAPHY',
      {
        divisions: readyFacts().divisions.filter(
          ({ type }) => type !== DivisionType.DEPARTAMENTO,
        ),
      },
      'BLOCK',
    ],
    [
      'ZONES_CONFIGURED',
      {
        divisions: readyFacts().divisions.map((division) =>
          division.type === DivisionType.ZONA
            ? { ...division, type: DivisionType.MUNICIPIO }
            : division,
        ),
      },
      'WARN',
    ],
  ] as const)(
    'reports strict setup status for %s',
    (code, overrides, expectedStatus) => {
      expect(
        findCheck(
          readyFacts(overrides as Partial<OperationReadinessFacts>),
          code,
        ).status,
      ).toBe(expectedStatus);
    },
  );

  it('blocks missing polling places and cannot pretend table coverage exists', () => {
    const divisions = readyFacts().divisions.filter(
      ({ type }) => type !== DivisionType.PUESTO,
    );
    const facts = readyFacts({ divisions });

    expect(findCheck(facts, 'POLLING_PLACES_CONFIGURED').status).toBe('BLOCK');
    expect(findCheck(facts, 'POLLING_PLACE_TABLES_CONFIGURED').status).toBe(
      'BLOCK',
    );
    expect(findCheck(facts, 'WITNESS_POLLING_PLACE_COVERAGE').status).toBe(
      'BLOCK',
    );
  });

  it.each([null, 0, -1])(
    'blocks a polling place whose expectedTables is %s',
    (expectedTables) => {
      const divisions = readyFacts().divisions.map((division) =>
        division.id === 'place-a' ? { ...division, expectedTables } : division,
      );
      expect(
        findCheck(readyFacts({ divisions }), 'POLLING_PLACE_TABLES_CONFIGURED')
          .status,
      ).toBe('BLOCK');
    },
  );

  it('requires exact table assignments and reports partial place coverage honestly', () => {
    const divisions = [
      ...readyFacts().divisions,
      {
        id: 'zone-b',
        code: 'ZB',
        name: 'Zona B',
        parentId: 'municipality-a',
        type: DivisionType.ZONA,
        expectedTables: null,
        sourceNamespace: ElectoralCodeNamespace.RNEC_DIVIPOLE,
        sourceReleaseId: 'release-active',
      },
      {
        id: 'place-b',
        code: 'PB',
        name: 'Puesto B',
        parentId: 'zone-b',
        type: DivisionType.PUESTO,
        expectedTables: 4,
        sourceNamespace: ElectoralCodeNamespace.RNEC_DIVIPOLE,
        sourceReleaseId: 'release-active',
      },
    ];
    const facts = readyFacts({
      divisions,
      witnessCoverageWindows: [
        ...witnessCoverageWindows,
        {
          ...witnessCoverageWindows[0],
          id: 'window-b',
          puestoId: 'place-b',
        },
      ],
      witnessAssignments: confirmedExactCoverage(),
    });

    expect(
      getWitnessCoverage(
        divisions,
        facts.witnessCoverageWindows,
        facts.witnessAssignments,
      ),
    ).toMatchObject({
      expectedPollingPlaces: 2,
      placesWithoutExpectedTables: 0,
      expectedTables: 12,
      confirmedPrimaryTables: 8,
      confirmedBackupTables: 8,
      confirmedBothTables: 8,
      fullyConfirmed: false,
    });
    expect(findCheck(facts, 'ACTIVE_WITNESSES_ASSIGNED').status).toBe('PASS');
    expect(findCheck(facts, 'WITNESS_POLLING_PLACE_COVERAGE')).toMatchObject({
      status: 'WARN',
      detail: expect.stringContaining('1 de 2'),
    });
  });

  it('rejects an ancestral assignment that does not identify a polling place and tables', () => {
    const facts = readyFacts({
      witnessAssignments: [
        {
          coverageWindowId: 'window-a',
          puestoId: 'zone-a',
          tableStart: 1,
          tableEnd: 8,
          shiftStartsAt: new Date('2027-10-31T12:00:00.000Z'),
          shiftEndsAt: new Date('2027-10-31T22:00:00.000Z'),
          assignmentType: 'PRIMARY',
          status: 'CONFIRMED',
          witnessEligible: true,
        },
      ],
    });

    expect(findCheck(facts, 'ACTIVE_WITNESSES_ASSIGNED').status).toBe('BLOCK');
    expect(findCheck(facts, 'WITNESS_POLLING_PLACE_COVERAGE').status).toBe(
      'BLOCK',
    );
  });

  it('does not use hierarchy ancestry even when corrupt hierarchy data contains a cycle', () => {
    const divisions = readyFacts().divisions.map((division) =>
      division.id === 'department-a'
        ? { ...division, parentId: 'zone-a' }
        : division,
    );

    expect(
      getWitnessCoverage(divisions, witnessCoverageWindows, [
        {
          coverageWindowId: 'window-a',
          puestoId: 'department-a',
          tableStart: 1,
          tableEnd: 8,
          shiftStartsAt: new Date('2027-10-31T12:00:00.000Z'),
          shiftEndsAt: new Date('2027-10-31T22:00:00.000Z'),
          assignmentType: 'PRIMARY',
          status: 'CONFIRMED',
          witnessEligible: true,
        },
      ]),
    ).toMatchObject({
      expectedPollingPlaces: 1,
      confirmedPrimaryTables: 0,
      confirmedBackupTables: 0,
    });
  });

  it.each([
    ['OPEN_INCIDENTS_CASES', { openCaseCount: 2 }, 'WARN'],
    ['OPEN_TASKS', { openTaskCount: 3 }, 'WARN'],
    ['OVERDUE_TASKS', { overdueTaskCount: 1 }, 'BLOCK'],
    ['PENDING_COMMUNICATIONS', { pendingCommunicationCount: 4 }, 'WARN'],
    ['PENDING_FINANCES', { pendingFinanceCount: 5 }, 'WARN'],
    ['E14_PENDING', { e14PendingCount: 6 }, 'WARN'],
    ['E14_REJECTED', { e14RejectedCount: 7 }, 'WARN'],
    ['E14_DIVERGENT', { e14DivergentTableCount: 1 }, 'BLOCK'],
  ] as const)(
    'surfaces real operational state for %s',
    (code, overrides, status) => {
      expect(
        findCheck(
          readyFacts(overrides as Partial<OperationReadinessFacts>),
          code,
        ).status,
      ).toBe(status);
    },
  );

  it('uses the Bogota midnight boundary for election-day coherence', () => {
    const electionDate = new Date('2027-10-31T00:00:00.000Z');
    const beforeBogotaMidnight = new Date('2027-10-31T04:59:59.999Z');
    const atBogotaMidnight = new Date('2027-10-31T05:00:00.000Z');
    const facts = readyFacts({
      profile: {
        stage: PoliticalOperationStage.PRE_CAMPAIGN,
        electionDate,
        votingStartDate: electionDate,
        votingEndDate: electionDate,
        votingWindowSourceUrl: null,
        votingWindowReference: null,
        closureType: null,
        terminatedAt: null,
        terminationCause: null,
      },
    });

    expect(toBogotaDateKey(beforeBogotaMidnight)).toBe('2027-10-30');
    expect(toBogotaDateKey(atBogotaMidnight)).toBe('2027-10-31');
    expect(
      findCheck(facts, 'ELECTION_OPERATING_WINDOW', beforeBogotaMidnight)
        .status,
    ).toBe('PASS');
    expect(
      findCheck(facts, 'ELECTION_OPERATING_WINDOW', atBogotaMidnight).status,
    ).toBe('BLOCK');
  });

  it('treats different UTC instants on the same Bogota date as election day', () => {
    const facts = readyFacts({
      profile: {
        stage: PoliticalOperationStage.ELECTION_DAY,
        electionDate: new Date('2027-10-31T00:00:00.000Z'),
        votingStartDate: new Date('2027-10-31T00:00:00.000Z'),
        votingEndDate: new Date('2027-10-31T00:00:00.000Z'),
        votingWindowSourceUrl: null,
        votingWindowReference: null,
        closureType: null,
        terminatedAt: null,
        terminationCause: null,
      },
    });

    expect(
      findCheck(
        facts,
        'ELECTION_OPERATING_WINDOW',
        new Date('2027-10-31T18:00:00.000Z'),
      ).status,
    ).toBe('PASS');
    expect(
      findCheck(
        facts,
        'ELECTION_OPERATING_WINDOW',
        new Date('2027-10-31T04:59:59.999Z'),
      ).status,
    ).toBe('BLOCK');
  });

  it('preserves date-only finance deadlines stored at UTC midnight', () => {
    expect(toStoredDateOnlyKey(new Date('2027-11-30T00:00:00.000Z'))).toBe(
      '2027-11-30',
    );
    const facts = readyFacts({
      unreportedFinanceCount: 1,
      financeReportDeadline: new Date('2026-09-09T00:00:00.000Z'),
    });

    expect(
      findCheck(
        facts,
        'POST_ELECTION_FINANCE_OBLIGATIONS',
        new Date('2026-09-09T23:00:00.000Z'),
      ).status,
    ).toBe('WARN');
    expect(
      findCheck(
        facts,
        'POST_ELECTION_FINANCE_OBLIGATIONS',
        new Date('2026-09-10T05:00:00.000Z'),
      ).status,
    ).toBe('BLOCK');
  });

  it('blocks unresolved obligations and closeout once the profile is post-election', () => {
    const facts = readyFacts({
      profile: {
        stage: PoliticalOperationStage.POST_ELECTION,
        electionDate: new Date('2026-09-01T00:00:00.000Z'),
        votingStartDate: new Date('2026-09-01T00:00:00.000Z'),
        votingEndDate: new Date('2026-09-01T00:00:00.000Z'),
        votingWindowSourceUrl: null,
        votingWindowReference: null,
        closureType: null,
        terminatedAt: null,
        terminationCause: null,
      },
      unreportedFinanceCount: 1,
      openCaseCount: 1,
    });

    expect(findCheck(facts, 'POST_ELECTION_FINANCE_OBLIGATIONS').status).toBe(
      'BLOCK',
    );
    expect(findCheck(facts, 'POST_ELECTION_OPERATIONAL_CLOSEOUT').status).toBe(
      'BLOCK',
    );
  });

  it('shows the exact shared dossier blockers in post-election readiness', () => {
    const financeCloseoutReadiness = evaluateFinanceCloseoutReadiness(
      {
        financeComplianceReady: true,
        reportDeadline: new Date('2027-11-30T00:00:00.000Z'),
        dossierCount: 1,
        dossierWithoutVersionCount: 1,
        latestVersionNotApprovedCount: 0,
        latestVersionWithoutApprovedExternalEvidenceCount: 0,
        bankStatementCount: 1,
        unmatchedBankLineCount: 0,
        outstandingPayables: new Prisma.Decimal(0),
        pendingEntryCount: 0,
        approvedUnreportedEntryCount: 2,
      },
      generatedAt,
    );
    const facts = readyFacts({
      profile: {
        stage: PoliticalOperationStage.POST_ELECTION,
        electionDate: new Date('2026-09-01T00:00:00.000Z'),
        votingStartDate: new Date('2026-09-01T00:00:00.000Z'),
        votingEndDate: new Date('2026-09-01T00:00:00.000Z'),
        votingWindowSourceUrl: null,
        votingWindowReference: null,
        closureType: null,
        terminatedAt: null,
        terminationCause: null,
      },
      financeCloseoutReadiness,
    });

    expect(findCheck(facts, 'POST_ELECTION_FINANCE_OBLIGATIONS')).toMatchObject(
      {
        status: 'BLOCK',
        detail: expect.stringMatching(
          /UNREPORTED_FINANCIAL_ENTRIES.*REPORT_VERSION_MISSING/,
        ),
      },
    );
  });

  it('keeps unresolved closeout as attention before post-election', () => {
    expect(
      findCheck(
        readyFacts({ openCaseCount: 1 }),
        'POST_ELECTION_OPERATIONAL_CLOSEOUT',
      ).status,
    ).toBe('WARN');
  });
});

describe('E-14 divergence aggregation', () => {
  const base: E14ReadinessFingerprint = {
    puestoId: 'place-a',
    mesa: 1,
    candidateVotes: 50,
    blankVotes: 2,
    nullVotes: 1,
    unmarkedVotes: 0,
    totalTableVotes: 53,
    status: WitnessReportStatus.PENDING,
  };

  it('counts a table only when a pending capture has a different vote fingerprint', () => {
    expect(
      countDivergentE14Tables([
        base,
        { ...base, status: WitnessReportStatus.ACCEPTED },
      ]),
    ).toBe(0);
    expect(
      countDivergentE14Tables([
        base,
        {
          ...base,
          candidateVotes: 49,
          status: WitnessReportStatus.ACCEPTED,
        },
      ]),
    ).toBe(1);
  });

  it('does not flag differing accepted captures when none is pending', () => {
    expect(
      countDivergentE14Tables([
        { ...base, status: WitnessReportStatus.ACCEPTED },
        {
          ...base,
          candidateVotes: 49,
          status: WitnessReportStatus.ACCEPTED,
        },
      ]),
    ).toBe(0);
  });
});

describe('election-day transition blockers', () => {
  it('returns stable blocker codes for each minimum prerequisite', () => {
    expect(
      getElectionDayReadinessBlockers(
        [],
        [],
        [],
        generatedAt,
        generatedAt,
        generatedAt,
        true,
      ),
    ).toEqual([ELECTION_DAY_READINESS_BLOCKER.NO_POLLING_PLACES]);

    const divisions = readyFacts().divisions.map((division) =>
      division.id === 'place-a' ? { ...division, expectedTables: 0 } : division,
    );
    expect(
      getElectionDayReadinessBlockers(
        divisions,
        witnessCoverageWindows,
        confirmedExactCoverage(),
        generatedAt,
        generatedAt,
        generatedAt,
        true,
      ),
    ).toEqual([
      ELECTION_DAY_READINESS_BLOCKER.POLLING_PLACES_WITHOUT_EXPECTED_TABLES,
    ]);
  });

  it('requires confirmed PRIMARY and BACKUP coverage for every exact table', () => {
    expect(
      getElectionDayReadinessBlockers(
        readyFacts().divisions,
        witnessCoverageWindows,
        confirmedExactCoverage(),
        generatedAt,
        generatedAt,
        generatedAt,
        true,
      ),
    ).toEqual([]);
  });

  it('blocks entering election day outside the Bogota civil election date', () => {
    expect(
      getElectionDayReadinessBlockers(
        readyFacts().divisions,
        witnessCoverageWindows,
        confirmedExactCoverage(),
        new Date('2027-10-31T00:00:00.000Z'),
        new Date('2027-10-31T00:00:00.000Z'),
        new Date('2027-10-31T04:59:59.999Z'),
        true,
      ),
    ).toEqual([
      ELECTION_DAY_READINESS_BLOCKER.ELECTION_DAY_OUTSIDE_VOTING_WINDOW_BOGOTA,
    ]);
    expect(
      getElectionDayReadinessBlockers(
        readyFacts().divisions,
        witnessCoverageWindows,
        confirmedExactCoverage(),
        new Date('2027-10-31T00:00:00.000Z'),
        new Date('2027-10-31T00:00:00.000Z'),
        new Date('2027-10-31T05:00:00.000Z'),
        true,
      ),
    ).toEqual([]);
  });

  it('blocks Dia D when the active RNEC release is not the exact active projection', () => {
    expect(
      getElectionDayReadinessBlockers(
        readyFacts().divisions,
        witnessCoverageWindows,
        confirmedExactCoverage(),
        generatedAt,
        generatedAt,
        generatedAt,
        false,
      ),
    ).toEqual([
      ELECTION_DAY_READINESS_BLOCKER.ELECTORAL_CATALOG_PROJECTION_NOT_READY,
    ]);
  });
});

describe('post-election closure blockers', () => {
  const clearFacts = {
    financeComplianceReady: true,
    financeReportDeadline: new Date('2027-11-30T00:00:00.000Z'),
    unreportedFinanceCount: 0,
    e14PendingCount: 0,
    e14DivergentTableCount: 0,
    openUrgentCaseCount: 0,
    openUrgentTaskCount: 0,
  };

  it('allows closure only when every modeled critical obligation is clear', () => {
    expect(getClosureReadinessBlockers(clearFacts, generatedAt)).toEqual([]);
  });

  it('returns every stable blocker without hiding concurrent obligations', () => {
    expect(
      getClosureReadinessBlockers(
        {
          ...clearFacts,
          financeComplianceReady: false,
          financeReportDeadline: new Date('2026-09-08T00:00:00.000Z'),
          unreportedFinanceCount: 2,
          e14PendingCount: 3,
          e14DivergentTableCount: 1,
          openUrgentCaseCount: 4,
          openUrgentTaskCount: 5,
        },
        generatedAt,
      ),
    ).toEqual([
      CLOSURE_READINESS_BLOCKER.FINANCE_COMPLIANCE_NOT_READY,
      CLOSURE_READINESS_BLOCKER.UNREPORTED_FINANCIAL_ENTRIES,
      CLOSURE_READINESS_BLOCKER.POST_ELECTION_REPORT_OVERDUE,
      CLOSURE_READINESS_BLOCKER.PENDING_E14_REPORTS,
      CLOSURE_READINESS_BLOCKER.DIVERGENT_E14_TABLES,
      CLOSURE_READINESS_BLOCKER.OPEN_URGENT_CASES,
      CLOSURE_READINESS_BLOCKER.OPEN_URGENT_TASKS,
    ]);
  });

  it('blocks a missing reporting deadline even with no financial movements', () => {
    expect(
      getClosureReadinessBlockers(
        { ...clearFacts, financeReportDeadline: null },
        generatedAt,
      ),
    ).toEqual([
      CLOSURE_READINESS_BLOCKER.POST_ELECTION_REPORT_DEADLINE_NOT_CONFIGURED,
    ]);
  });
});
