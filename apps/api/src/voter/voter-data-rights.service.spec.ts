import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  DivisionType,
  PoliticalOperationMode,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { VoterController } from './voter.controller';
import {
  VOTER_DATA_RIGHTS_ROLES,
  VoterDataRightsService,
} from './voter-data-rights.service';

const campaignTenant = {
  defaultMode: PoliticalOperationMode.CAMPAIGN,
  type: TenantType.CANDIDACY,
};

const admin: AuthenticatedUser = {
  userId: 'admin-a',
  tenantId: 'tenant-a',
  role: Role.ADMIN,
};

const voter = {
  id: 'voter-a',
  documentId: '1012345678',
  firstName: 'Ana',
  lastName: 'Rojas',
  phone: '3001234567',
  email: 'ana@example.test',
  mesa: 12,
  consentAccepted: true,
  consentTimestamp: new Date('2026-05-01T15:00:00.000Z'),
  termsVersion: '2026.1',
  createdAt: new Date('2026-05-01T15:00:00.000Z'),
  updatedAt: new Date('2026-05-02T15:00:00.000Z'),
  puesto: { id: 'puesto-a', name: 'Colegio Central' },
  registrar: { name: 'Equipo territorial' },
};

function buildTransaction() {
  return {
    tenant: {
      findUnique: jest.fn().mockResolvedValue(campaignTenant),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({
        role: Role.ADMIN,
        divisionId: null,
      }),
    },
    politicalDivision: {
      findMany: jest.fn(),
      findFirst: jest.fn().mockResolvedValue({ id: 'puesto-a' }),
    },
    voter: {
      findFirst: jest.fn().mockResolvedValue(voter),
      update: jest.fn().mockResolvedValue(voter),
    },
    auditEvent: {
      create: jest.fn().mockResolvedValue({ id: 'audit-a' }),
    },
  };
}

