import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  E14FormType,
  ElectoralCodeNamespace,
  PoliticalOperationMode,
  PoliticalOperationStage,
  Prisma,
  Role,
  TenantType,
  WitnessCredentialType,
  WitnessCaptureContext,
  WitnessReclamationGround,
  WitnessReportStatus,
} from '../../prisma/generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { WitnessService } from './witness.service';

const tenant = {
  defaultMode: PoliticalOperationMode.CAMPAIGN,
  type: TenantType.CANDIDACY,
};

const traceabilityInput = {
  credentialType: WitnessCredentialType.E15,
  credentialReference: 'E15-BOG-001-0007',
  checkedInAt: '2026-08-30T07:00:00.000-05:00',
  e14FormType: E14FormType.DELEGADOS,
  blankVotes: 5,
  nullVotes: 3,
  unmarkedVotes: 2,
  hasWrittenClaim: false,
} as const;

const report = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id: 'report-pending',
  captureContext: WitnessCaptureContext.REAL,
  witnessId: 'witness-a',
  puestoId: 'puesto-a',
  mesa: 7,
  credentialType: WitnessCredentialType.E15,
  credentialReference: 'E15-BOG-001-0007',
  checkedInAt: new Date('2026-08-30T12:00:00.000Z'),
  e14FormType: E14FormType.DELEGADOS,
  candidateVotes: 80,
  blankVotes: 5,
  nullVotes: 3,
  unmarkedVotes: 2,
  totalTableVotes: 200,
  hasWrittenClaim: false,
  reclamationGround: null,
  reclamationDescription: null,
  observations: null,
  isSynced: false,
  status: WitnessReportStatus.PENDING,
  reviewerId: null,
  reviewReason: null,
  reviewedAt: null,
  supersededById: null,
  createdAt: new Date('2026-08-30T10:00:00.000Z'),
  updatedAt: new Date('2026-08-30T10:00:00.000Z'),
  puesto: {
    code: 'P-001',
    name: 'Colegio Central',
    expectedTables: 10,
  },
  witness: { id: 'witness-a', name: 'Testigo A' },
  reviewer: null,
  ...overrides,
});

function transactionRunner(
  transaction: object & { $queryRaw?: jest.Mock },
  stage: PoliticalOperationStage = PoliticalOperationStage.ELECTION_DAY,
) {
  transaction.$queryRaw ??= jest.fn().mockResolvedValue([{ stage }]);
  return jest.fn(async (callback: (client: object) => Promise<unknown>) =>
    callback(transaction),
  );
}

