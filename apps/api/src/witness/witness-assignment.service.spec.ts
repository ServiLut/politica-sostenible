import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  PoliticalOperationMode,
  PoliticalOperationStage,
  Prisma,
  Role,
  TenantType,
  WitnessAssignmentStatus,
  WitnessAssignmentType,
  WitnessCaptureContext,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import type { CreateWitnessAssignmentDto } from './dto/witness-assignment.dto';
import {
  computeWitnessAssignmentPayloadSha256,
  WitnessAssignmentService,
} from './witness-assignment.service';

const admin: AuthenticatedUser = {
  userId: 'admin-a',
  tenantId: 'tenant-a',
  role: Role.ADMIN,
};

const createDto: CreateWitnessAssignmentDto = {
  clientRequestId: '11111111-1111-4111-8111-111111111111',
  coverageWindowId: 'window-a',
  witnessId: 'witness-a',
  puestoId: 'place-a',
  tableStart: 1,
  tableEnd: 6,
  shiftStartsAt: '2027-10-31T13:00:00.000Z',
  shiftEndsAt: '2027-10-31T21:00:00.000Z',
  captureContext: WitnessCaptureContext.REAL,
  assignmentType: WitnessAssignmentType.PRIMARY,
};

function profile(
  stage: PoliticalOperationStage = PoliticalOperationStage.CAMPAIGN,
) {
  return {
    id: 'profile-a',
    tenantId: admin.tenantId,
    stage,
    electionDate: new Date('2027-10-31T00:00:00.000Z'),
    votingStartDate: new Date('2027-10-31T00:00:00.000Z'),
    votingEndDate: new Date('2027-10-31T00:00:00.000Z'),
    updatedAt: new Date('2026-09-09T12:00:00.000Z'),
  };
}

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'assignment-a',
    tenantId: admin.tenantId,
    operationProfileId: 'profile-a',
    coverageWindowId: 'window-a',
    clientRequestId: createDto.clientRequestId,
    payloadSha256: computeWitnessAssignmentPayloadSha256(createDto),
    captureContext: createDto.captureContext,
    puestoId: createDto.puestoId,
    tableStart: createDto.tableStart,
    tableEnd: createDto.tableEnd,
    shiftStartsAt: new Date(createDto.shiftStartsAt),
    shiftEndsAt: new Date(createDto.shiftEndsAt),
    assignmentType: createDto.assignmentType,
    status: WitnessAssignmentStatus.PLANNED,
    witnessId: createDto.witnessId,
    confirmedAt: null,
    confirmationClientRequestId: null,
    confirmationPayloadSha256: null,
    cancelledAt: null,
    cancellationClientRequestId: null,
    cancellationPayloadSha256: null,
    cancellationReason: null,
    supersedesAssignmentId: null,
    version: 1,
    createdAt: new Date('2026-09-09T12:00:00.000Z'),
    updatedAt: new Date('2026-09-09T12:00:00.000Z'),
    witness: {
      id: createDto.witnessId,
      name: 'Testigo Reservado',
      role: Role.WITNESS,
      isActive: true,
      divisionId: 'place-a',
    },
    puesto: {
      id: 'place-a',
      code: '001',
      name: 'Colegio A',
      type: 'PUESTO',
      isActive: true,
      expectedTables: 6,
      votingDate: new Date('2027-10-31T00:00:00.000Z'),
      timeZone: 'America/Bogota',
    },
    coverageWindow: {
      id: 'window-a',
      localDate: new Date('2027-10-31T00:00:00.000Z'),
      startsAt: new Date('2027-10-31T12:00:00.000Z'),
      endsAt: new Date('2027-10-31T22:00:00.000Z'),
      timeZone: 'America/Bogota',
      utcOffsetMinutes: -300,
      version: 1,
    },
    ...overrides,
  };
}

function buildTransaction(actorRole: Role = Role.ADMIN) {
  const transaction = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        type: TenantType.CANDIDACY,
        defaultMode: PoliticalOperationMode.CAMPAIGN,
      }),
    },
    operationProfile: {
      findUnique: jest.fn().mockResolvedValue(profile()),
    },
    user: {
      findFirst: jest.fn().mockImplementation(({ where }: { where: any }) => {
        if (where.id === admin.userId) {
          return Promise.resolve({ role: actorRole, divisionId: null });
        }
        if (where.id === createDto.witnessId) {
          return Promise.resolve({
            id: createDto.witnessId,
            role: Role.WITNESS,
            isActive: true,
            divisionId: 'place-a',
          });
        }
        return Promise.resolve(null);
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    politicalDivision: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'place-a',
        expectedTables: 6,
        votingDate: new Date('2027-10-31T00:00:00.000Z'),
        timeZone: 'America/Bogota',
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    witnessCoverageWindow: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue({
        id: 'window-a',
        startsAt: new Date('2027-10-31T12:00:00.000Z'),
        endsAt: new Date('2027-10-31T22:00:00.000Z'),
      }),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'window-a',
          puestoId: 'place-a',
          localDate: new Date('2027-10-31T00:00:00.000Z'),
          startsAt: new Date('2027-10-31T12:00:00.000Z'),
          endsAt: new Date('2027-10-31T22:00:00.000Z'),
          timeZone: 'America/Bogota',
          utcOffsetMinutes: -300,
        },
      ]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    witnessCoverageWindowCommand: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'command-a' }),
    },
    witnessAssignment: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve(assignment(data)),
        ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
    $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
  };
  return transaction;
}

