import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  AuditActorType,
  ConsentPurpose,
  PoliticalOperationMode,
  Role,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { ConsentNoticesService } from './consent-notices.service';

const admin: AuthenticatedUser = {
  tenantId: 'tenant-from-jwt',
  userId: 'admin-from-jwt',
  role: Role.ADMIN,
};

const dto = {
  version: 'campaign-2026-09-v1',
  title: 'Autorizacion para comunicaciones politicas',
  content:
    'Autorizo de manera previa, expresa e informada el tratamiento de mis datos para las finalidades comunicadas y conozco como ejercer mis derechos.',
  controllerName: 'Organizacion ciudadana responsable',
  contactEmail: 'privacidad@example.test',
  privacyPolicyUrl: 'https://example.test/privacidad',
};

function buildTransaction() {
  return {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        defaultMode: PoliticalOperationMode.CAMPAIGN,
      }),
    },
    user: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: admin.userId, role: Role.ADMIN }),
    },
    consentNotice: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'notice-new',
          mode: data.mode,
          purpose: data.purpose,
          version: data.version,
          title: data.title,
          content: data.content,
          controllerName: data.controllerName,
          contactEmail: data.contactEmail,
          privacyPolicyUrl: data.privacyPolicyUrl ?? null,
          activatedAt: data.activatedAt,
        }),
      ),
    },
    consentRecord: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    voter: { updateMany: jest.fn().mockResolvedValue({ count: 17 }) },
    auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
  };
}

function buildService(transaction = buildTransaction()) {
  const runTransaction = jest.fn(
    async (callback: (client: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
  );
  return {
    transaction,
    runTransaction,
    service: new ConsentNoticesService({
      $transaction: runTransaction,
    } as unknown as PrismaService),
  };
}

describe('ConsentNoticesService', () => {
  it('activates a tenant-owned version, invalidates current voter flags and audits without notice content', async () => {
    const { transaction, runTransaction, service } = buildService();

    const result = await service.activate(admin, dto);

    expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(transaction.tenant.findUnique).toHaveBeenCalledWith({
      where: { id: 'tenant-from-jwt' },
      select: { defaultMode: true },
    });
    expect(transaction.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'admin-from-jwt',
        tenantId: 'tenant-from-jwt',
        isActive: true,
      },
      select: { id: true, role: true },
    });
    expect(transaction.consentNotice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-from-jwt',
          mode: PoliticalOperationMode.CAMPAIGN,
          purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
          version: dto.version,
          createdById: 'admin-from-jwt',
        }),
      }),
    );
    expect(transaction.consentRecord.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-from-jwt',
        mode: PoliticalOperationMode.CAMPAIGN,
        purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
        noticeVersion: dto.version,
      },
      select: { id: true },
    });
    expect(transaction.voter.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-from-jwt', consentAccepted: true },
      data: { consentAccepted: false },
    });
    expect(transaction.auditEvent.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-from-jwt',
        mode: PoliticalOperationMode.CAMPAIGN,
        actorType: AuditActorType.USER,
        actorUserId: 'admin-from-jwt',
        action: 'CONSENT_NOTICE_ACTIVATED',
        resourceType: 'ConsentNotice',
        resourceId: 'notice-new',
        before: undefined,
        after: {
          version: dto.version,
          mode: PoliticalOperationMode.CAMPAIGN,
          purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
        },
        metadata: {
          invalidatedVoterCount: 17,
          configuredFields: [
            'contactEmail',
            'content',
            'controllerName',
            'privacyPolicyUrl',
            'title',
          ],
        },
      },
    });
    const serializedAudit = JSON.stringify(
      transaction.auditEvent.create.mock.calls,
    );
    expect(serializedAudit).not.toContain(dto.content);
    expect(serializedAudit).not.toContain(dto.contactEmail);
    expect(result).toMatchObject({
      configured: true,
      mode: PoliticalOperationMode.CAMPAIGN,
      purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
      notice: { id: 'notice-new', version: dto.version },
    });
  });

  it('revalidates the stored admin role before reading or writing notices', async () => {
    const transaction = buildTransaction();
    transaction.user.findFirst.mockResolvedValue({
      id: admin.userId,
      role: Role.COMPLIANCE_OFFICER,
    });
    const { service } = buildService(transaction);

    await expect(service.activate(admin, dto)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(transaction.consentNotice.findFirst).not.toHaveBeenCalled();
    expect(transaction.consentNotice.create).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('does not overwrite or re-audit an exact retry of the active version', async () => {
    const transaction = buildTransaction();
    transaction.consentNotice.findFirst.mockResolvedValue({
      id: 'notice-current',
      mode: PoliticalOperationMode.CAMPAIGN,
      purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
      ...dto,
      activatedAt: new Date('2026-09-04T12:00:00.000Z'),
    });
    const { service } = buildService(transaction);

    await expect(service.activate(admin, dto)).resolves.toMatchObject({
      configured: true,
      notice: { id: 'notice-current', version: dto.version },
    });
    expect(transaction.consentNotice.findUnique).not.toHaveBeenCalled();
    expect(transaction.consentNotice.update).not.toHaveBeenCalled();
    expect(transaction.consentNotice.create).not.toHaveBeenCalled();
    expect(transaction.voter.updateMany).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('rejects reuse of a retired version to preserve historical evidence', async () => {
    const transaction = buildTransaction();
    transaction.consentNotice.findUnique.mockResolvedValue({
      id: 'notice-retired',
    });
    const { service } = buildService(transaction);

    await expect(service.activate(admin, dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(transaction.consentNotice.create).not.toHaveBeenCalled();
    expect(transaction.voter.updateMany).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('rejects a version already attached to legacy consent evidence', async () => {
    const transaction = buildTransaction();
    transaction.consentRecord.findFirst.mockResolvedValue({
      id: 'legacy-consent-record',
    });
    const { service } = buildService(transaction);

    await expect(service.activate(admin, dto)).rejects.toThrow(
      'La version indicada ya pertenece al historial de avisos o autorizaciones',
    );
    expect(transaction.consentRecord.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-from-jwt',
        mode: PoliticalOperationMode.CAMPAIGN,
        purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
        noticeVersion: dto.version,
      },
      select: { id: true },
    });
    expect(transaction.consentNotice.update).not.toHaveBeenCalled();
    expect(transaction.consentNotice.create).not.toHaveBeenCalled();
    expect(transaction.voter.updateMany).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('reads only the active notice for the authenticated organization mode', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
        }),
      },
      consentNotice: { findFirst },
    };
    const service = new ConsentNoticesService(
      prisma as unknown as PrismaService,
    );

    await expect(service.getCurrent(admin)).resolves.toEqual({
      configured: false,
      mode: PoliticalOperationMode.PUBLIC_OFFICE,
      purpose: ConsentPurpose.SERVICE_FOLLOW_UP,
      notice: null,
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-from-jwt',
          mode: PoliticalOperationMode.PUBLIC_OFFICE,
          purpose: ConsentPurpose.SERVICE_FOLLOW_UP,
          isActive: true,
        },
      }),
    );
  });
});
