import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  PoliticalOperationMode,
  PoliticalOperationStage,
  Role,
  ScrutinyDeclarationReviewDecision,
  ScrutinyDocumentReviewDecision,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import type { PrismaService } from '../prisma/prisma.service';
import type {
  CreateScrutinyCommissionDto,
  CreateScrutinyDeclarationDto,
  ReviewScrutinyDeclarationDto,
  ReviewScrutinyDocumentDto,
} from './dto/scrutiny.dto';
import { computeScrutinyCommandSha256 } from './scrutiny.hash';
import { ScrutinyService } from './scrutiny.service';

const user: AuthenticatedUser = {
  tenantId: 'tenant-a',
  userId: 'reviewer-a',
  role: Role.ADMIN,
};

function command<T extends object>(
  type: Parameters<typeof computeScrutinyCommandSha256>[0],
  input: T,
  binding: object = {},
) {
  return {
    ...input,
    payloadSha256: computeScrutinyCommandSha256(type, { ...input, ...binding }),
  };
}

function transactionContext(overrides: Record<string, unknown> = {}) {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        type: TenantType.CANDIDACY,
        defaultMode: PoliticalOperationMode.CAMPAIGN,
      }),
    },
    user: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: user.userId, role: Role.ADMIN }),
    },
    operationProfile: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'profile-a',
        stage: PoliticalOperationStage.POST_ELECTION,
      }),
    },
    scrutinyCommand: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    auditEvent: { create: jest.fn() },
    ...overrides,
  };
}

function serviceFor(transaction: ReturnType<typeof transactionContext>) {
  const prisma = {
    $transaction: jest.fn((callback: (client: unknown) => unknown) =>
      callback(transaction),
    ),
  } as unknown as PrismaService;
  return { service: new ScrutinyService(prisma), prisma };
}

describe('ScrutinyService security boundaries', () => {
  it('rejects a non-canonical hash before opening a database transaction', async () => {
    const transaction = transactionContext();
    const { service, prisma } = serviceFor(transaction);
    const dto = {
      clientRequestId: '6e927194-7a8f-4d4c-aabd-99b2ead3627d',
      payloadSha256: '0'.repeat(64),
      code: 'AUX-01',
      level: 'AUXILIARY',
      name: 'Comisión auxiliar uno',
      scopeCode: '11001',
      scopeName: 'Bogotá',
      venue: 'Sede central',
      timeZone: 'America/Bogota',
      scheduledStartsAt: '2026-10-26T13:00:00.000Z',
      scheduledEndsAt: '2026-10-26T18:00:00.000Z',
      calendarSourceUrl: 'https://authority.invalid/calendar',
      calendarSourceReference: 'Resolución de integración 001',
      legalLeadUserId: user.userId,
      escalationRoute:
        'Escalar por teléfono seguro al responsable jurídico y registrar cada decisión en el expediente.',
      contingencyPlan:
        'Usar formatos numerados sin conexión, sellarlos y reconciliarlos antes de cualquier digitación.',
    } as CreateScrutinyCommissionDto;

    await expect(service.createCommission(user, dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('prevents a document creator from reviewing their own evidence', async () => {
    const scrutinyDocument = {
      findFirst: jest.fn().mockResolvedValue({
        id: 'document-a',
        version: 1,
        reviewStatus: 'PENDING',
        createdById: user.userId,
      }),
      updateMany: jest.fn(),
    };
    const transaction = transactionContext({
      scrutinyDocument,
    });
    const { service } = serviceFor(transaction);
    const input = {
      clientRequestId: '67a1b51a-45ac-40ca-8e41-4922cab82310',
      decision: ScrutinyDocumentReviewDecision.APPROVE,
      reason: 'Se contrastó la huella y la autoridad que expidió el documento.',
      expectedVersion: 1,
    };
    const dto = command('DOCUMENT_REVIEW', input, {
      documentId: 'document-a',
    }) as ReviewScrutinyDocumentDto;

    await expect(
      service.reviewDocument(user, 'document-a', dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(scrutinyDocument.updateMany).not.toHaveBeenCalled();
  });

  it('never creates a declaration from an internal or unreviewed document', async () => {
    const scrutinyDeclaration = { create: jest.fn() };
    const transaction = transactionContext({
      scrutinyCommission: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'commission-a', status: 'ACTIVE' }),
      },
      scrutinyDocument: { findFirst: jest.fn().mockResolvedValue(null) },
      scrutinyDeclaration,
    });
    const { service } = serviceFor(transaction);
    const input = {
      clientRequestId: '3b69a25d-063c-45f4-97a2-ac6f8899828b',
      commissionId: 'commission-a',
      scopeReference: 'Bogotá D.C.',
      authority: 'Comisión escrutadora distrital',
      authorityReference: 'E-26 DIST-001',
      declaredAt: '2026-10-28T16:00:00.000Z',
      officialDocumentId: 'internal-document-a',
      lines: [
        {
          optionCode: '001',
          optionLabel: 'Lista de integración',
          votes: 1234,
          declaredStatus: 'DECLARADA',
        },
      ],
    };
    const dto = command(
      'DECLARATION_CREATE',
      input,
    ) as CreateScrutinyDeclarationDto;

    await expect(service.createDeclaration(user, dto)).rejects.toThrow(
      /un dato interno no sirve/i,
    );
    expect(scrutinyDeclaration.create).not.toHaveBeenCalled();
  });

  it('revalidates CLOSED under the lifecycle lock before a four-eyes mutation', async () => {
    const transaction = transactionContext();
    transaction.operationProfile.findUnique.mockResolvedValue({
      id: 'profile-a',
      stage: PoliticalOperationStage.CLOSED,
    });
    const { service } = serviceFor(transaction);
    const input = {
      clientRequestId: 'f2a8dfb7-c5af-4231-ad49-660ef7d65dcb',
      expectedVersion: 1,
      decision: ScrutinyDeclarationReviewDecision.APPROVE,
      reviewNote:
        'Documento y líneas contrastados por una persona independiente.',
    };
    const dto = command('DECLARATION_REVIEW', input, {
      declarationId: 'declaration-a',
    }) as ReviewScrutinyDeclarationDto;

    await expect(
      service.reviewDeclaration(user, 'declaration-a', dto),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(2);
    expect(transaction.scrutinyCommand.findUnique).not.toHaveBeenCalled();
  });
});
