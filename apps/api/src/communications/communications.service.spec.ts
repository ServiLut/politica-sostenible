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
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CommunicationsService } from './communications.service';
import type { CreateCommunicationApprovalDto } from './dto/create-communication-approval.dto';

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function hashContent(content: Record<string, unknown>): string {
  return createHash('sha256').update(stableJson(content), 'utf8').digest('hex');
}

describe('CommunicationsService approval controls', () => {
  const requester: AuthenticatedUser = {
    userId: 'requester-a',
    tenantId: 'tenant-a',
    role: Role.COMMUNICATIONS_MANAGER,
  };

  const compliantDto = (
    overrides: Partial<CreateCommunicationApprovalDto> = {},
  ): CreateCommunicationApprovalDto => ({
    title: 'Mensaje verificable',
    message: 'Contenido sujeto a revisión independiente.',
    channel: CommunicationChannel.WEB,
    purpose: 'Información pública verificable',
    recipientBasis: 'PUBLIC_AUDIENCE',
    audienceDescription: 'Ciudadanía que consulta el sitio público',
    dataSource: 'Audiencia pública no individualizada',
    segmentationCriteria: 'No se aplica segmentación individual',
    usesArtificialIntelligence: false,
    containsSensitiveData: false,
    ...overrides,
  });

  let prisma: {
    $queryRaw: jest.Mock;
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
      $queryRaw: jest.fn().mockResolvedValue([{ stage: 'CAMPAIGN' }]),
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
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
      entityId: 'approval-deep-link',
      search: 'rendición',
    });

    const expectedWhere = {
      tenantId: 'tenant-a',
      mode: PoliticalOperationMode.CAMPAIGN,
      id: 'approval-deep-link',
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
    const dto = compliantDto({
      title: '  Informe semanal  ',
      message: '  Avanzamos con hechos verificables.  ',
      channel: CommunicationChannel.SOCIAL_MEDIA,
      purpose: '  Rendición pública de cuentas  ',
    });

    await service.create(requester, dto);

    const expectedHash = hashContent({
      message: 'Avanzamos con hechos verificables.',
      audienceDescription: 'Ciudadanía que consulta el sitio público',
      dataSource: 'Audiencia pública no individualizada',
      segmentationCriteria: 'No se aplica segmentación individual',
      recipientBasis: 'PUBLIC_AUDIENCE',
      usesArtificialIntelligence: false,
    });
    expect(prisma.communicationApproval.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          tenantId: 'tenant-a',
          mode: PoliticalOperationMode.CAMPAIGN,
          issueCaseId: undefined,
          channel: CommunicationChannel.SOCIAL_MEDIA,
          title: 'Informe semanal',
          content: {
            message: 'Avanzamos con hechos verificables.',
            audienceDescription: 'Ciudadanía que consulta el sitio público',
            dataSource: 'Audiencia pública no individualizada',
            segmentationCriteria: 'No se aplica segmentación individual',
            recipientBasis: 'PUBLIC_AUDIENCE',
            usesArtificialIntelligence: false,
          },
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
      compliance: {
        recipientBasis: 'PUBLIC_AUDIENCE',
        usesArtificialIntelligence: false,
        hasRightsMechanism: false,
        hasConsentEvidence: false,
      },
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
        compliantDto({
          title: 'Respuesta a solicitud',
          message: 'La entidad recibió la solicitud.',
          channel: CommunicationChannel.EMAIL,
          purpose: 'Dar respuesta institucional',
          recipientBasis: 'CASE_RESPONSE',
          rightsMechanismUrl: 'https://entidad.example.test/datos',
          issueCaseId: 'case-from-another-scope',
        }),
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
        compliantDto({
          title: 'Respuesta a solicitud',
          message: 'La entidad recibió la solicitud.',
          channel: CommunicationChannel.EMAIL,
          purpose: 'Dar respuesta institucional',
          recipientBasis: 'CASE_RESPONSE',
          rightsMechanismUrl: 'https://entidad.example.test/datos',
        }),
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
      service.create(
        requester,
        compliantDto({
          title: 'Respuesta institucional',
          message: 'Contenido general sujeto a revisión.',
          channel: CommunicationChannel.EMAIL,
          purpose: 'Información institucional',
          recipientBasis: 'CASE_RESPONSE',
          rightsMechanismUrl: 'https://entidad.example.test/datos',
          issueCaseId: 'guessed-case-id',
        }),
      ),
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
        compliantDto({
          title: 'Mensaje fuera de modo',
          message: 'No debe persistirse.',
          channel: CommunicationChannel.WEB,
          purpose: 'Prueba de acceso',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.communicationApproval.create).not.toHaveBeenCalled();
  });

  it('rejects a direct-message channel disguised as a public audience', async () => {
    await expect(
      service.create(
        requester,
        compliantDto({
          channel: CommunicationChannel.WHATSAPP,
          recipientBasis: 'PUBLIC_AUDIENCE',
          rightsMechanismUrl: 'https://campaign.example.test/privacy',
        }),
      ),
    ).rejects.toThrow(
      'Una audiencia pública no puede encubrir un envío directo a contactos',
    );

    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.communicationApproval.create).not.toHaveBeenCalled();
  });

  it('requires an HTTPS rights mechanism for every direct channel', async () => {
    await expect(
      service.create(
        requester,
        compliantDto({
          channel: CommunicationChannel.EMAIL,
          recipientBasis: 'DIRECT_OPT_IN',
        }),
      ),
    ).rejects.toThrow(
      'Los canales directos deben informar un mecanismo HTTPS para ejercer derechos o retirarse',
    );

    expect(prisma.communicationApproval.create).not.toHaveBeenCalled();
  });

  it('requires consent evidence for non-sensitive direct opt-in requests', async () => {
    await expect(
      service.create(
        requester,
        compliantDto({
          channel: CommunicationChannel.EMAIL,
          recipientBasis: 'DIRECT_OPT_IN',
          rightsMechanismUrl: 'https://campaign.example.test/privacy',
          containsSensitiveData: false,
        }),
      ),
    ).rejects.toThrow(
      'La autorización directa requiere una referencia verificable de consentimiento, aunque no se declaren datos sensibles',
    );

    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.communicationApproval.create).not.toHaveBeenCalled();
  });

  it('does not let direct opt-in masquerade as an open publication', async () => {
    await expect(
      service.create(
        requester,
        compliantDto({
          channel: CommunicationChannel.SOCIAL_MEDIA,
          recipientBasis: 'DIRECT_OPT_IN',
          consentEvidenceReference: 'CONS-2026-00142',
        }),
      ),
    ).rejects.toThrow(
      'La autorización directa sólo puede sustentar canales de contacto directo',
    );

    expect(prisma.communicationApproval.create).not.toHaveBeenCalled();
  });

  it('does not let a case response use an open publication channel', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
      type: TenantType.PUBLIC_OFFICE,
    });

    await expect(
      service.create(
        { ...requester, role: Role.ADMIN },
        compliantDto({
          channel: CommunicationChannel.SOCIAL_MEDIA,
          recipientBasis: 'CASE_RESPONSE',
          issueCaseId: 'case-a',
        }),
      ),
    ).rejects.toThrow(
      'La respuesta de caso debe ser directa o presencial; no puede publicarse como audiencia abierta',
    );

    expect(prisma.issueCase.findFirst).not.toHaveBeenCalled();
    expect(prisma.communicationApproval.create).not.toHaveBeenCalled();
  });

  it('uses the verified case link as the basis for a non-sensitive case response', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
      type: TenantType.PUBLIC_OFFICE,
    });
    prisma.communicationApproval.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'approval-case',
          ...data,
          issueCaseId: 'case-a',
        }),
    );

    await expect(
      service.create(
        { ...requester, userId: 'case-worker-a', role: Role.CASE_WORKER },
        compliantDto({
          channel: CommunicationChannel.EMAIL,
          recipientBasis: 'CASE_RESPONSE',
          issueCaseId: 'case-a',
          rightsMechanismUrl: 'https://public-office.example.test/privacy',
          containsSensitiveData: false,
        }),
      ),
    ).resolves.toEqual(expect.objectContaining({ id: 'approval-case' }));

    expect(prisma.issueCase.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'case-a',
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.PUBLIC_OFFICE,
        assigneeId: 'case-worker-a',
      },
      select: { id: true },
    });
    expect(prisma.communicationApproval.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          issueCaseId: 'case-a',
          containsSensitiveData: false,
          content: expect.not.objectContaining({
            consentEvidenceReference: expect.anything(),
          }),
        }),
      }),
    );
  });

  it('still requires separate legal or consent evidence for a sensitive case response', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
      type: TenantType.PUBLIC_OFFICE,
    });

    await expect(
      service.create(
        { ...requester, role: Role.ADMIN },
        compliantDto({
          channel: CommunicationChannel.EMAIL,
          recipientBasis: 'CASE_RESPONSE',
          issueCaseId: 'case-a',
          rightsMechanismUrl: 'https://public-office.example.test/privacy',
          containsSensitiveData: true,
        }),
      ),
    ).rejects.toThrow(
      'Los datos sensibles requieren una referencia verificable de autorización o soporte jurídico',
    );

    expect(prisma.issueCase.findFirst).not.toHaveBeenCalled();
    expect(prisma.communicationApproval.create).not.toHaveBeenCalled();
  });

  it('blocks publication of sensitive personal data even with a declared reference', async () => {
    await expect(
      service.create(
        requester,
        compliantDto({
          channel: CommunicationChannel.SOCIAL_MEDIA,
          recipientBasis: 'PUBLIC_AUDIENCE',
          containsSensitiveData: true,
          consentEvidenceReference: 'CONS-2026-00142',
        }),
      ),
    ).rejects.toThrow(
      'No se pueden someter datos personales sensibles a publicación abierta',
    );

    expect(prisma.communicationApproval.create).not.toHaveBeenCalled();
  });

  it('does not accept party membership as a basis for a candidacy tenant', async () => {
    await expect(
      service.create(
        requester,
        compliantDto({
          channel: CommunicationChannel.EMAIL,
          recipientBasis: 'PARTY_MEMBERSHIP',
          rightsMechanismUrl: 'https://campaign.example.test/privacy',
        }),
      ),
    ).rejects.toThrow(
      'Sólo una organización configurada como partido puede invocar afiliación partidista',
    );

    expect(prisma.communicationApproval.create).not.toHaveBeenCalled();
  });

  it('requires a consent or legal reference whenever sensitive data is declared', async () => {
    await expect(
      service.create(
        requester,
        compliantDto({
          channel: CommunicationChannel.EMAIL,
          recipientBasis: 'DIRECT_OPT_IN',
          rightsMechanismUrl: 'https://campaign.example.test/privacy',
          containsSensitiveData: true,
        }),
      ),
    ).rejects.toThrow(
      'Los datos sensibles requieren una referencia verificable de autorización o soporte jurídico',
    );

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
    const content = {
      message: 'Dato reservado que no va al audit',
      audienceDescription: 'Personas con autorización directa vigente',
      dataSource: 'Formulario propio con aviso de privacidad vigente',
      segmentationCriteria: 'Municipio declarado por cada persona',
      recipientBasis: 'DIRECT_OPT_IN',
      usesArtificialIntelligence: false,
      rightsMechanismUrl: 'https://campaign.example.test/privacy',
      consentEvidenceReference: 'CONS-2026-00142',
    };
    const pending = {
      id: 'approval-a',
      status: CommunicationApprovalStatus.PENDING,
      requestedById: 'requester-b',
      channel: CommunicationChannel.WHATSAPP,
      containsSensitiveData: false,
      issueCaseId: null,
      content,
      contentHash: hashContent(content),
    };
    const approved = {
      ...pending,
      status: CommunicationApprovalStatus.APPROVED,
      title: 'Respuesta',
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

  it('blocks approval of a legacy non-sensitive direct opt-in without evidence', async () => {
    const content = {
      message: 'Mensaje heredado sujeto a revisión.',
      audienceDescription: 'Personas supuestamente inscritas al boletín',
      dataSource: 'Formulario histórico',
      segmentationCriteria: 'Municipio declarado',
      recipientBasis: 'DIRECT_OPT_IN',
      usesArtificialIntelligence: false,
      rightsMechanismUrl: 'https://campaign.example.test/privacy',
    };
    prisma.communicationApproval.findFirst.mockResolvedValueOnce({
      id: 'approval-direct-without-evidence',
      status: CommunicationApprovalStatus.PENDING,
      requestedById: 'requester-b',
      channel: CommunicationChannel.EMAIL,
      containsSensitiveData: false,
      issueCaseId: null,
      content,
      contentHash: hashContent(content),
    });

    await expect(
      service.decide(requester, 'approval-direct-without-evidence', {
        status: CommunicationApprovalStatus.APPROVED,
        decisionReason: 'El texto parece correcto',
      }),
    ).rejects.toThrow(
      'La autorización directa requiere una referencia verificable de consentimiento, aunque no se declaren datos sensibles',
    );

    expect(prisma.communicationApproval.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it('blocks approval of a legacy incomplete file but still permits rejection', async () => {
    const legacy = {
      id: 'approval-legacy',
      status: CommunicationApprovalStatus.PENDING,
      requestedById: 'requester-b',
      channel: CommunicationChannel.SOCIAL_MEDIA,
      containsSensitiveData: false,
      issueCaseId: null,
      content: { message: 'Solicitud creada antes del expediente SIC.' },
      contentHash: 'legacy-hash',
    };

    prisma.communicationApproval.findFirst.mockResolvedValueOnce(legacy);

    await expect(
      service.decide(requester, legacy.id, {
        status: CommunicationApprovalStatus.APPROVED,
        decisionReason: 'Aprobación improcedente',
      }),
    ).rejects.toThrow(
      'La solicitud es anterior al expediente SIC completo; rechácela y cree una nueva versión',
    );
    expect(prisma.communicationApproval.updateMany).not.toHaveBeenCalled();

    const rejected = {
      ...legacy,
      status: CommunicationApprovalStatus.REJECTED,
      decisionReason: 'Debe recrearse con el expediente SIC completo',
      decidedById: requester.userId,
    };
    prisma.communicationApproval.findFirst
      .mockResolvedValueOnce(legacy)
      .mockResolvedValueOnce(rejected);
    prisma.communicationApproval.updateMany.mockResolvedValueOnce({ count: 1 });

    await expect(
      service.decide(requester, legacy.id, {
        status: CommunicationApprovalStatus.REJECTED,
        decisionReason: rejected.decisionReason,
      }),
    ).resolves.toEqual(rejected);
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