function buildService(transaction = buildTransaction()) {
  const runTransaction = jest.fn(
    async (callback: (client: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
  );
  const service = new VoterDataRightsService({
    $transaction: runTransaction,
  } as unknown as PrismaService);

  return { service, transaction, runTransaction };
}

function assertAuditContainsNoRawPii(auditCall: unknown): void {
  const serialized = JSON.stringify(auditCall);
  for (const rawPii of [
    voter.documentId,
    voter.firstName,
    voter.lastName,
    voter.phone,
    voter.email,
    voter.puesto.name,
    voter.registrar.name,
  ]) {
    expect(serialized).not.toContain(rawPii);
  }
}

describe('VoterDataRightsService', () => {
  it('limita los tres endpoints a ADMIN y COMPLIANCE_OFFICER tambien en metadata', () => {
    expect(VOTER_DATA_RIGHTS_ROLES).toEqual([
      Role.ADMIN,
      Role.COMPLIANCE_OFFICER,
    ]);
    expect(
      Reflect.getMetadata(ROLES_KEY, VoterController.prototype.findOne),
    ).toEqual(VOTER_DATA_RIGHTS_ROLES);
    expect(
      Reflect.getMetadata(ROLES_KEY, VoterController.prototype.exportPortable),
    ).toEqual(VOTER_DATA_RIGHTS_ROLES);
    expect(
      Reflect.getMetadata(ROLES_KEY, VoterController.prototype.update),
    ).toEqual(VOTER_DATA_RIGHTS_ROLES);
  });

  it('entrega la ficha con PII solo dentro del tenant JWT y audita el acceso', async () => {
    const { service, transaction, runTransaction } = buildService();

    await expect(service.findOne(admin, 'voter-a')).resolves.toEqual(voter);

    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(transaction.tenant.findUnique).toHaveBeenCalledWith({
      where: { id: 'tenant-a' },
      select: { defaultMode: true, type: true },
    });
    expect(transaction.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'admin-a', tenantId: 'tenant-a', isActive: true },
      select: { role: true, divisionId: true },
    });
    expect(transaction.voter.findFirst).toHaveBeenCalledWith({
      where: { id: 'voter-a', tenantId: 'tenant-a' },
      select: expect.objectContaining({
        id: true,
        documentId: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
      }),
    });
    expect(transaction.auditEvent.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
        actorType: AuditActorType.USER,
        actorUserId: 'admin-a',
        action: 'VOTER_PII_VIEWED',
        resourceType: 'Voter',
        resourceId: 'voter-a',
        metadata: { operation: 'DETAIL' },
      },
    });
    assertAuditContainsNoRawPii(transaction.auditEvent.create.mock.calls[0]);
  });

  it('autoriza usando el rol activo persistido, no el rol del JWT', async () => {
    const allowed = buildTransaction();
    allowed.user.findFirst.mockResolvedValue({
      role: Role.COMPLIANCE_OFFICER,
      divisionId: null,
    });
    await expect(
      buildService(allowed).service.findOne(
        { ...admin, role: Role.ADMIN },
        'voter-a',
      ),
    ).resolves.toEqual(voter);

    const denied = buildTransaction();
    denied.user.findFirst.mockResolvedValue({
      role: Role.CAMPAIGN_MANAGER,
      divisionId: null,
    });
    const deniedService = buildService(denied).service;
    await expect(
      deniedService.findOne({ ...admin, role: Role.ADMIN }, 'voter-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(denied.voter.findFirst).not.toHaveBeenCalled();
    expect(denied.auditEvent.create).not.toHaveBeenCalled();
  });

  it('falla cerrado si el actor ya no esta activo en el tenant', async () => {
    const transaction = buildTransaction();
    transaction.user.findFirst.mockResolvedValue(null);
    const { service } = buildService(transaction);

    await expect(
      service.exportPortable(admin, 'voter-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'admin-a', tenantId: 'tenant-a', isActive: true },
      select: { role: true, divisionId: true },
    });
    expect(transaction.voter.findFirst).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('rechaza la ficha fuera del modo de campana antes de consultar PII', async () => {
    const transaction = buildTransaction();
    transaction.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
      type: TenantType.PUBLIC_OFFICE,
    });
    const { service } = buildService(transaction);

    await expect(service.findOne(admin, 'voter-a')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(transaction.user.findFirst).not.toHaveBeenCalled();
    expect(transaction.voter.findFirst).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('no filtra la existencia de un ciudadano de otro tenant', async () => {
    const transaction = buildTransaction();
    transaction.voter.findFirst.mockResolvedValue(null);
    const { service } = buildService(transaction);

    await expect(
      service.findOne(admin, 'voter-from-tenant-b'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction.voter.findFirst).toHaveBeenCalledWith({
      where: { id: 'voter-from-tenant-b', tenantId: 'tenant-a' },
      select: expect.any(Object),
    });
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('exporta JSON portable sin campos internos y deja un audit sin PII', async () => {
    const { service, transaction } = buildService();

    const result = await service.exportPortable(admin, 'voter-a');

    expect(result).toEqual({
      schemaVersion: 'politica-sostenible.voter-export.v1',
      exportedAt: expect.any(String),
      voter: {
        id: voter.id,
        documentId: voter.documentId,
        firstName: voter.firstName,
        lastName: voter.lastName,
        phone: voter.phone,
        email: voter.email,
        mesa: voter.mesa,
        consentAccepted: voter.consentAccepted,
        consentTimestamp: voter.consentTimestamp,
        termsVersion: voter.termsVersion,
        createdAt: voter.createdAt,
        updatedAt: voter.updatedAt,
        puesto: { name: voter.puesto.name },
      },
    });
    expect(result.exportedAt).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(result.exportedAt))).toBe(false);
    expect(result.voter).not.toHaveProperty('tenantId');
    expect(result.voter).not.toHaveProperty('registrarId');
    expect(result.voter).not.toHaveProperty('consentIp');
    expect(result.voter).not.toHaveProperty('signatureImageUrl');
    expect(result.voter).not.toHaveProperty('registrar');
    expect(result.voter.puesto).not.toHaveProperty('id');
    expect(transaction.voter.findFirst).toHaveBeenCalledWith({
      where: { id: 'voter-a', tenantId: 'tenant-a' },
      select: expect.objectContaining({
        puesto: { select: { name: true } },
      }),
    });
    const exportSelect = transaction.voter.findFirst.mock.calls[0]?.[0].select;
    expect(exportSelect).not.toHaveProperty('registrar');
    expect(transaction.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        actorUserId: 'admin-a',
        action: 'VOTER_DATA_EXPORTED',
        resourceType: 'Voter',
        resourceId: 'voter-a',
        metadata: {
          format: 'JSON',
          schemaVersion: 'politica-sostenible.voter-export.v1',
        },
      }),
    });
    assertAuditContainsNoRawPii(transaction.auditEvent.create.mock.calls[0]);
  });

  it('corrige campos validados de forma atomica y nunca confia en tenant del body', async () => {
    const transaction = buildTransaction();
    transaction.voter.update.mockResolvedValue({
      ...voter,
      firstName: 'Ana Maria',
      email: 'ana.nueva@example.test',
    });
    const { service, runTransaction } = buildService(transaction);

    const dtoWithAttackerTenant = {
      firstName: 'Ana Maria',
      email: 'ana.nueva@example.test',
      puestoId: 'puesto-b',
      tenantId: 'tenant-b',
      registrarId: 'attacker',
      consentAccepted: false,
    } as never;
    await service.update(admin, 'voter-a', dtoWithAttackerTenant);

    expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(transaction.politicalDivision.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'puesto-b',
        tenantId: 'tenant-a',
        type: DivisionType.PUESTO,
      },
      select: { id: true },
    });
    expect(transaction.voter.update).toHaveBeenCalledWith({
      where: { id: 'voter-a', tenantId: 'tenant-a' },
      data: {
        firstName: 'Ana Maria',
        email: 'ana.nueva@example.test',
        puestoId: 'puesto-b',
      },
      select: expect.any(Object),
    });
    const auditCall = transaction.auditEvent.create.mock.calls[0];
    expect(auditCall).toEqual([
      {
        data: expect.objectContaining({
          tenantId: 'tenant-a',
          actorUserId: 'admin-a',
          action: 'VOTER_DATA_CORRECTED',
          resourceType: 'Voter',
          resourceId: 'voter-a',
          metadata: {
            changedFields: ['email', 'firstName', 'puestoId'],
          },
        }),
      },
    ]);
    expect(JSON.stringify(auditCall)).not.toContain('Ana Maria');
    expect(JSON.stringify(auditCall)).not.toContain('ana.nueva@example.test');
    expect(JSON.stringify(auditCall)).not.toContain('tenant-b');
    expect(JSON.stringify(auditCall)).not.toContain('attacker');
  });

  it('permite corregir el puesto sin alterar una mesa no incluida en el body', async () => {
    const { service, transaction } = buildService();

    await service.update(admin, 'voter-a', { puestoId: null });

    expect(transaction.politicalDivision.findFirst).not.toHaveBeenCalled();
    expect(transaction.voter.update).toHaveBeenCalledWith({
      where: { id: 'voter-a', tenantId: 'tenant-a' },
      data: { puestoId: null },
      select: expect.any(Object),
    });
    expect(transaction.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: { changedFields: ['puestoId'] },
      }),
    });
  });

  it('rechaza cuerpo vacio antes de abrir una transaccion', async () => {
    const { service, runTransaction } = buildService();

    await expect(service.update(admin, 'voter-a', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('no muta ni genera un audit falso cuando los valores no cambiaron', async () => {
    const { service, transaction } = buildService();

    await expect(
      service.update(admin, 'voter-a', {
        firstName: voter.firstName,
        phone: voter.phone,
        mesa: voter.mesa,
        puestoId: voter.puesto.id,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.voter.update).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('ignora campos de autoridad aunque se invoque el servicio sin ValidationPipe', async () => {
    const { service, runTransaction } = buildService();

    await expect(
      service.update(admin, 'voter-a', {
        tenantId: 'tenant-b',
        registrarId: 'attacker',
        consentAccepted: false,
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('rechaza un puesto ajeno o inexistente sin corregir ni auditar', async () => {
    const transaction = buildTransaction();
    transaction.politicalDivision.findFirst.mockResolvedValue(null);
    const { service } = buildService(transaction);

    await expect(
      service.update(admin, 'voter-a', { puestoId: 'puesto-tenant-b' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.voter.update).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('convierte una colision de documento en conflicto sin revelar el registro', async () => {
    const transaction = buildTransaction();
    transaction.voter.update.mockRejectedValue({ code: 'P2002' });
    const { service } = buildService(transaction);

    await expect(
      service.update(admin, 'voter-a', { documentId: '1022334455' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('no devuelve PII si no puede persistir el audit del acceso', async () => {
    const transaction = buildTransaction();
    transaction.auditEvent.create.mockRejectedValue(new Error('audit down'));
    const { service } = buildService(transaction);

    await expect(service.findOne(admin, 'voter-a')).rejects.toThrow(
      'audit down',
    );
    expect(transaction.voter.findFirst).toHaveBeenCalledTimes(1);
    expect(transaction.auditEvent.create).toHaveBeenCalledTimes(1);
  });
});
