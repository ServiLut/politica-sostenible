import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  FinanceApprovalDecision,
  FinanceCloseoutCommandType,
  FinanceReportKind,
  PoliticalOperationMode,
  PoliticalOperationStage,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ApproveFinanceReportVersionDto,
  CreateFinanceDossierDto,
} from './dto/finance-closeout.dto';
import { computeFinanceCloseoutCommandSha256 } from './finance-closeout.hash';
import { FinanceCloseoutService } from './finance-closeout.service';

const tenantId = 'tenant-finance-a';
const manager: AuthenticatedUser = {
  tenantId,
  userId: 'finance-manager-a',
  role: Role.FINANCE_MANAGER,
};

function baseTransaction(
  stage: PoliticalOperationStage = PoliticalOperationStage.CAMPAIGN,
) {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        type: TenantType.CANDIDACY,
        defaultMode: PoliticalOperationMode.CAMPAIGN,
      }),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({
        id: manager.userId,
        role: Role.FINANCE_MANAGER,
      }),
    },
    operationProfile: {
      findUnique: jest.fn().mockResolvedValue({ id: 'profile-a', stage }),
    },
    financeCloseoutCommand: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'command-a' }),
    },
    financeReportDossier: {
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
          ...data,
          createdAt: new Date('2026-09-09T12:00:00.000Z'),
        })),
    },
    financeReportVersion: { findFirst: jest.fn() },
    financeReportApproval: { create: jest.fn() },
    auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
  };
}

function serviceWith(transaction: ReturnType<typeof baseTransaction>) {
  return new FinanceCloseoutService({
    $transaction: jest.fn(
      async (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  } as unknown as PrismaService);
}

function dossierDto(overrides: Partial<CreateFinanceDossierDto> = {}) {
  const input = {
    clientRequestId: '123e4567-e89b-42d3-a456-426614174000',
    kind: FinanceReportKind.CANDIDATE,
    subjectCode: 'CAND-1',
    subjectName: 'Candidatura uno',
    ...overrides,
  };
  return {
    ...input,
    payloadSha256: computeFinanceCloseoutCommandSha256(
      FinanceCloseoutCommandType.DOSSIER_CREATE,
      input,
    ),
  } as CreateFinanceDossierDto;
}

describe('FinanceCloseoutService critical boundaries', () => {
  it('rejects a forged payload hash before opening a transaction', async () => {
    const runTransaction = jest.fn();
    const service = new FinanceCloseoutService({
      $transaction: runTransaction,
    } as unknown as PrismaService);

    await expect(
      service.createDossier(manager, {
        ...dossierDto(),
        payloadSha256: '0'.repeat(64),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('derives tenant, profile and actor from JWT context and records an audit command', async () => {
    const transaction = baseTransaction();
    const service = serviceWith(transaction);
    const dto = dossierDto();

    const result = await service.createDossier(manager, dto);

    expect(result).toMatchObject({
      kind: FinanceReportKind.CANDIDATE,
      subjectCode: 'CAND-1',
    });
    expect(transaction.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: manager.userId,
        tenantId,
        isActive: true,
        role: { in: [Role.CAMPAIGN_MANAGER, Role.FINANCE_MANAGER] },
      },
      select: { id: true, role: true },
    });
    expect(transaction.financeReportDossier.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId,
        operationProfileId: 'profile-a',
        createdById: manager.userId,
      }),
    });
    expect(transaction.financeCloseoutCommand.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId,
        actorUserId: manager.userId,
        payloadSha256: dto.payloadSha256,
      }),
    });
    expect(transaction.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId,
        actorUserId: manager.userId,
        action: 'FINANCE_CLOSEOUT_DOSSIER_CREATE',
        metadata: expect.objectContaining({
          officialPlatformIntegration: false,
        }),
      }),
    });
  });

  it('blocks an exact mutation retry after CLOSED inside the locked transaction', async () => {
    const transaction = baseTransaction(PoliticalOperationStage.CLOSED);
    const service = serviceWith(transaction);

    await expect(
      service.createDossier(manager, dossierDto()),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(2);
    expect(
      transaction.financeCloseoutCommand.findUnique,
    ).not.toHaveBeenCalled();
    expect(transaction.financeReportDossier.create).not.toHaveBeenCalled();
  });

  it('replays an identical command without a second domain write', async () => {
    const transaction = baseTransaction();
    const dto = dossierDto();
    transaction.financeCloseoutCommand.findUnique.mockResolvedValue({
      type: FinanceCloseoutCommandType.DOSSIER_CREATE,
      payloadSha256: dto.payloadSha256,
      actorUserId: manager.userId,
      resultSnapshot: {
        id: 'dossier-existing',
        kind: FinanceReportKind.CANDIDATE,
        subjectCode: 'CAND-1',
        subjectName: 'Candidatura uno',
      },
    });
    const service = serviceWith(transaction);

    await expect(service.createDossier(manager, dto)).resolves.toMatchObject({
      id: 'dossier-existing',
    });
    expect(transaction.financeReportDossier.create).not.toHaveBeenCalled();
    expect(transaction.financeCloseoutCommand.create).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('prevents the preparer from approving their own immutable version', async () => {
    const transaction = baseTransaction();
    transaction.financeReportDossier.create = jest.fn();
    transaction.financeReportVersion.findFirst.mockResolvedValue({
      id: '123e4567-e89b-42d3-a456-426614174001',
      dossierId: '123e4567-e89b-42d3-a456-426614174002',
      createdById: manager.userId,
      approvals: [],
      ledgerCut: {
        id: '123e4567-e89b-42d3-a456-426614174003',
        periodStartsAt: new Date('2026-01-01T00:00:00.000Z'),
        periodEndsAt: new Date('2026-08-31T00:00:00.000Z'),
        cutoffAt: new Date('2026-09-01T00:00:00.000Z'),
        entryCount: 1,
      },
    });
    const service = serviceWith(transaction);
    const input = {
      clientRequestId: '123e4567-e89b-42d3-a456-426614174010',
      decision: FinanceApprovalDecision.APPROVE,
      rationale: 'Revision contable completa e independiente.',
      versionId: '123e4567-e89b-42d3-a456-426614174001',
    };
    const dto = {
      clientRequestId: input.clientRequestId,
      decision: input.decision,
      rationale: input.rationale,
      payloadSha256: computeFinanceCloseoutCommandSha256(
        FinanceCloseoutCommandType.REPORT_APPROVAL_RECORD,
        input,
      ),
    } as ApproveFinanceReportVersionDto;

    await expect(
      service.approveReportVersion(manager, input.versionId, dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction.financeReportApproval.create).not.toHaveBeenCalled();
  });
});