function buildService(transaction = buildTransaction()) {
  const runTransaction = jest.fn(
    async (callback: (client: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
  );
  return {
    transaction,
    runTransaction,
    service: new WitnessAssignmentService({
      $transaction: runTransaction,
    } as never),
  };
}

describe('WitnessAssignmentService', () => {
  it('creates an explicit zone-aware window and an append-only command receipt', async () => {
    const tx = buildTransaction();
    tx.witnessCoverageWindow.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'window-a',
          tenantId: admin.tenantId,
          operationProfileId: 'profile-a',
          clientRequestId: data.clientRequestId,
          payloadSha256: data.payloadSha256,
          captureContext: data.captureContext,
          puestoId: data.puestoId,
          localDate: data.localDate,
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          timeZone: data.timeZone,
          utcOffsetMinutes: data.utcOffsetMinutes,
          version: 1,
          createdAt: new Date('2026-09-09T12:00:00.000Z'),
          updatedAt: new Date('2026-09-09T12:00:00.000Z'),
          puesto: {
            id: 'place-a',
            code: '001',
            name: 'Colegio A',
            expectedTables: 6,
            votingDate: new Date('2027-10-31T00:00:00.000Z'),
            timeZone: 'America/Bogota',
            isActive: true,
          },
        }),
    );
    const { service } = buildService(tx);

    await expect(
      service.createCoverageWindow(admin, {
        clientRequestId: '44444444-4444-4444-8444-444444444444',
        puestoId: 'place-a',
        captureContext: WitnessCaptureContext.REAL,
        localDate: '2027-10-31',
        startsAt: '2027-10-31T12:00:00.000Z',
        endsAt: '2027-10-31T22:00:00.000Z',
        timeZone: 'America/Bogota',
        utcOffsetMinutes: -300,
      }),
    ).resolves.toMatchObject({
      id: 'window-a',
      localDate: '2027-10-31',
      timeZone: 'America/Bogota',
      utcOffsetMinutes: -300,
    });
    expect(tx.witnessCoverageWindow.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: admin.tenantId }),
      }),
    );
    expect(tx.witnessCoverageWindowCommand.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: admin.tenantId,
        coverageWindowId: 'window-a',
        type: 'CREATE',
      }),
    });
  });

  it('creates under tenant/lifecycle advisory locks and stores no client tenant', async () => {
    const { service, transaction, runTransaction } = buildService();

    const result = await service.create(admin, createDto);

    expect(result).toMatchObject({
      id: 'assignment-a',
      status: WitnessAssignmentStatus.PLANNED,
      version: 1,
      witness: { id: createDto.witnessId },
    });
    expect(runTransaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }),
    );
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(2);
    expect(transaction.witnessAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: admin.tenantId,
          operationProfileId: 'profile-a',
          payloadSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    );
    const auditPayload = transaction.auditEvent.create.mock.calls[0][0].data;
    expect(auditPayload).toMatchObject({
      tenantId: admin.tenantId,
      action: 'WITNESS_ASSIGNMENT_CREATED',
      resourceType: 'WitnessAssignment',
    });
    expect(JSON.stringify(auditPayload)).not.toContain('Testigo Reservado');
    expect(JSON.stringify(auditPayload.after)).not.toContain(
      createDto.witnessId,
    );
  });

  it('returns an idempotent create replay and rejects payload substitution', async () => {
    const tx = buildTransaction();
    tx.witnessAssignment.findUnique.mockResolvedValue(assignment());
    const { service } = buildService(tx);

    await expect(service.create(admin, createDto)).resolves.toMatchObject({
      id: 'assignment-a',
    });
    expect(tx.witnessAssignment.create).not.toHaveBeenCalled();

    await expect(
      service.create(admin, { ...createDto, tableEnd: 5 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects table overlap before writing and leaves audit untouched', async () => {
    const tx = buildTransaction();
    tx.witnessAssignment.findFirst
      .mockResolvedValueOnce({ id: 'conflicting-table' })
      .mockResolvedValueOnce(null);
    const { service } = buildService(tx);

    await expect(service.create(admin, createDto)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'WITNESS_TABLE_SHIFT_OVERLAP',
      }),
    });
    expect(tx.witnessAssignment.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it('enforces optimistic concurrency when confirming', async () => {
    const tx = buildTransaction();
    tx.witnessAssignment.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(assignment());
    tx.witnessAssignment.updateMany.mockResolvedValue({ count: 0 });
    const { service } = buildService(tx);

    await expect(
      service.confirm(admin, 'assignment-a', {
        clientRequestId: '22222222-2222-4222-8222-222222222222',
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'WITNESS_ASSIGNMENT_VERSION_CONFLICT',
      }),
    });
  });

  it('does not let a witness confirm another witness assignment', async () => {
    const tx = buildTransaction(Role.WITNESS);
    tx.user.findFirst.mockImplementation(({ where }: { where: any }) => {
      if (where.id === admin.userId) {
        return Promise.resolve({ role: Role.WITNESS, divisionId: null });
      }
      return Promise.resolve(null);
    });
    tx.witnessAssignment.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(assignment({ witnessId: 'witness-other' }));
    const { service } = buildService(tx);

    await expect(
      service.confirm(admin, 'assignment-a', {
        clientRequestId: '22222222-2222-4222-8222-222222222222',
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks mutations in POST_ELECTION and CLOSED at the service fence', async () => {
    for (const stage of [
      PoliticalOperationStage.POST_ELECTION,
      PoliticalOperationStage.CLOSED,
    ]) {
      const tx = buildTransaction();
      tx.operationProfile.findUnique.mockResolvedValue(profile(stage));
      const { service } = buildService(tx);
      await expect(service.create(admin, createDto)).rejects.toMatchObject({
        response: expect.objectContaining({ currentStage: stage }),
      });
      expect(tx.witnessAssignment.create).not.toHaveBeenCalled();
    }
  });

  it('calculates exact gaps tenant-scoped and ignores inactive witnesses', async () => {
    const tx = buildTransaction();
    tx.politicalDivision.findMany.mockResolvedValue([
      { id: 'place-a', code: '001', name: 'Colegio A', expectedTables: 6 },
    ]);
    tx.witnessAssignment.findMany.mockResolvedValue([
      {
        coverageWindowId: 'window-a',
        puestoId: 'place-a',
        tableStart: 1,
        tableEnd: 6,
        shiftStartsAt: new Date('2027-10-31T12:00:00.000Z'),
        shiftEndsAt: new Date('2027-10-31T22:00:00.000Z'),
        assignmentType: WitnessAssignmentType.PRIMARY,
        status: WitnessAssignmentStatus.CONFIRMED,
        witness: { role: Role.WITNESS, isActive: true },
      },
      {
        coverageWindowId: 'window-a',
        puestoId: 'place-a',
        tableStart: 1,
        tableEnd: 2,
        shiftStartsAt: new Date('2027-10-31T12:00:00.000Z'),
        shiftEndsAt: new Date('2027-10-31T22:00:00.000Z'),
        assignmentType: WitnessAssignmentType.BACKUP,
        status: WitnessAssignmentStatus.CONFIRMED,
        witness: { role: Role.WITNESS, isActive: false },
      },
    ]);
    const { service } = buildService(tx);

    const result = await service.coverage(admin, {
      captureContext: WitnessCaptureContext.REAL,
      page: 1,
      limit: 20,
    });

    expect(result.summary).toMatchObject({
      expectedTables: 6,
      confirmedPrimaryTables: 6,
      confirmedBackupTables: 0,
      missingBackupTables: 6,
      ineligibleAssignmentCount: 1,
      fullyConfirmed: false,
    });
    expect(tx.witnessAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: admin.tenantId }),
      }),
    );
  });

  it('reassigns by cancelling the source and creating one linked replacement', async () => {
    const tx = buildTransaction();
    tx.witnessAssignment.findFirst.mockResolvedValueOnce(assignment());
    const { service } = buildService(tx);
    const replacementDto = {
      ...createDto,
      clientRequestId: '33333333-3333-4333-8333-333333333333',
      witnessId: 'witness-a',
      expectedVersion: 1,
      reason: 'Relevo documentado por indisponibilidad confirmada.',
    };

    await service.reassign(admin, 'assignment-a', replacementDto);

    expect(tx.witnessAssignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ version: 1 }),
        data: expect.objectContaining({
          status: WitnessAssignmentStatus.CANCELLED,
          version: { increment: 1 },
        }),
      }),
    );
    expect(tx.witnessAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          supersedesAssignmentId: 'assignment-a',
        }),
      }),
    );
  });
});
