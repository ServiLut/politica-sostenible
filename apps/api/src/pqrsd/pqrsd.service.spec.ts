import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  PqrsdRulePackageStatus,
  PqrsdRuleReviewDecision,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import type { PrismaService } from '../prisma/prisma.service';
import type { ReviewPqrsdRulePackageDto } from './dto/pqrsd.dto';
import { computePqrsdCommandSha256 } from './pqrsd.hash';
import { PqrsdService } from './pqrsd.service';

describe('PqrsdService security and privacy boundaries', () => {
  const publicUser: AuthenticatedUser = {
    tenantId: 'tenant-public',
    userId: 'actor-a',
    role: Role.ADMIN,
  };
  let tenantType: TenantType;
  let transaction: Record<string, any>;
  let packageFindFirst: jest.Mock;
  let packageFindMany: jest.Mock;
  let dossierFindMany: jest.Mock;
  let commandFindUnique: jest.Mock;
  let prisma: { $transaction: jest.Mock };
  let service: PqrsdService;

  beforeEach(() => {
    tenantType = TenantType.PUBLIC_OFFICE;
    packageFindFirst = jest.fn();
    packageFindMany = jest.fn().mockResolvedValue([]);
    dossierFindMany = jest.fn().mockResolvedValue([]);
    commandFindUnique = jest.fn().mockResolvedValue(null);
    transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
      tenant: {
        findUnique: jest
          .fn()
          .mockImplementation(() =>
            Promise.resolve({ id: publicUser.tenantId, type: tenantType }),
          ),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: publicUser.userId,
          role: Role.ADMIN,
        }),
        findMany: packageFindMany,
      },
      pqrsdRulePackage: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: packageFindFirst,
        updateMany: jest.fn(),
      },
      pqrsdDossier: { findMany: dossierFindMany },
      pqrsdCommand: {
        findUnique: commandFindUnique,
        create: jest.fn(),
      },
      pqrsdRulePackageDecision: { create: jest.fn() },
      auditEvent: { create: jest.fn() },
    };
    prisma = {
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    service = new PqrsdService(prisma as unknown as PrismaService);
  });

  it('returns only masked petitioner fields in list queries and exposes honest external-state flags', async () => {
    const result = await service.overview(publicUser, { limit: 25 });
    const dossierQuery = transaction.pqrsdDossier.findMany.mock.calls[0][0];

    expect(dossierQuery.where).toEqual({ tenantId: publicUser.tenantId });
    expect(dossierQuery.select.petitioner.select).toEqual({
      maskedFullName: true,
      maskedDocumentNumber: true,
      maskedEmail: true,
      maskedPhone: true,
    });
    expect(result).toMatchObject({
      scope: 'PUBLIC_OFFICE_PQRSD_ONLY',
      configurationReady: false,
      institutionalStatus: 'CONFIGURATION_REQUIRED',
      externalDeliveryAutomated: false,
      privacy: {
        listDataMasked: true,
        detailAccessAudited: true,
        campaignDataReuse: false,
        exportEnabled: false,
      },
    });
    expect(transaction).not.toHaveProperty('operationProfile');
  });

  it('rejects campaign tenants without consulting an OperationProfile', async () => {
    tenantType = TenantType.CANDIDACY;

    await expect(service.overview(publicUser, {})).rejects.toThrow(
      ForbiddenException,
    );
    expect(transaction.pqrsdRulePackage.findMany).not.toHaveBeenCalled();
  });

  it('emits exact deep links for operational risk instead of replacing missing deadlines with zero', async () => {
    packageFindMany.mockResolvedValue([
      { id: 'package-a', status: PqrsdRulePackageStatus.ACTIVE },
    ]);
    dossierFindMany.mockResolvedValue([
      {
        id: 'dossier-alert',
        reference: 'PQRSD-INT-ALERT',
        status: 'AUTHORIZED',
        riskLevel: 'HIGH',
        petitioner: { maskedFullName: 'A***' },
        currentPrimaryAssignee: {
          id: 'worker-a',
          name: 'Gestor inactivo',
          isActive: false,
        },
        currentBackupAssignee: {
          id: 'worker-b',
          name: 'Suplente',
          isActive: true,
        },
        classifications: [
          {
            categoryLabel: 'General',
            competence: 'COMPETENT',
            department: 'Atencion',
            review: { decision: 'APPROVE' },
          },
        ],
        deadlines: [],
      },
    ]);

    const result = await service.overview(publicUser, {});
    const codes = result.alerts.map(({ code }) => code);
    const href = '/dashboard/pqrsd?view=detail&entityId=dossier-alert';

    expect(codes).toEqual(
      expect.arrayContaining([
        'PQRSD_ASSIGNMENT_INCOMPLETE',
        'PQRSD_AUTHORIZED_UNDELIVERED',
        'PQRSD_HIGH_RISK',
        'PQRSD_DEADLINE_REQUIRES_REVIEW',
      ]),
    );
    expect(
      result.alerts.every(
        (alert) => alert.href === href && alert.remainingBusinessDays === null,
      ),
    ).toBe(true);
  });

  it('rejects a mismatched canonical command hash before opening a transaction', async () => {
    await expect(
      service.createDossier(publicUser, {
        clientRequestId: '11d77591-c443-4362-8b48-3297466e0c52',
        payloadSha256: '0'.repeat(64),
        scopeKey: 'GENERAL',
        receivedAt: '2026-09-09T15:00:00.000Z',
        receivedTimeZone: 'America/Bogota',
        receivedChannel: 'Ventanilla',
        subject: 'Solicitud de informacion',
        description: 'Hechos suficientes para registrar la solicitud.',
        acknowledgementRequired: true,
        riskLevel: 'NORMAL' as never,
        petitioner: {
          fullName: 'Persona solicitante',
          preferredChannel: 'Correo electronico',
        },
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('enforces four-eyes even when the client claims an approval', async () => {
    packageFindFirst.mockResolvedValue({
      id: 'package-a',
      tenantId: publicUser.tenantId,
      scopeKey: 'GENERAL',
      status: PqrsdRulePackageStatus.DRAFT,
      revision: 1,
      createdById: publicUser.userId,
      rules: [{ id: 'rule-a' }],
    });
    const input = {
      clientRequestId: '1c675b63-2a3c-489e-8c7d-df07cf86f040',
      decision: PqrsdRuleReviewDecision.APPROVE_ACTIVATE,
      rationale: 'Revision independiente supuestamente aprobada.',
      expectedRevision: 1,
    };
    const dto: ReviewPqrsdRulePackageDto = {
      ...input,
      payloadSha256: computePqrsdCommandSha256('RULE_PACKAGE_REVIEW', {
        ...input,
        packageId: 'package-a',
      }),
    };

    await expect(
      service.reviewRulePackage(publicUser, 'package-a', dto),
    ).rejects.toThrow(ForbiddenException);
    expect(transaction.pqrsdRulePackageDecision.create).not.toHaveBeenCalled();
  });

  it('replays the exact same idempotent command without creating a second decision', async () => {
    const input = {
      clientRequestId: '47e0c0e8-d3fe-458b-ab62-bcdce8772753',
      decision: PqrsdRuleReviewDecision.REJECT,
      rationale: 'La fuente normativa no acredita la vigencia indicada.',
      expectedRevision: 1,
    };
    const digest = computePqrsdCommandSha256('RULE_PACKAGE_REVIEW', {
      ...input,
      packageId: 'package-a',
    });
    commandFindUnique.mockResolvedValue({
      commandType: 'RULE_PACKAGE_REVIEW',
      payloadSha256: digest,
      actorId: publicUser.userId,
      resultSnapshot: { id: 'package-a', status: 'REJECTED', revision: 2 },
    });

    await expect(
      service.reviewRulePackage(publicUser, 'package-a', {
        ...input,
        payloadSha256: digest,
      }),
    ).resolves.toEqual({ id: 'package-a', status: 'REJECTED', revision: 2 });
    expect(transaction.pqrsdRulePackage.findFirst).not.toHaveBeenCalled();
    expect(transaction.pqrsdRulePackageDecision.create).not.toHaveBeenCalled();
  });
});
