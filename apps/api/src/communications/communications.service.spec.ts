import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  CommunicationApprovalStatus,
  CommunicationChannel,
  PoliticalOperationMode,
  Role,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CommunicationsService } from './communications.service';

describe('CommunicationsService approval controls', () => {
  const requester: AuthenticatedUser = {
    userId: 'requester-a',
    tenantId: 'tenant-a',
    role: Role.COMMUNICATIONS_MANAGER,
  };

  let prisma: {
    tenant: { findUnique: jest.Mock };
    user: { findFirst: jest.Mock };
    issueCase: { findFirst: jest.Mock };
    communicationApproval: {
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };
    auditEvent: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: CommunicationsService;

  beforeEach(() => {
    prisma = {
      tenant: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ defaultMode: PoliticalOperationMode.CAMPAIGN }),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'user' }) },
      issueCase: { findFirst: jest.fn().mockResolvedValue({ id: 'case-a' }) },
      communicationApproval: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      (operation: (tx: typeof prisma) => unknown) => operation(prisma),
    );
    service = new CommunicationsService(prisma as unknown as PrismaService);
  });

  it('scopes paginated filters to the JWT tenant and server-side mode', async () => {
    await service.findAll(requester, {
      page: 2,
      limit: 10,
      status: CommunicationApprovalStatus.PENDING,
      channel: CommunicationChannel.EMAIL,
      containsSensitiveData: 'false',
      search: 'rendición',
    });

    const expectedWhere = {
      tenantId: 'tenant-a',
      mode: PoliticalOperationMode.CAMPAIGN,
      status: CommunicationApprovalStatus.PENDING,
      channel: CommunicationChannel.EMAIL,
      containsSensitiveData: false,
      OR: [
        { title: { contains: 'rendición', mode: 'insensitive' } },
        { purpose: { contains: 'rendición', mode: 'insensitive' } },
      ],
    };
    expect(prisma.communicationApproval.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expectedWhere,
        skip: 10,
        take: 10,
      }),
    );
    expect(prisma.communicationApproval.count).toHaveBeenCalledWith({
      where: expectedWhere,
    });
  });

  it('limits a public-office case worker to their own requests', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    const caseWorker = {
      ...requester,
      userId: 'case-worker-a',
      role: Role.CASE_WORKER,
    };

    await service.findAll(caseWorker, { page: 1, limit: 20 });

    expect(prisma.communicationApproval.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          mode: PoliticalOperationMode.PUBLIC_OFFICE,
          requestedById: 'case-worker-a',
        },
      }),
    );
    await expect(
      service.findAll(caseWorker, {
        page: 1,
        limit: 20,
        requestedById: 'another-user',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates a PENDING request and computes the exact SHA-256 server-side', async () => {
    prisma.communicationApproval.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'approval-a',
          ...data,
          issueCaseId: null,
        }),
    );
    const dto = {
      title: '  Informe semanal  ',
      message: '  Avanzamos con hechos verificables.  ',
      channel: CommunicationChannel.SOCIAL_MEDIA,
      purpose: '  Rendición pública de cuentas  ',
      containsSensitiveData: false,
    };

    await service.create(requester, dto);

    const expectedHash = createHash('sha256')
      .update(
        JSON.stringify({ message: 'Avanzamos con hechos verificables.' }),
        'utf8',
      )
      .digest('hex');
    expect(prisma.communicationApproval.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          tenantId: 'tenant-a',
          mode: PoliticalOperationMode.CAMPAIGN,
          issueCaseId: undefined,
          channel: CommunicationChannel.SOCIAL_MEDIA,
          title: 'Informe semanal',
          content: { message: 'Avanzamos con hechos verificables.' },
          contentHash: expectedHash,
          purpose: 'Rendición pública de cuentas',
          containsSensitiveData: false,
          status: CommunicationApprovalStatus.PENDING,
          requestedById: 'requester-a',
        },
      }),
    );

    const auditPayload = prisma.auditEvent.create.mock.calls[0][0];
    const serializedAudit = JSON.stringify(auditPayload);
    expect(serializedAudit).not.toContain('Avanzamos con hechos');
    expect(serializedAudit).not.toContain('Informe semanal');
    expect(serializedAudit).not.toContain('Rendición pública');
    expect(serializedAudit).not.toContain(expectedHash);
    expect(auditPayload.data.after).toEqual({
      status: CommunicationApprovalStatus.PENDING,
      channel: CommunicationChannel.SOCIAL_MEDIA,
      containsSensitiveData: false,
      issueCaseId: null,
    });
  });

  it('rejects a related case outside the tenant/mode/assignment scope', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    prisma.issueCase.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        { ...requester, userId: 'case-worker-a', role: Role.CASE_WORKER },
        {
          title: 'Respuesta a solicitud',
          message: 'La entidad recibió la solicitud.',
          channel: CommunicationChannel.EMAIL,
          purpose: 'Dar respuesta institucional',
          issueCaseId: 'case-from-another-scope',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.issueCase.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'case-from-another-scope',
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.PUBLIC_OFFICE,
        assigneeId: 'case-worker-a',
      },
      select: { id: true },
    });
    expect(prisma.communicationApproval.create).not.toHaveBeenCalled();
  });

  it('requires public-office case workers to link an assigned case', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });

    await expect(
      service.create(
        { ...requester, userId: 'case-worker-a', role: Role.CASE_WORKER },
        {
          title: 'Respuesta a solicitud',
          message: 'La entidad recibió la solicitud.',
          channel: CommunicationChannel.EMAIL,
          purpose: 'Dar respuesta institucional',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.issueCase.findFirst).not.toHaveBeenCalled();
    expect(prisma.communicationApproval.create).not.toHaveBeenCalled();
  });

  it('does not let a communications role bypass case-module access by guessing an id', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });

    await expect(
      service.create(requester, {
        title: 'Respuesta institucional',
        message: 'Contenido general sujeto a revisión.',
        channel: CommunicationChannel.EMAIL,
        purpose: 'Información institucional',
        issueCaseId: 'guessed-case-id',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.issueCase.findFirst).not.toHaveBeenCalled();
    expect(prisma.communicationApproval.create).not.toHaveBeenCalled();
  });

  it('enforces mode-specific roles before creating a request', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });

    await expect(
      service.create(
        { ...requester, role: Role.CAMPAIGN_MANAGER },
        {
          title: 'Mensaje fuera de modo',
          message: 'No debe persistirse.',
          channel: CommunicationChannel.WEB,
          purpose: 'Prueba de acceso',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.communicationApproval.create).not.toHaveBeenCalled();
  });

  it('blocks self-approval under the four-eyes rule', async () => {
    prisma.communicationApproval.findFirst.mockResolvedValue({
      id: 'approval-a',
      status: CommunicationApprovalStatus.PENDING,
      requestedById: requester.userId,
      channel: CommunicationChannel.EMAIL,
      containsSensitiveData: false,
      issueCaseId: null,
      contentHash: 'hash-a',
    });

    await expect(
      service.decide(requester, 'approval-a', {
        status: CommunicationApprovalStatus.APPROVED,
        decisionReason: 'Contenido verificado',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.communicationApproval.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it('atomically approves another requester and audits no message or reason', async () => {
    const pending = {
      id: 'approval-a',
      status: CommunicationApprovalStatus.PENDING,
      requestedById: 'requester-b',
      channel: CommunicationChannel.WHATSAPP,
      containsSensitiveData: false,
      issueCaseId: null,
      contentHash: 'sha256-value',
    };
    const approved = {
      ...pending,
      status: CommunicationApprovalStatus.APPROVED,
      title: 'Respuesta',
      content: { message: 'Dato reservado que no va al audit' },
      purpose: 'Atención',
      decisionReason: 'Motivo reservado que no va al audit',
      decidedById: requester.userId,
    };
    prisma.communicationApproval.findFirst
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(approved);
    prisma.communicationApproval.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.decide(requester, 'approval-a', {
        status: CommunicationApprovalStatus.APPROVED,
        decisionReason: approved.decisionReason,
      }),
    ).resolves.toEqual(approved);

    expect(prisma.communicationApproval.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'approval-a',
          tenantId: 'tenant-a',
          mode: PoliticalOperationMode.CAMPAIGN,
          status: CommunicationApprovalStatus.PENDING,
          requestedById: { not: requester.userId },
        },
        data: expect.objectContaining({
          status: CommunicationApprovalStatus.APPROVED,
          decidedById: requester.userId,
          decisionReason: approved.decisionReason,
        }),
      }),
    );
    expect(prisma.$transaction).toHaveBeenLastCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'Serializable' }),
    );
    const serializedAudit = JSON.stringify(
      prisma.auditEvent.create.mock.calls[0][0],
    );
    expect(serializedAudit).not.toContain('Dato reservado');
    expect(serializedAudit).not.toContain('Motivo reservado');
    expect(serializedAudit).not.toContain('Respuesta');
    expect(serializedAudit).not.toContain('Atención');
  });

  it('reserves sensitive decisions for administration or compliance', async () => {
    prisma.communicationApproval.findFirst.mockResolvedValue({
      id: 'approval-sensitive',
      status: CommunicationApprovalStatus.PENDING,
      requestedById: 'requester-b',
      channel: CommunicationChannel.EMAIL,
      containsSensitiveData: true,
      issueCaseId: null,
      contentHash: 'hash-sensitive',
    });

    await expect(
      service.decide(requester, 'approval-sensitive', {
        status: CommunicationApprovalStatus.APPROVED,
        decisionReason: 'Revisión editorial ordinaria',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.communicationApproval.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it('turns a concurrent second decision into a conflict', async () => {
    prisma.communicationApproval.findFirst.mockResolvedValue({
      id: 'approval-a',
      status: CommunicationApprovalStatus.PENDING,
      requestedById: 'requester-b',
      channel: CommunicationChannel.EMAIL,
      containsSensitiveData: false,
      issueCaseId: null,
      contentHash: 'hash-a',
    });
    prisma.communicationApproval.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.decide(requester, 'approval-a', {
        status: CommunicationApprovalStatus.REJECTED,
        decisionReason: 'Debe corregir la fuente',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it('maps a serializable transaction conflict to an explicit 409', async () => {
    prisma.$transaction.mockRejectedValue({ code: 'P2034' });

    await expect(
      service.decide(requester, 'approval-a', {
        status: CommunicationApprovalStatus.REJECTED,
        decisionReason: 'Debe corregir la fuente',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.communicationApproval.updateMany).not.toHaveBeenCalled();
  });
});
