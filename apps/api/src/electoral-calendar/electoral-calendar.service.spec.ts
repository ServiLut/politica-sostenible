import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  ElectoralCalendarCommandType,
  ElectoralCalendarReleaseStatus,
  ElectoralCircumscriptionType,
  ElectoralContestType,
  PoliticalOperationMode,
  PoliticalOperationStage,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import type { ValidateElectoralCalendarReleaseDto } from './dto/electoral-calendar.dto';
import { computeElectoralCalendarCommandSha256 } from './electoral-calendar.hash';
import { ElectoralCalendarService } from './electoral-calendar.service';

const tenantId = 'tenant-calendar';
const actorId = 'reviewer-calendar';
const releaseId = '123e4567-e89b-42d3-a456-426614174001';
const clientRequestId = '123e4567-e89b-42d3-a456-426614174002';
const user: AuthenticatedUser = { tenantId, userId: actorId };

function profile(
  stage: PoliticalOperationStage = PoliticalOperationStage.PRE_CAMPAIGN,
) {
  return {
    id: 'profile-calendar',
    stage,
    electionType: ElectoralContestType.MAYORALTY,
    electionDate: new Date('2099-06-01T00:00:00.000Z'),
    circumscriptionType: ElectoralCircumscriptionType.MUNICIPAL,
    circumscriptionName: 'Municipio de prueba',
    circumscriptionCode: '05001',
  };
}

function release(createdById = actorId) {
  return {
    id: releaseId,
    tenantId,
    operationProfileId: 'profile-calendar',
    initialCommandId: '123e4567-e89b-42d3-a456-426614174003',
    basedOnReleaseId: null,
    electionType: ElectoralContestType.MAYORALTY,
    electionDate: new Date('2099-06-01T00:00:00.000Z'),
    circumscriptionType: ElectoralCircumscriptionType.MUNICIPAL,
    circumscriptionName: 'Municipio de prueba',
    circumscriptionCode: '05001',
    roundCode: 'UNICA',
    versionLabel: 'Corte inicial',
    status: ElectoralCalendarReleaseStatus.STAGED,
    sourceAuthority: 'Autoridad competente',
    sourceUrl: 'https://authority.invalid/calendar',
    sourceReference: 'Acto de prueba',
    sourcePublishedAt: new Date('2099-01-01T00:00:00.000Z'),
    sourceCutoffAt: new Date('2099-01-02T00:00:00.000Z'),
    sourceSha256: 'a'.repeat(64),
    createdById,
    validatedById: null,
    validatedAt: null,
    activatedById: null,
    activatedAt: null,
    supersededAt: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function validationDto(): ValidateElectoralCalendarReleaseDto {
  const base = {
    clientRequestId,
    expectedVersion: 1,
    sourceReviewedAcknowledged: true,
    rationale: 'Revision independiente y documentada de toda la fuente',
  };
  return {
    ...base,
    payloadSha256: computeElectoralCalendarCommandSha256('RELEASE_VALIDATE', {
      releaseId,
      ...base,
    }),
  };
}

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        defaultMode: PoliticalOperationMode.CAMPAIGN,
        type: TenantType.CANDIDACY,
      }),
    },
    user: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: actorId, role: Role.AUDITOR }),
    },
    operationProfile: { findUnique: jest.fn().mockResolvedValue(profile()) },
    electoralCalendarCommand: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: data.id,
          clientRequestId: data.clientRequestId,
          payloadSha256: data.payloadSha256,
          type: data.type,
          actorUserId: data.actorUserId,
          resourceType: data.resourceType,
          resourceId: data.resourceId,
          createdAt: new Date(),
        }),
      ),
    },
    electoralCalendarRelease: {
      findFirst: jest.fn().mockResolvedValue(release()),
      updateMany: jest.fn(),
    },
    electoralCalendarReleaseDecision: { create: jest.fn() },
    auditEvent: { create: jest.fn() },
    ...overrides,
  };
}

function prismaFor(tx: ReturnType<typeof transaction>) {
  return {
    $transaction: jest.fn(
      (
        callback: (
          transactionClient: ReturnType<typeof transaction>,
        ) => Promise<unknown>,
      ) => callback(tx),
    ),
  };
}

describe('ElectoralCalendarService safety fences', () => {
  it('rejects validation by the person who staged the release', async () => {
    const tx = transaction();
    const prisma = prismaFor(tx);
    const service = new ElectoralCalendarService(prisma as never);
    await expect(
      service.validateRelease(user, releaseId, validationDto()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.electoralCalendarReleaseDecision.create).not.toHaveBeenCalled();
  });

  it('revalidates CLOSED inside the serializable transaction before commands', async () => {
    const tx = transaction({
      operationProfile: {
        findUnique: jest
          .fn()
          .mockResolvedValue(profile(PoliticalOperationStage.CLOSED)),
      },
    });
    const prisma = prismaFor(tx);
    const service = new ElectoralCalendarService(prisma as never);
    await expect(
      service.validateRelease(user, releaseId, validationDto()),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'OPERATION_CLOSED' }),
    });
    expect(tx.electoralCalendarCommand.create).not.toHaveBeenCalled();
  });

  it('rejects a reused idempotency key with altered content', async () => {
    const dto = validationDto();
    const tx = transaction();
    tx.electoralCalendarCommand.findFirst.mockResolvedValue({
      id: '123e4567-e89b-42d3-a456-426614174004',
      clientRequestId,
      payloadSha256: 'b'.repeat(64),
      type: ElectoralCalendarCommandType.RELEASE_VALIDATE,
      actorUserId: actorId,
      resourceType: 'ElectoralCalendarRelease',
      resourceId: releaseId,
      createdAt: new Date(),
    });
    const service = new ElectoralCalendarService(prismaFor(tx) as never);
    await expect(
      service.validateRelease(user, releaseId, dto),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns an honest empty command-center state when no profile exists', async () => {
    const service = new ElectoralCalendarService({
      operationProfile: { findUnique: jest.fn().mockResolvedValue(null) },
    } as never);
    await expect(
      service.getCommandCenterSummary(tenantId),
    ).resolves.toMatchObject({
      configured: false,
      activeReleaseId: null,
      upcoming30Days: [],
      overdue: [],
    });
  });
});