describe('WitnessService E-14 reconciliation', () => {
  it('persists a simulated report with server-derived provenance', async () => {
    const created = report({
      captureContext: WitnessCaptureContext.SIMULATION,
    });
    const tx = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          role: Role.WITNESS,
          divisionId: 'puesto-a',
        }),
      },
      politicalDivision: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'puesto-a', parentId: null }]),
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'puesto-a', expectedTables: 10 }),
      },
      witnessReport: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(created),
        findMany: jest.fn().mockResolvedValue([
          {
            candidateVotes: 80,
            totalTableVotes: 200,
            status: WitnessReportStatus.PENDING,
          },
          {
            candidateVotes: 82,
            totalTableVotes: 200,
            status: WitnessReportStatus.PENDING,
          },
        ]),
      },
      storedObject: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
    };
    const runTransaction = transactionRunner(
      tx,
      PoliticalOperationStage.SIMULATION,
    );
    const service = new WitnessService({
      tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
      $transaction: runTransaction,
    } as unknown as PrismaService);
    const evidence = 'tenant-a/e14/123e4567-e89b-42d3-a456-426614174000.pdf';

    const result = await service.create('tenant-a', 'witness-a', {
      puestoId: 'puesto-a',
      mesa: 7,
      ...traceabilityInput,
      e14ImageUrl: evidence,
      candidateVotes: 80,
      totalTableVotes: 200,
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: WitnessReportStatus.PENDING,
        hasEvidence: true,
        divergent: true,
      }),
    );
    expect(tx.witnessReport.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        captureContext: WitnessCaptureContext.SIMULATION,
        e14ImageUrl: evidence,
      },
      select: expect.any(Object),
    });
    expect(tx.witnessReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-a',
          captureContext: WitnessCaptureContext.SIMULATION,
          witnessId: 'witness-a',
          puestoId: 'puesto-a',
          mesa: 7,
          credentialType: WitnessCredentialType.E15,
          credentialReference: 'E15-BOG-001-0007',
          checkedInAt: new Date('2026-08-30T12:00:00.000Z'),
          e14FormType: E14FormType.DELEGADOS,
          blankVotes: 5,
          nullVotes: 3,
          unmarkedVotes: 2,
          hasWrittenClaim: false,
          status: WitnessReportStatus.PENDING,
        }) as object,
        select: expect.not.objectContaining({ e14ImageUrl: true }) as object,
      }),
    );
    expect(tx.storedObject.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ uploaderId: 'witness-a' }) as object,
      }),
    );
    expect(tx.witnessReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          captureContext: WitnessCaptureContext.SIMULATION,
          puestoId: 'puesto-a',
          mesa: 7,
        }) as object,
      }),
    );
    expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    const serializedAudit = JSON.stringify(tx.auditEvent.create.mock.calls);
    expect(serializedAudit).not.toContain(evidence);
    expect(serializedAudit).toContain('hasPrivateEvidence');
  });

  it.each([
    {
      name: 'its documented local voting day is not active',
      votingDate: new Date('2026-05-31T00:00:00.000Z'),
      timeZone: 'America/Bogota',
      code: 'E14_POLLING_PLACE_OUTSIDE_LOGICAL_VOTING_DATE',
    },
    {
      name: 'its exterior IANA time zone is not verified',
      votingDate: new Date('2026-05-30T00:00:00.000Z'),
      timeZone: null,
      code: 'E14_POLLING_PLACE_TIME_ZONE_NOT_VERIFIED',
    },
  ])('blocks direct REAL capture when $name', async (scenario) => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-30T12:00:00.000Z'));
    try {
      const tx = {
        user: {
          findFirst: jest.fn().mockResolvedValue({
            role: Role.WITNESS,
            divisionId: 'puesto-a',
          }),
        },
        politicalDivision: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'puesto-a', parentId: null }]),
          findFirst: jest.fn().mockResolvedValue({
            id: 'puesto-a',
            expectedTables: 10,
            sourceNamespace: ElectoralCodeNamespace.RNEC_DIVIPOLE,
            sourceLocationCode: '1001',
            votingDate: scenario.votingDate,
            timeZone: scenario.timeZone,
          }),
        },
        witnessReport: { findFirst: jest.fn() },
      };
      const service = new WitnessService({
        tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
        $transaction: transactionRunner(
          tx,
          PoliticalOperationStage.ELECTION_DAY,
        ),
      } as unknown as PrismaService);

      await expect(
        service.create('tenant-a', 'witness-a', {
          puestoId: 'puesto-a',
          mesa: 7,
          ...traceabilityInput,
          checkedInAt: '2026-05-30T11:55:00.000Z',
          e14ImageUrl: 'tenant-a/e14/123e4567-e89b-42d3-a456-426614174009.pdf',
          candidateVotes: 80,
          totalTableVotes: 200,
        }),
      ).rejects.toMatchObject({ response: { code: scenario.code } });
      expect(tx.witnessReport.findFirst).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects a vote breakdown that exceeds the table total before persistence', async () => {
    const transaction = jest.fn();
    const service = new WitnessService({
      tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
      $transaction: transaction,
    } as unknown as PrismaService);

    await expect(
      service.create('tenant-a', 'witness-a', {
        puestoId: 'puesto-a',
        mesa: 7,
        ...traceabilityInput,
        blankVotes: 15,
        nullVotes: 4,
        unmarkedVotes: 2,
        e14ImageUrl: 'tenant-a/e14/123e4567-e89b-42d3-a456-426614174000.pdf',
        candidateVotes: 80,
        totalTableVotes: 100,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a check-in more than five minutes in the future', async () => {
    const transaction = jest.fn();
    const service = new WitnessService({
      tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
      $transaction: transaction,
    } as unknown as PrismaService);

    await expect(
      service.create('tenant-a', 'witness-a', {
        puestoId: 'puesto-a',
        mesa: 7,
        ...traceabilityInput,
        checkedInAt: new Date(Date.now() + 6 * 60 * 1000).toISOString(),
        e14ImageUrl: 'tenant-a/e14/123e4567-e89b-42d3-a456-426614174000.pdf',
        candidateVotes: 80,
        totalTableVotes: 200,
      }),
    ).rejects.toThrow('La hora de presencia no puede estar en el futuro');

    expect(transaction).not.toHaveBeenCalled();
  });

  it('requires a legal ground and a reasoned description for a written claim', async () => {
    const transaction = jest.fn();
    const service = new WitnessService({
      tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
      $transaction: transaction,
    } as unknown as PrismaService);

    await expect(
      service.create('tenant-a', 'witness-a', {
        puestoId: 'puesto-a',
        mesa: 7,
        ...traceabilityInput,
        hasWrittenClaim: true,
        e14ImageUrl: 'tenant-a/e14/123e4567-e89b-42d3-a456-426614174000.pdf',
        candidateVotes: 80,
        totalTableVotes: 200,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(transaction).not.toHaveBeenCalled();
  });

  it('persists the written claim without treating it as an official filing', async () => {
    const created = report({
      hasWrittenClaim: true,
      reclamationGround: WitnessReclamationGround.ARITHMETIC_ERROR,
      reclamationDescription:
        'La suma escrita en el acta no coincide con los renglones verificados.',
    });
    const tx = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          role: Role.WITNESS,
          divisionId: 'puesto-a',
        }),
      },
      politicalDivision: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'puesto-a', parentId: null }]),
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'puesto-a', expectedTables: 10 }),
      },
      witnessReport: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(created),
        findMany: jest.fn().mockResolvedValue([created]),
      },
      storedObject: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
    };
    const service = new WitnessService({
      tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
      $transaction: transactionRunner(tx),
    } as unknown as PrismaService);

    await service.create('tenant-a', 'witness-a', {
      puestoId: 'puesto-a',
      mesa: 7,
      ...traceabilityInput,
      hasWrittenClaim: true,
      reclamationGround: WitnessReclamationGround.ARITHMETIC_ERROR,
      reclamationDescription:
        '  La suma escrita en el acta no coincide con los renglones verificados.  ',
      e14ImageUrl: 'tenant-a/e14/123e4567-e89b-42d3-a456-426614174001.pdf',
      candidateVotes: 80,
      totalTableVotes: 200,
    });

    expect(tx.witnessReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          hasWrittenClaim: true,
          reclamationGround: WitnessReclamationGround.ARITHMETIC_ERROR,
          reclamationDescription:
            'La suma escrita en el acta no coincide con los renglones verificados.',
        }) as object,
      }),
    );
    expect(JSON.stringify(tx.auditEvent.create.mock.calls)).not.toContain(
      'La suma escrita en el acta',
    );
    expect(JSON.stringify(tx.auditEvent.create.mock.calls)).not.toContain(
      'official',
    );
  });

  it('blocks a reporter from reviewing their own pending report', async () => {
    const tx = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          role: Role.CAMPAIGN_MANAGER,
          divisionId: null,
        }),
      },
      politicalDivision: { findMany: jest.fn() },
      witnessReport: {
        findFirst: jest.fn().mockResolvedValue(report()),
        updateMany: jest.fn(),
      },
      auditEvent: { create: jest.fn() },
    };
    const service = new WitnessService({
      tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
      $transaction: transactionRunner(tx),
    } as unknown as PrismaService);

    await expect(
      service.review('tenant-a', 'witness-a', 'report-pending', {
        status: WitnessReportStatus.ACCEPTED,
        reviewReason: 'La evidencia coincide con el escrutinio.',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.witnessReport.updateMany).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it('blocks acceptance of a legacy report without complete traceability', async () => {
    const legacy = report({
      witnessId: 'witness-legacy',
      credentialType: null,
      credentialReference: null,
      checkedInAt: null,
      e14FormType: null,
      blankVotes: null,
      nullVotes: null,
      unmarkedVotes: null,
      hasWrittenClaim: null,
      reclamationGround: null,
      reclamationDescription: null,
    });
    const tx = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          role: Role.COMPLIANCE_OFFICER,
          divisionId: null,
        }),
      },
      politicalDivision: { findMany: jest.fn() },
      witnessReport: {
        findFirst: jest.fn().mockResolvedValue(legacy),
        updateMany: jest.fn(),
      },
      auditEvent: { create: jest.fn() },
    };
    const service = new WitnessService({
      tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
      $transaction: transactionRunner(tx),
    } as unknown as PrismaService);

    await expect(
      service.review('tenant-a', 'reviewer-a', 'report-pending', {
        status: WitnessReportStatus.ACCEPTED,
        reviewReason: 'No existe trazabilidad suficiente para conciliar.',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.witnessReport.updateMany).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it('allows a motivated rejection of a legacy report', async () => {
    const legacy = report({
      witnessId: 'witness-legacy',
      credentialType: null,
      credentialReference: null,
      checkedInAt: null,
      e14FormType: null,
      blankVotes: null,
      nullVotes: null,
      unmarkedVotes: null,
      hasWrittenClaim: null,
      reclamationGround: null,
      reclamationDescription: null,
    });
    const rejected = report({
      ...legacy,
      status: WitnessReportStatus.REJECTED,
      reviewerId: 'reviewer-a',
      reviewReason:
        'Reporte historico rechazado por falta de trazabilidad verificable.',
      reviewedAt: new Date('2026-09-07T12:00:00.000Z'),
      reviewer: { id: 'reviewer-a', name: 'Revisor A' },
    });
    const tx = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          role: Role.COMPLIANCE_OFFICER,
          divisionId: null,
        }),
      },
      politicalDivision: { findMany: jest.fn() },
      witnessReport: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(legacy)
          .mockResolvedValueOnce(rejected),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
    };
    const service = new WitnessService({
      tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
      $transaction: transactionRunner(tx),
    } as unknown as PrismaService);

    await expect(
      service.review('tenant-a', 'reviewer-a', 'report-pending', {
        status: WitnessReportStatus.REJECTED,
        reviewReason:
          'Reporte historico rechazado por falta de trazabilidad verificable.',
      }),
    ).resolves.toEqual(
      expect.objectContaining({ status: WitnessReportStatus.REJECTED }),
    );
    expect(tx.witnessReport.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'report-pending',
          tenantId: 'tenant-a',
          captureContext: WitnessCaptureContext.REAL,
          status: WitnessReportStatus.PENDING,
        },
        data: expect.objectContaining({
          status: WitnessReportStatus.REJECTED,
          reviewerId: 'reviewer-a',
        }) as object,
      }),
    );
  });

  it('atomically supersedes the prior accepted act and accepts the reviewed act', async () => {
    const pending = report({
      captureContext: WitnessCaptureContext.SIMULATION,
    });
    const accepted = report({
      id: 'report-old',
      captureContext: WitnessCaptureContext.SIMULATION,
      witnessId: 'witness-b',
      candidateVotes: 79,
      status: WitnessReportStatus.ACCEPTED,
      reviewerId: 'reviewer-old',
      reviewReason: 'Revision electoral anterior documentada.',
      reviewedAt: new Date('2026-08-30T09:00:00.000Z'),
      reviewer: { id: 'reviewer-old', name: 'Revisor anterior' },
    });
    const reviewed = report({
      status: WitnessReportStatus.ACCEPTED,
      reviewerId: 'reviewer-a',
      reviewReason: 'Coincide con la lectura visual y el total de sufragantes.',
      reviewedAt: new Date('2026-08-30T11:00:00.000Z'),
      captureContext: WitnessCaptureContext.SIMULATION,
      reviewer: { id: 'reviewer-a', name: 'Revisor A' },
    });
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(accepted)
      .mockResolvedValueOnce(reviewed);
    const updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    const tx = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          role: Role.COMPLIANCE_OFFICER,
          divisionId: null,
        }),
      },
      politicalDivision: { findMany: jest.fn() },
      witnessReport: {
        findFirst,
        updateMany,
        findMany: jest.fn().mockResolvedValue([
          {
            candidateVotes: 80,
            totalTableVotes: 200,
            status: WitnessReportStatus.ACCEPTED,
          },
        ]),
      },
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
    };
    const runTransaction = transactionRunner(
      tx,
      PoliticalOperationStage.SIMULATION,
    );
    const service = new WitnessService({
      tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
      $transaction: runTransaction,
    } as unknown as PrismaService);
    const reason = 'Coincide con la lectura visual y el total de sufragantes.';

    const result = await service.review(
      'tenant-a',
      'reviewer-a',
      'report-pending',
      { status: WitnessReportStatus.ACCEPTED, reviewReason: reason },
    );

    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'report-old',
        tenantId: 'tenant-a',
        captureContext: WitnessCaptureContext.SIMULATION,
        status: WitnessReportStatus.ACCEPTED,
      },
      data: {
        status: WitnessReportStatus.SUPERSEDED,
        supersededById: 'report-pending',
      },
    });
    expect(updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          id: 'report-pending',
          tenantId: 'tenant-a',
          captureContext: WitnessCaptureContext.SIMULATION,
          status: WitnessReportStatus.PENDING,
        },
        data: expect.objectContaining({
          status: WitnessReportStatus.ACCEPTED,
          reviewerId: 'reviewer-a',
          reviewReason: reason,
        }) as object,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: WitnessReportStatus.ACCEPTED,
        divergent: false,
      }),
    );
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(tx.auditEvent.create.mock.calls)).not.toContain(
      'e14ImageUrl',
    );
    expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('maps a serialization conflict to HTTP 409', async () => {
    const service = new WitnessService({
      tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
      $transaction: jest.fn().mockRejectedValue({ code: 'P2034' }),
    } as unknown as PrismaService);

    await expect(
      service.review('tenant-a', 'reviewer-a', 'report-a', {
        status: WitnessReportStatus.REJECTED,
        reviewReason: 'Los totales del acta no son legibles ni consistentes.',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('paginates reports, flags divergences and computes metrics only from accepted acts', async () => {
    const pending = report({
      captureContext: WitnessCaptureContext.SIMULATION,
    });
    const accepted = report({
      id: 'report-accepted',
      captureContext: WitnessCaptureContext.SIMULATION,
      witnessId: 'witness-b',
      candidateVotes: 90,
      status: WitnessReportStatus.ACCEPTED,
      reviewerId: 'reviewer-a',
      reviewReason: 'Acta verificada por el equipo juridico electoral.',
      reviewedAt: new Date('2026-08-30T11:00:00.000Z'),
    });
    const witnessCount = jest
      .fn()
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    const witnessGroupBy = jest
      .fn()
      .mockResolvedValueOnce([
        { status: WitnessReportStatus.PENDING, _count: { _all: 2 } },
        { status: WitnessReportStatus.ACCEPTED, _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([
        {
          puestoId: 'puesto-a',
          mesa: 7,
          candidateVotes: 80,
          totalTableVotes: 200,
          status: WitnessReportStatus.PENDING,
        },
        {
          puestoId: 'puesto-a',
          mesa: 7,
          candidateVotes: 90,
          totalTableVotes: 200,
          status: WitnessReportStatus.ACCEPTED,
        },
      ]);
    const tx = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          role: Role.AUDITOR,
          divisionId: null,
        }),
      },
      politicalDivision: {
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(1),
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { expectedTables: 10 } }),
      },
      witnessReport: {
        findMany: jest.fn().mockResolvedValue([pending, accepted]),
        count: witnessCount,
        groupBy: witnessGroupBy,
        aggregate: jest.fn().mockResolvedValue({
          _sum: { candidateVotes: 90, totalTableVotes: 200 },
        }),
      },
    };
    const runTransaction = transactionRunner(
      tx,
      PoliticalOperationStage.SIMULATION,
    );
    const service = new WitnessService({
      tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
      $transaction: runTransaction,
    } as unknown as PrismaService);

    const result = await service.findAll('tenant-a', 'auditor-a', {
      page: 2,
      limit: 2,
    });

    expect(tx.witnessReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 2, take: 2 }),
    );
    expect(result.pagination).toEqual({
      page: 2,
      limit: 2,
      total: 2,
      totalPages: 1,
    });
    expect(result.captureContext).toBe(WitnessCaptureContext.SIMULATION);
    for (const [call] of tx.witnessReport.groupBy.mock.calls) {
      expect(call.where.captureContext).toBe(WitnessCaptureContext.SIMULATION);
    }
    expect(result.items[0]).toEqual(
      expect.objectContaining({ divergent: true, hasEvidence: true }),
    );
    expect(result.summary).toEqual(
      expect.objectContaining({
        totalReports: 3,
        pendingReports: 2,
        acceptedReports: 1,
        pendingDivergences: 1,
        acceptedCandidateVotes: 90,
        acceptedTotalVotes: 200,
        coverage: {
          configuredPlaces: 1,
          totalPlaces: 1,
          acceptedTables: 1,
          expectedTables: 10,
          percentage: 10,
        },
      }),
    );
    expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  });

  it('reads only the REAL context in CLOSED without publishing misleading coverage', async () => {
    const tx = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          role: Role.ADMIN,
          divisionId: null,
        }),
      },
      politicalDivision: {
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(1),
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { expectedTables: 10 } }),
      },
      witnessReport: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1),
        groupBy: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({
          _sum: { candidateVotes: null, totalTableVotes: null },
        }),
      },
    };
    const service = new WitnessService({
      tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
      $transaction: transactionRunner(tx, PoliticalOperationStage.CLOSED),
    } as unknown as PrismaService);

    const result = await service.findAll('tenant-a', 'admin-a', {
      page: 1,
      limit: 25,
    });

    expect(result.captureContext).toBe(WitnessCaptureContext.REAL);
    expect(tx.witnessReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            expect.objectContaining({
              tenantId: 'tenant-a',
              captureContext: WitnessCaptureContext.REAL,
            }),
            expect.any(Object),
          ],
        },
      }),
    );
    expect(result.summary.coverage).toEqual({
      configuredPlaces: 1,
      totalPlaces: 2,
      acceptedTables: 1,
      expectedTables: null,
      percentage: null,
    });
  });

  it('cannot overwrite a territorial scope with a cross-territory puesto filter', async () => {
    const reportFindMany = jest.fn().mockResolvedValue([]);
    const tx = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          role: Role.ZONE_COORDINATOR,
          divisionId: 'zone-a',
        }),
      },
      politicalDivision: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'zone-a', parentId: null },
          { id: 'puesto-a', parentId: 'zone-a' },
          { id: 'puesto-b', parentId: null },
        ]),
        count: jest.fn().mockResolvedValue(1),
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { expectedTables: null } }),
      },
      witnessReport: {
        findMany: reportFindMany,
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({
          _sum: { candidateVotes: null, totalTableVotes: null },
        }),
      },
    };
    const service = new WitnessService({
      tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
      $transaction: transactionRunner(tx),
    } as unknown as PrismaService);

    await service.findAll('tenant-a', 'coordinator-a', {
      puestoId: 'puesto-b',
      page: 1,
      limit: 25,
    });

    expect(reportFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              tenantId: 'tenant-a',
              captureContext: WitnessCaptureContext.REAL,
              puestoId: { in: ['zone-a', 'puesto-a'] },
            },
            { puestoId: 'puesto-b' },
          ],
        },
      }),
    );
  });

  it('refuses a polling-place profile below an already reported table number', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ stage: PoliticalOperationStage.SIMULATION }])
        .mockResolvedValue([{ locked: true }]),
      user: {
        findFirst: jest.fn().mockResolvedValue({
          role: Role.ADMIN,
          divisionId: null,
        }),
      },
      politicalDivision: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'puesto-a',
          code: 'P-001',
          name: 'Colegio Central',
          expectedTables: null,
          sourceNamespace: null,
        }),
        update: jest.fn(),
      },
      witnessReport: {
        aggregate: jest.fn().mockResolvedValue({ _max: { mesa: 8 } }),
      },
      auditEvent: { create: jest.fn() },
    };
    const service = new WitnessService({
      tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
      $transaction: transactionRunner(tx),
    } as unknown as PrismaService);

    await expect(
      service.updatePollingPlaceProfile('tenant-a', 'admin-a', 'puesto-a', {
        expectedTables: 7,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.witnessReport.aggregate).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        captureContext: WitnessCaptureContext.SIMULATION,
        puestoId: 'puesto-a',
      },
      _max: { mesa: true },
    });
    expect(tx.politicalDivision.update).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it('keeps expected tables immutable for an active official RNEC polling place', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ stage: PoliticalOperationStage.SIMULATION }])
        .mockResolvedValue([{ locked: true }]),
      user: {
        findFirst: jest.fn().mockResolvedValue({
          role: Role.ADMIN,
          divisionId: null,
        }),
      },
      politicalDivision: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'puesto-a',
          code: 'RNEC_DIVIPOLE:01/001/01/01',
          name: 'Colegio Central',
          expectedTables: 8,
          sourceNamespace: ElectoralCodeNamespace.RNEC_DIVIPOLE,
        }),
        update: jest.fn(),
      },
      witnessReport: { aggregate: jest.fn() },
      auditEvent: { create: jest.fn() },
    };
    const service = new WitnessService({
      tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
      $transaction: transactionRunner(tx),
    } as unknown as PrismaService);

    await expect(
      service.updatePollingPlaceProfile('tenant-a', 'admin-a', 'puesto-a', {
        expectedTables: 9,
      }),
    ).rejects.toThrow(
      'Las mesas de un puesto oficial RNEC solo pueden cambiar mediante un nuevo release electoral autorizado',
    );
    expect(tx.witnessReport.aggregate).not.toHaveBeenCalled();
    expect(tx.politicalDivision.update).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it('blocks every E-14 operation before data access in public-office mode', async () => {
    const transaction = jest.fn();
    const service = new WitnessService({
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
          type: TenantType.PUBLIC_OFFICE,
        }),
      },
      $transaction: transaction,
    } as unknown as PrismaService);

    await expect(
      service.findAll('tenant-office', 'admin-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each([TenantType.PARTY, TenantType.GSC])(
    'blocks candidate-vote E-14 access for tenant type %s before data access',
    async (type) => {
      const transaction = jest.fn();
      const service = new WitnessService({
        tenant: {
          findUnique: jest.fn().mockResolvedValue({
            defaultMode: PoliticalOperationMode.CAMPAIGN,
            type,
          }),
        },
        $transaction: transaction,
      } as unknown as PrismaService);

      await expect(
        service.findAll('tenant-from-token', 'admin-a'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(transaction).not.toHaveBeenCalled();
    },
  );
});
