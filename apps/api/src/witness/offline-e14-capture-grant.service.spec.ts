import { ConfigService } from '@nestjs/config';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  PoliticalOperationMode,
  PoliticalOperationStage,
  Role,
  TenantType,
  WitnessCaptureContext,
} from '../../prisma/generated/prisma';
import * as planLimits from '../auth/guards/plan-limits.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { electionOperatingWindowSha256 } from '../operation-profile/election-operating-window';
import {
  OfflineE14CaptureGrantService,
  type ResolvedOfflineE14Grant,
} from './offline-e14-capture-grant.service';

const SECRET = 'offline-e14-test-secret-that-is-over-thirty-two-bytes';
const USER: AuthenticatedUser = {
  tenantId: 'tenant-a',
  userId: 'user-a',
  role: Role.WITNESS,
};
const ELECTION_DATE = new Date('2026-09-20T00:00:00.000Z');

function config(secret = SECRET) {
  return {
    get: jest.fn((key: string) =>
      key === 'OFFLINE_SYNC_HMAC_SECRET' ? secret : undefined,
    ),
  } as unknown as ConfigService;
}

function provisionFixture(
  stage: PoliticalOperationStage = PoliticalOperationStage.SIMULATION,
  profileOverrides: Record<string, unknown> = {},
) {
  const profile = {
    id: 'profile-a',
    stage,
    electionDate: ELECTION_DATE,
    votingStartDate: ELECTION_DATE,
    votingEndDate: ELECTION_DATE,
    votingWindowSourceUrl: null,
    votingWindowReference: null,
    ...profileOverrides,
  };
  const actor = {
    id: USER.userId,
    role: Role.ADMIN,
    divisionId: null,
    authVersion: 7,
  };
  const places = [
    {
      id: 'puesto-a',
      code: 'P-001',
      name: 'Colegio A',
      expectedTables: 12,
      sourceReleaseId: 'release-a',
      sourceLocationCode: '1001',
      votingDate: ELECTION_DATE,
      timeZone: 'America/Bogota',
      address: 'Calle 1',
      commune: 'Comuna 1',
    },
    {
      id: 'puesto-b',
      code: 'P-002',
      name: 'Colegio B',
      expectedTables: 8,
      sourceReleaseId: 'release-a',
      sourceLocationCode: '1002',
      votingDate: ELECTION_DATE,
      timeZone: 'America/Bogota',
      address: null,
      commune: null,
    },
  ];
  const transaction = {
    $queryRaw: jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([profile]),
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        defaultMode: PoliticalOperationMode.CAMPAIGN,
        type: TenantType.CANDIDACY,
      }),
    },
    user: { findFirst: jest.fn().mockResolvedValue(actor) },
    politicalDivision: { findMany: jest.fn().mockResolvedValue(places) },
    offlineE14CaptureGrant: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({ id: 'grant-a' }),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
  };
  const prisma = {
    $transaction: jest.fn(
      async (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  } as unknown as PrismaService;
  return { profile, actor, places, transaction, prisma };
}

function resolvedGrant(
  overrides: Partial<ResolvedOfflineE14Grant> = {},
): ResolvedOfflineE14Grant {
  return {
    grantId: 'grant-a',
    tokenHmac: 'a'.repeat(64),
    captureContext: WitnessCaptureContext.SIMULATION,
    actorUserId: USER.userId,
    operationProfileId: 'profile-a',
    userAuthVersion: 7,
    roleAtIssue: Role.ADMIN,
    electionDate: ELECTION_DATE,
    votingStartDate: ELECTION_DATE,
    votingEndDate: ELECTION_DATE,
    electionWindowSha256: electionOperatingWindowSha256({
      tenantId: USER.tenantId,
      operationProfileId: 'profile-a',
      electionDate: ELECTION_DATE,
      votingStartDate: ELECTION_DATE,
      votingEndDate: ELECTION_DATE,
      votingWindowSourceUrl: null,
      votingWindowReference: null,
    }),
    issuedAt: new Date('2026-09-20T11:00:00.000Z'),
    expiresAt: new Date('2026-09-20T23:00:00.000Z'),
    revokedAt: null,
    ...overrides,
  };
}

function mutationTransaction(
  profileStage: PoliticalOperationStage = PoliticalOperationStage.ELECTION_DAY,
  actor = { authVersion: 7, role: Role.ADMIN, divisionId: null },
  profileOverrides: Record<string, unknown> = {},
) {
  return {
    $queryRaw: jest.fn().mockResolvedValue([
      {
        id: 'profile-a',
        stage: profileStage,
        electionDate: ELECTION_DATE,
        votingStartDate: ELECTION_DATE,
        votingEndDate: ELECTION_DATE,
        votingWindowSourceUrl: null,
        votingWindowReference: null,
        ...profileOverrides,
      },
    ]),
    user: { findFirst: jest.fn().mockResolvedValue(actor) },
    politicalDivision: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({
        expectedTables: 12,
        sourceReleaseId: 'release-a',
        sourceLocationCode: '1001',
        votingDate: ELECTION_DATE,
        timeZone: 'America/Bogota',
      }),
    },
    offlineE14CaptureGrantPlace: {
      findUnique: jest.fn().mockResolvedValue({
        expectedTables: 12,
        sourceReleaseIdAtIssue: 'release-a',
        sourceLocationCodeAtIssue: '1001',
        votingDateAtIssue: ELECTION_DATE,
        timeZoneAtIssue: 'America/Bogota',
      }),
    },
    offlineE14CaptureGrant: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

describe('OfflineE14CaptureGrantService', () => {
  beforeEach(() => {
    jest
      .spyOn(planLimits, 'ensureTenantSubscription')
      .mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('fails closed when the HMAC secret is missing or shorter than 32 bytes', () => {
    const prisma = {} as PrismaService;
    expect(
      () => new OfflineE14CaptureGrantService(config('short'), prisma),
    ).toThrow(/al menos 32 bytes/);
    expect(
      () =>
        new OfflineE14CaptureGrantService(
          { get: jest.fn() } as unknown as ConfigService,
          prisma,
        ),
    ).toThrow(/obligatorio/);
  });

  it('provisions an opaque SIMULATION grant from current DB role and tenant scope', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-20T12:00:00.000Z'));
    const fixture = provisionFixture();
    const service = new OfflineE14CaptureGrantService(config(), fixture.prisma);

    const result = await service.provision(USER);

    expect(result).toMatchObject({
      schemaVersion: 3,
      captureContext: WitnessCaptureContext.SIMULATION,
      electionDate: '2026-09-20',
      votingStartDate: '2026-09-20',
      votingEndDate: '2026-09-20',
      electionWindowSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      places: fixture.places.map((place) => ({
        id: place.id,
        code: place.code,
        name: place.name,
        expectedTables: place.expectedTables,
        sourceLocationCode: place.sourceLocationCode,
        votingDate: '2026-09-20',
        timeZone: place.timeZone,
        address: place.address,
        commune: place.commune,
      })),
    });
    expect(result.captureGrant).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.byteLength(result.captureGrant, 'utf8')).toBeLessThanOrEqual(
      43,
    );
    expect(planLimits.ensureTenantSubscription).toHaveBeenCalledWith(
      fixture.prisma,
      USER.tenantId,
    );
    expect(fixture.transaction.politicalDivision.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: USER.tenantId,
          expectedTables: { gt: 0 },
        }) as object,
        take: 5_001,
      }),
    );
    const created =
      fixture.transaction.offlineE14CaptureGrant.create.mock.calls[0][0];
    expect(created.data).toMatchObject({
      tenantId: USER.tenantId,
      actorUserId: USER.userId,
      operationProfileId: 'profile-a',
      userAuthVersion: fixture.actor.authVersion,
      roleAtIssue: fixture.actor.role,
      captureContext: WitnessCaptureContext.SIMULATION,
      issuedStage: PoliticalOperationStage.SIMULATION,
    });
    expect(created.data.tokenHmac).toMatch(/^[0-9a-f]{64}$/);
    expect(created.data.tokenHmac).not.toBe(result.captureGrant);
    expect(created.data.allowedPlaces.create).toEqual(
      fixture.places.map((place) => ({
        tenantId: USER.tenantId,
        puestoId: place.id,
        expectedTables: place.expectedTables,
        sourceReleaseIdAtIssue: place.sourceReleaseId,
        sourceLocationCodeAtIssue: place.sourceLocationCode,
        votingDateAtIssue: place.votingDate,
        timeZoneAtIssue: place.timeZone,
      })),
    );
    const audit = fixture.transaction.auditEvent.create.mock.calls[0][0];
    expect(JSON.stringify(audit)).not.toContain(result.captureGrant);
    expect(JSON.stringify(audit)).not.toContain(created.data.tokenHmac);
    expect(audit.data.metadata).toEqual(
      expect.objectContaining({
        pollingPlaceCount: 2,
        captureContext: WitnessCaptureContext.SIMULATION,
      }),
    );
  });

  it('issues REAL only on the Bogotá civil election date around midnight', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-20T04:59:59.000Z'));
    const mismatch = provisionFixture(PoliticalOperationStage.ELECTION_DAY);
    await expect(
      new OfflineE14CaptureGrantService(config(), mismatch.prisma).provision(
        USER,
      ),
    ).rejects.toMatchObject({
      response: { code: 'E14_OFFLINE_VOTING_WINDOW_NOT_ACTIVE' },
    });

    jest.setSystemTime(new Date('2026-09-20T05:00:00.000Z'));
    const valid = provisionFixture(PoliticalOperationStage.ELECTION_DAY);
    await expect(
      new OfflineE14CaptureGrantService(config(), valid.prisma).provision(USER),
    ).resolves.toMatchObject({
      captureContext: WitnessCaptureContext.REAL,
      electionDate: '2026-09-20',
      votingStartDate: '2026-09-20',
      votingEndDate: '2026-09-20',
      electionWindowSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it('issues REAL on either inclusive boundary of a documented multi-day window', async () => {
    const sourceUrl = 'https://example.test/acto-electoral.pdf';
    const reference = 'Acto documentado de ventana electoral';
    const window = {
      votingStartDate: new Date('2026-09-19T00:00:00.000Z'),
      votingEndDate: new Date('2026-09-21T00:00:00.000Z'),
      votingWindowSourceUrl: sourceUrl,
      votingWindowReference: reference,
    };
    jest.useFakeTimers().setSystemTime(new Date('2026-09-19T05:00:00.000Z'));
    const firstBoundary = provisionFixture(
      PoliticalOperationStage.ELECTION_DAY,
      window,
    );
    for (const place of firstBoundary.places) {
      place.votingDate = new Date('2026-09-19T00:00:00.000Z');
    }
    await expect(
      new OfflineE14CaptureGrantService(
        config(),
        firstBoundary.prisma,
      ).provision(USER),
    ).resolves.toMatchObject({
      captureContext: WitnessCaptureContext.REAL,
      votingStartDate: '2026-09-19',
      votingEndDate: '2026-09-21',
    });

    jest.setSystemTime(new Date('2026-09-22T04:59:59.999Z'));
    const finalBoundary = provisionFixture(
      PoliticalOperationStage.ELECTION_DAY,
      window,
    );
    for (const place of finalBoundary.places) {
      place.votingDate = new Date('2026-09-21T00:00:00.000Z');
    }
    const result = await new OfflineE14CaptureGrantService(
      config(),
      finalBoundary.prisma,
    ).provision(USER);
    expect(result.captureContext).toBe(WitnessCaptureContext.REAL);
    expect(
      JSON.stringify(finalBoundary.transaction.auditEvent.create.mock.calls),
    ).not.toContain(sourceUrl);
    expect(
      JSON.stringify(finalBoundary.transaction.auditEvent.create.mock.calls),
    ).not.toContain(reference);
  });

  it('provisions REAL only for places whose documented local voting day is active', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-19T22:30:00.000Z'));
    const fixture = provisionFixture(PoliticalOperationStage.ELECTION_DAY, {
      votingStartDate: new Date('2026-09-19T00:00:00.000Z'),
      votingEndDate: new Date('2026-09-20T00:00:00.000Z'),
      votingWindowSourceUrl: 'https://example.test/window.pdf',
      votingWindowReference: 'Ventana documentada',
    });
    fixture.places[0].votingDate = new Date('2026-09-20T00:00:00.000Z');
    fixture.places[0].timeZone = 'America/Bogota';
    fixture.places[1].votingDate = new Date('2026-09-20T00:00:00.000Z');
    fixture.places[1].timeZone = 'Europe/Madrid';

    const result = await new OfflineE14CaptureGrantService(
      config(),
      fixture.prisma,
    ).provision(USER);

    expect(result.places).toHaveLength(1);
    expect(result.places[0]).toMatchObject({
      id: 'puesto-b',
      votingDate: '2026-09-20',
      timeZone: 'Europe/Madrid',
    });
    expect(
      fixture.transaction.offlineE14CaptureGrant.create.mock.calls[0][0].data
        .allowedPlaces.create,
    ).toHaveLength(1);
  });

  it('fails closed when REAL scope has no verified polling-place time zone', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-20T12:00:00.000Z'));
    const fixture = provisionFixture(PoliticalOperationStage.ELECTION_DAY);
    for (const place of fixture.places)
      Object.assign(place, { timeZone: null });

    await expect(
      new OfflineE14CaptureGrantService(config(), fixture.prisma).provision(
        USER,
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'E14_OFFLINE_POLLING_PLACE_TIME_ZONE_NOT_VERIFIED',
      },
    });
    expect(
      fixture.transaction.offlineE14CaptureGrant.create,
    ).not.toHaveBeenCalled();
  });

  it('rejects an exact grant when the current documented window snapshot changed', async () => {
    const transaction = mutationTransaction(
      PoliticalOperationStage.ELECTION_DAY,
      { authVersion: 7, role: Role.ADMIN, divisionId: null },
      {
        votingWindowSourceUrl: 'https://example.test/revised-window.pdf',
        votingWindowReference: 'Referencia revisada de la ventana',
      },
    );
    const service = new OfflineE14CaptureGrantService(
      config(),
      {} as PrismaService,
    );

    await expect(
      service.assertUsableForMutation(transaction as never, resolvedGrant(), {
        tenantId: USER.tenantId,
        actorUserId: USER.userId,
        capturedAt: new Date('2026-09-20T12:00:00.000Z'),
        receivedAt: new Date('2026-09-20T13:00:00.000Z'),
        puestoId: 'puesto-a',
        mesa: 7,
      }),
    ).rejects.toMatchObject({
      response: { code: 'E14_OFFLINE_ELECTION_CHANGED' },
    });
  });

  it('rejects REAL capture outside the exact local voting day or after catalog provenance changes', async () => {
    const service = new OfflineE14CaptureGrantService(
      config(),
      {} as PrismaService,
    );
    const common = {
      tenantId: USER.tenantId,
      actorUserId: USER.userId,
      receivedAt: new Date('2026-09-20T13:00:00.000Z'),
      puestoId: 'puesto-a',
      mesa: 7,
    };

    const outsideLocalDay = mutationTransaction();
    outsideLocalDay.offlineE14CaptureGrantPlace.findUnique.mockResolvedValue({
      expectedTables: 12,
      sourceReleaseIdAtIssue: 'release-a',
      sourceLocationCodeAtIssue: '1001',
      votingDateAtIssue: ELECTION_DATE,
      timeZoneAtIssue: 'Europe/Madrid',
    });
    outsideLocalDay.politicalDivision.findFirst.mockResolvedValue({
      expectedTables: 12,
      sourceReleaseId: 'release-a',
      sourceLocationCode: '1001',
      votingDate: ELECTION_DATE,
      timeZone: 'Europe/Madrid',
    });
    await expect(
      service.assertUsableForMutation(
        outsideLocalDay as never,
        resolvedGrant({ captureContext: WitnessCaptureContext.REAL }),
        {
          ...common,
          capturedAt: new Date('2026-09-20T22:30:00.000Z'),
          receivedAt: new Date('2026-09-20T22:40:00.000Z'),
        },
      ),
    ).rejects.toMatchObject({
      response: { code: 'E14_OFFLINE_CAPTURE_OUTSIDE_POLLING_PLACE_DAY' },
    });

    const changed = mutationTransaction();
    changed.politicalDivision.findFirst.mockResolvedValue({
      expectedTables: 12,
      sourceReleaseId: 'release-b',
      sourceLocationCode: '1001',
      votingDate: ELECTION_DATE,
      timeZone: 'America/Bogota',
    });
    await expect(
      service.assertUsableForMutation(
        changed as never,
        resolvedGrant({ captureContext: WitnessCaptureContext.REAL }),
        {
          ...common,
          capturedAt: new Date('2026-09-20T12:00:00.000Z'),
        },
      ),
    ).rejects.toMatchObject({
      response: { code: 'E14_OFFLINE_POLLING_PLACE_CHANGED' },
    });
  });

  it('accepts delayed REAL sync in POST_ELECTION when capture matched the place day and receipt remains inside the documented window', async () => {
    const firstDay = new Date('2026-09-19T00:00:00.000Z');
    const finalDay = new Date('2026-09-21T00:00:00.000Z');
    const profileWindow = {
      votingStartDate: firstDay,
      votingEndDate: finalDay,
      votingWindowSourceUrl: 'https://example.test/window.pdf',
      votingWindowReference: 'Ventana multijornada documentada',
    };
    const transaction = mutationTransaction(
      PoliticalOperationStage.POST_ELECTION,
      { authVersion: 7, role: Role.ADMIN, divisionId: null },
      profileWindow,
    );
    transaction.offlineE14CaptureGrantPlace.findUnique.mockResolvedValue({
      expectedTables: 12,
      sourceReleaseIdAtIssue: 'release-a',
      sourceLocationCodeAtIssue: '1001',
      votingDateAtIssue: firstDay,
      timeZoneAtIssue: 'America/Bogota',
    });
    transaction.politicalDivision.findFirst.mockResolvedValue({
      expectedTables: 12,
      sourceReleaseId: 'release-a',
      sourceLocationCode: '1001',
      votingDate: firstDay,
      timeZone: 'America/Bogota',
    });
    const grant = resolvedGrant({
      captureContext: WitnessCaptureContext.REAL,
      votingStartDate: firstDay,
      votingEndDate: finalDay,
      electionWindowSha256: electionOperatingWindowSha256({
        tenantId: USER.tenantId,
        operationProfileId: 'profile-a',
        electionDate: ELECTION_DATE,
        ...profileWindow,
      }),
      issuedAt: new Date('2026-09-19T10:00:00.000Z'),
      expiresAt: new Date('2026-09-22T04:59:59.999Z'),
    });

    await expect(
      new OfflineE14CaptureGrantService(
        config(),
        {} as PrismaService,
      ).assertUsableForMutation(transaction as never, grant, {
        tenantId: USER.tenantId,
        actorUserId: USER.userId,
        capturedAt: new Date('2026-09-19T12:00:00.000Z'),
        receivedAt: new Date('2026-09-21T12:00:00.000Z'),
        puestoId: 'puesto-a',
        mesa: 7,
      }),
    ).resolves.toBeUndefined();
  });

  it('does not reveal whether a grant belongs to another tenant or actor', async () => {
    const token = 'A'.repeat(43);
    const matchingShape = {
      ...resolvedGrant(),
      id: 'grant-a',
      tenantId: USER.tenantId,
      actorUserId: 'other-user',
      issuedStage: PoliticalOperationStage.SIMULATION,
    };
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([matchingShape]),
    };
    const service = new OfflineE14CaptureGrantService(
      config(),
      {} as PrismaService,
    );

    const error = await service
      .resolveForSync(transaction as never, {
        tenantId: USER.tenantId,
        actorUserId: USER.userId,
        captureGrant: token,
      })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConflictException);
    if (!(error instanceof ConflictException)) throw error;
    expect(error.getResponse()).toEqual({
      code: 'E14_OFFLINE_GRANT_INVALID',
      message: 'La capacidad offline no es valida o no pertenece a la sesion',
    });
    expect(JSON.stringify(error.getResponse())).not.toContain(token);
    const query = transaction.$queryRaw.mock.calls[0][0] as {
      values?: unknown[];
    };
    expect(query.values).toContain(USER.tenantId);
    expect(query.values).not.toContain(token);
  });

  it('keeps a delayed SIMULATION capture isolated after transition to ELECTION_DAY', async () => {
    const transaction = mutationTransaction(
      PoliticalOperationStage.ELECTION_DAY,
    );
    const service = new OfflineE14CaptureGrantService(
      config(),
      {} as PrismaService,
    );

    await expect(
      service.assertUsableForMutation(
        transaction as never,
        resolvedGrant({ captureContext: WitnessCaptureContext.SIMULATION }),
        {
          tenantId: USER.tenantId,
          actorUserId: USER.userId,
          capturedAt: new Date('2026-09-20T12:00:00.000Z'),
          receivedAt: new Date('2026-09-20T13:00:00.000Z'),
          puestoId: 'puesto-a',
          mesa: 7,
        },
      ),
    ).resolves.toBeUndefined();
  });

  it.each([
    {
      name: 'revoked grant',
      grant: resolvedGrant({
        revokedAt: new Date('2026-09-20T12:30:00.000Z'),
      }),
      stage: PoliticalOperationStage.ELECTION_DAY,
      receivedAt: '2026-09-20T13:00:00.000Z',
      code: 'E14_OFFLINE_GRANT_REVOKED',
    },
    {
      name: 'expired grant',
      grant: resolvedGrant({
        expiresAt: new Date('2026-09-20T12:30:00.000Z'),
      }),
      stage: PoliticalOperationStage.ELECTION_DAY,
      receivedAt: '2026-09-20T13:00:00.000Z',
      code: 'E14_OFFLINE_GRANT_EXPIRED',
    },
    {
      name: 'closed operation',
      grant: resolvedGrant(),
      stage: PoliticalOperationStage.CLOSED,
      receivedAt: '2026-09-20T13:00:00.000Z',
      code: 'OPERATION_CLOSED',
    },
    {
      name: 'REAL grant sent from simulation',
      grant: resolvedGrant({
        captureContext: WitnessCaptureContext.REAL,
      }),
      stage: PoliticalOperationStage.SIMULATION,
      receivedAt: '2026-09-20T13:00:00.000Z',
      code: 'E14_OFFLINE_STAGE_TRANSITION_REJECTED',
    },
  ])('rejects $name and keeps the evidence client-side', async (scenario) => {
    const transaction = mutationTransaction(scenario.stage);
    const service = new OfflineE14CaptureGrantService(
      config(),
      {} as PrismaService,
    );
    const error = await service
      .assertUsableForMutation(transaction as never, scenario.grant, {
        tenantId: USER.tenantId,
        actorUserId: USER.userId,
        capturedAt: new Date('2026-09-20T12:00:00.000Z'),
        receivedAt: new Date(scenario.receivedAt),
        puestoId: 'puesto-a',
        mesa: 7,
      })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConflictException);
    if (!(error instanceof ConflictException)) throw error;
    expect(error.getResponse()).toEqual(
      expect.objectContaining({ code: scenario.code }),
    );
  });

  it('revalidates authVersion, role, polling place and table in the same client', async () => {
    const service = new OfflineE14CaptureGrantService(
      config(),
      {} as PrismaService,
    );
    const common = {
      tenantId: USER.tenantId,
      actorUserId: USER.userId,
      capturedAt: new Date('2026-09-20T12:00:00.000Z'),
      receivedAt: new Date('2026-09-20T13:00:00.000Z'),
      puestoId: 'puesto-a',
      mesa: 7,
    };

    const staleActor = mutationTransaction(
      PoliticalOperationStage.ELECTION_DAY,
      {
        authVersion: 8,
        role: Role.ADMIN,
        divisionId: null,
      },
    );
    await expect(
      service.assertUsableForMutation(
        staleActor as never,
        resolvedGrant(),
        common,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const removedPlace = mutationTransaction();
    removedPlace.offlineE14CaptureGrantPlace.findUnique.mockResolvedValue(null);
    await expect(
      service.assertUsableForMutation(
        removedPlace as never,
        resolvedGrant(),
        common,
      ),
    ).rejects.toMatchObject({
      response: { code: 'E14_OFFLINE_POLLING_PLACE_NOT_AUTHORIZED' },
    });

    const tableReduced = mutationTransaction();
    tableReduced.politicalDivision.findFirst.mockResolvedValue({
      expectedTables: 5,
      sourceReleaseId: 'release-a',
      sourceLocationCode: '1001',
      votingDate: ELECTION_DATE,
      timeZone: 'America/Bogota',
    });
    await expect(
      service.assertUsableForMutation(
        tableReduced as never,
        resolvedGrant(),
        common,
      ),
    ).rejects.toMatchObject({
      response: { code: 'E14_OFFLINE_TABLE_NOT_AUTHORIZED' },
    });
  });

  it('marks use tenant-scoped and fails closed if the registered grant changed', async () => {
    const transaction = mutationTransaction();
    const service = new OfflineE14CaptureGrantService(
      config(),
      {} as PrismaService,
    );
    const usedAt = new Date('2026-09-20T13:00:00.000Z');
    await service.markUsed(
      transaction as never,
      USER.tenantId,
      'grant-a',
      usedAt,
    );
    expect(transaction.offlineE14CaptureGrant.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'grant-a',
        tenantId: USER.tenantId,
        revokedAt: null,
      },
      data: { lastUsedAt: usedAt },
    });

    transaction.offlineE14CaptureGrant.updateMany.mockResolvedValue({
      count: 0,
    });
    await expect(
      service.markUsed(transaction as never, USER.tenantId, 'grant-a', usedAt),
    ).rejects.toMatchObject({
      response: { code: 'E14_OFFLINE_GRANT_INVALID' },
    });
  });
});
