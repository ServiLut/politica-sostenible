import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  CommunicationChannel,
  ConsentCollectionChannel,
  ConsentLegalBasis,
  ConsentPurpose,
  ConsentStatus,
  ConsentSubjectType,
  InteractionDirection,
  InteractionSentiment,
  PoliticalOperationMode,
  Role,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ConsentEvidenceService } from '../common/services/consent-evidence.service';
import { PrismaService } from '../prisma/prisma.service';
import { InteractionsService } from './interactions.service';

const activeConsentNotice = {
  id: 'notice-a',
  mode: PoliticalOperationMode.CAMPAIGN,
  purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
  version: '2026.1',
  title: 'Autorizacion de tratamiento de datos',
  content: 'Texto legal vigente para la organizacion.',
  controllerName: 'Organizacion responsable',
  contactEmail: 'privacidad@example.test',
  privacyPolicyUrl: null,
  activatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('InteractionsService', () => {
  const currentUser: AuthenticatedUser = {
    userId: 'agent-a',
    tenantId: 'tenant-a',
    role: Role.ADMIN,
  };

  let storedRole: Role;
  let storedDivisionId: string | null;
  let prisma: {
    tenant: { findUnique: jest.Mock };
    user: { findFirst: jest.Mock };
    politicalDivision: { findMany: jest.Mock };
    consentNotice: { findFirst: jest.Mock };
    issueCase: { findFirst: jest.Mock; updateMany: jest.Mock };
    voter: { findFirst: jest.Mock; update: jest.Mock };
    consentRecord: { findFirst: jest.Mock; create: jest.Mock };
    interaction: {
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
    };
    auditEvent: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: InteractionsService;
  const consentEvidence = { hashIp: jest.fn() };

  beforeEach(() => {
    storedRole = Role.ADMIN;
    storedDivisionId = null;
    prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
        }),
      },
      user: {
        findFirst: jest.fn().mockImplementation(() =>
          Promise.resolve({
            role: storedRole,
            divisionId: storedDivisionId,
          }),
        ),
      },
      politicalDivision: { findMany: jest.fn().mockResolvedValue([]) },
      consentNotice: {
        findFirst: jest.fn().mockResolvedValue(activeConsentNotice),
      },
      issueCase: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'case-a',
          voterId: 'voter-a',
          externalContactRef: null,
          createdAt: new Date('2026-01-15T00:00:00.000Z'),
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      voter: {
        findFirst: jest.fn().mockResolvedValue({ id: 'voter-a' }),
        update: jest.fn().mockResolvedValue({ id: 'voter-a' }),
      },
      consentRecord: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'consent-a',
          status: ConsentStatus.GRANTED,
          legalBasis: ConsentLegalBasis.EXPLICIT_CONSENT,
          collectionChannel: ConsentCollectionChannel.IN_PERSON,
          noticeVersion: '2026.1',
          proofPath: null,
          grantedAt: new Date('2026-01-01T00:00:00.000Z'),
          expiresAt: new Date('2027-01-01T00:00:00.000Z'),
          revokedAt: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: data.status === ConsentStatus.REVOKED ? 'revoke-a' : 'grant-a',
            status: data.status,
            legalBasis: data.legalBasis,
            collectionChannel: data.collectionChannel,
            noticeVersion: data.noticeVersion,
            proofPath: data.proofPath ?? null,
            grantedAt: data.grantedAt,
            expiresAt: data.expiresAt ?? null,
            revokedAt: data.revokedAt ?? null,
            createdAt: new Date('2026-08-31T10:00:00.000Z'),
          }),
        ),
      },
      interaction: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'interaction-a',
            channel: data.channel,
            direction: data.direction,
            summary: data.summary,
            outcome: data.outcome ?? null,
            sentiment: data.sentiment ?? null,
            occurredAt: data.occurredAt,
            createdAt: new Date('2026-08-31T10:00:00.000Z'),
            actor: { name: 'Agente A', role: storedRole },
          }),
        ),
      },
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof prisma) => unknown) => callback(prisma),
    );
    consentEvidence.hashIp.mockReset().mockReturnValue('hashed-ip');
    service = new InteractionsService(
      prisma as unknown as PrismaService,
      consentEvidence as unknown as ConsentEvidenceService,
    );
  });

  it('requires a case or voter filter for paginated reads', async () => {
    await expect(
      service.findAll(currentUser, { page: 1, limit: 20 }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
    expect(prisma.interaction.findMany).not.toHaveBeenCalled();
  });

  it('always scopes case timelines to the authenticated tenant and active mode', async () => {
    await service.findAll(currentUser, {
      issueCaseId: 'case-from-request',
      page: 2,
      limit: 10,
    });

    expect(prisma.interaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          mode: PoliticalOperationMode.CAMPAIGN,
          issueCaseId: 'case-from-request',
        },
        skip: 10,
        take: 10,
      }),
    );
    expect(prisma.interaction.count).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
        issueCaseId: 'case-from-request',
      },
    });
  });

  it('returns only the minimum interaction projection needed by the UI', async () => {
    await service.findAll(currentUser, {
      issueCaseId: 'case-a',
      page: 1,
      limit: 20,
    });

    expect(prisma.interaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          id: true,
          channel: true,
          direction: true,
          summary: true,
          outcome: true,
          sentiment: true,
          occurredAt: true,
          createdAt: true,
          actor: { select: { name: true, role: true } },
        },
      }),
    );
    const serializedSelect = JSON.stringify(
      prisma.interaction.findMany.mock.calls[0]?.[0]?.select,
    );
    expect(serializedSelect).not.toContain('tenantId');
    expect(serializedSelect).not.toContain('externalContactRef');
    expect(serializedSelect).not.toContain('consentRecordId');
    expect(serializedSelect).not.toContain('voter');
  });

  it('fails closed when the persisted role is incompatible with the active mode', async () => {
    storedRole = Role.CASE_WORKER;

    await expect(
      service.findAll(
        { ...currentUser, role: Role.CASE_WORKER },
        { issueCaseId: 'case-a', page: 1, limit: 20 },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.interaction.findMany).not.toHaveBeenCalled();
  });

  it('does not create against a case from another tenant or mode', async () => {
    prisma.issueCase.findFirst.mockResolvedValue(null);

    await expect(
      service.create(currentUser, {
        issueCaseId: 'case-tenant-b',
        channel: CommunicationChannel.PHONE,
        direction: InteractionDirection.INBOUND,
        summary: 'La persona solicita informacion.',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.issueCase.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'case-tenant-b',
          tenantId: 'tenant-a',
          mode: PoliticalOperationMode.CAMPAIGN,
        },
      }),
    );
    expect(prisma.interaction.create).not.toHaveBeenCalled();
  });

  it('denies a case worker on an unassigned case', async () => {
    storedRole = Role.CASE_WORKER;
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    prisma.issueCase.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        { ...currentUser, role: Role.CASE_WORKER },
        {
          issueCaseId: 'case-assigned-to-b',
          channel: CommunicationChannel.PHONE,
          direction: InteractionDirection.INBOUND,
          summary: 'Ingreso de llamada ciudadana.',
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.issueCase.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'case-assigned-to-b',
          tenantId: 'tenant-a',
          mode: PoliticalOperationMode.PUBLIC_OFFICE,
          assigneeId: 'agent-a',
        }),
      }),
    );
    expect(prisma.interaction.create).not.toHaveBeenCalled();
  });

  it('denies a zone coordinator outside the persisted territorial assignment', async () => {
    storedRole = Role.ZONE_COORDINATOR;
    storedDivisionId = 'zone-a';
    prisma.politicalDivision.findMany.mockResolvedValue([
      { id: 'zone-a', parentId: null },
      { id: 'puesto-a', parentId: 'zone-a' },
      { id: 'puesto-b', parentId: null },
    ]);
    prisma.voter.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        { ...currentUser, role: Role.ZONE_COORDINATOR },
        {
          voterId: 'voter-outside-zone',
          channel: CommunicationChannel.IN_PERSON,
          direction: InteractionDirection.INBOUND,
          summary: 'Contacto recibido fuera del puesto asignado.',
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.voter.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'voter-outside-zone',
        tenantId: 'tenant-a',
        puestoId: { in: expect.arrayContaining(['zone-a', 'puesto-a']) },
      },
      select: { id: true },
    });
    expect(prisma.interaction.create).not.toHaveBeenCalled();
  });

  it('limits zone coordinators to voter-only interactions without a case', async () => {
    storedRole = Role.ZONE_COORDINATOR;
    storedDivisionId = 'zone-a';
    prisma.politicalDivision.findMany.mockResolvedValue([
      { id: 'zone-a', parentId: null },
      { id: 'puesto-a', parentId: 'zone-a' },
    ]);

    await service.findAll(
      { ...currentUser, role: Role.ZONE_COORDINATOR },
      { voterId: 'voter-a', page: 1, limit: 20 },
    );

    expect(prisma.interaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          mode: PoliticalOperationMode.CAMPAIGN,
          voterId: 'voter-a',
          issueCaseId: null,
          voter: {
            is: {
              tenantId: 'tenant-a',
              puestoId: { in: expect.arrayContaining(['zone-a', 'puesto-a']) },
            },
          },
        }),
      }),
    );
  });

  it('denies zone coordinators any case-linked timeline read or write', async () => {
    storedRole = Role.ZONE_COORDINATOR;
    storedDivisionId = 'zone-a';
    prisma.politicalDivision.findMany.mockResolvedValue([
      { id: 'zone-a', parentId: null },
    ]);
    const coordinator = { ...currentUser, role: Role.ZONE_COORDINATOR };

    await expect(
      service.findAll(coordinator, {
        issueCaseId: 'case-a',
        page: 1,
        limit: 20,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.create(coordinator, {
        issueCaseId: 'case-a',
        channel: CommunicationChannel.PHONE,
        direction: InteractionDirection.INBOUND,
        summary: 'Intento sobre un caso.',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.interaction.findMany).not.toHaveBeenCalled();
    expect(prisma.interaction.create).not.toHaveBeenCalled();
  });

  it.each([
    { voterId: 'voter-client-controlled' },
    { externalContactRef: 'contact-client-controlled' },
  ])('rejects client-controlled case subject fields: %o', async (subject) => {
    await expect(
      service.create(currentUser, {
        issueCaseId: 'case-a',
        ...subject,
        channel: CommunicationChannel.PHONE,
        direction: InteractionDirection.INBOUND,
        summary: 'Intento de alterar el sujeto.',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires exactly one server-validated subject without a case', async () => {
    await expect(
      service.create(currentUser, {
        voterId: 'voter-a',
        externalContactRef: 'contact-a',
        channel: CommunicationChannel.PHONE,
        direction: InteractionDirection.INBOUND,
        summary: 'Identidad ambigua.',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(currentUser, {
        channel: CommunicationChannel.PHONE,
        direction: InteractionDirection.INBOUND,
        summary: 'Sin identidad.',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an already ambiguous case before recording an interaction', async () => {
    prisma.issueCase.findFirst.mockResolvedValue({
      id: 'case-a',
      voterId: 'voter-a',
      externalContactRef: 'contact-a',
      createdAt: new Date('2026-01-15T00:00:00.000Z'),
    });

    await expect(
      service.create(currentUser, {
        issueCaseId: 'case-a',
        channel: CommunicationChannel.PHONE,
        direction: InteractionDirection.INBOUND,
        summary: 'Caso inconsistente.',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.interaction.create).not.toHaveBeenCalled();
  });

  it('allows internal work on an anonymous case but blocks outbound contact', async () => {
    prisma.issueCase.findFirst.mockResolvedValue({
      id: 'case-a',
      voterId: null,
      externalContactRef: null,
      createdAt: new Date('2026-01-15T00:00:00.000Z'),
    });

    await expect(
      service.create(currentUser, {
        issueCaseId: 'case-a',
        channel: CommunicationChannel.INTERNAL,
        direction: InteractionDirection.INTERNAL,
        summary: 'Clasificacion interna del caso anonimo.',
      }),
    ).resolves.toMatchObject({ id: 'interaction-a' });
    await expect(
      service.create(currentUser, {
        issueCaseId: 'case-a',
        channel: CommunicationChannel.PHONE,
        direction: InteractionDirection.OUTBOUND,
        summary: 'No existe una persona a quien contactar.',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([Role.AUDITOR, Role.COMPLIANCE_OFFICER])(
    'allows %s to read while enforcing append-only read access',
    async (role) => {
      storedRole = role;
      const readOnlyUser = { ...currentUser, role };

      await expect(
        service.findAll(readOnlyUser, {
          issueCaseId: 'case-a',
          page: 1,
          limit: 20,
        }),
      ).resolves.toMatchObject({ items: [] });
      await expect(
        service.create(readOnlyUser, {
          issueCaseId: 'case-a',
          channel: CommunicationChannel.PHONE,
          direction: InteractionDirection.INBOUND,
          summary: 'Intento de escritura de un rol de solo lectura.',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.interaction.create).not.toHaveBeenCalled();
    },
  );

  it('rejects sentiment in campaign mode to prevent political profiling', async () => {
    await expect(
      service.create(currentUser, {
        voterId: 'voter-a',
        channel: CommunicationChannel.IN_PERSON,
        direction: InteractionDirection.INBOUND,
        sentiment: InteractionSentiment.POSITIVE,
        summary: 'Registro con perfilamiento.',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.interaction.create).not.toHaveBeenCalled();
  });

  it('keeps sentiment available for public-office service quality', async () => {
    storedRole = Role.CONSTITUENT_SERVICES_MANAGER;
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });

    await service.create(
      { ...currentUser, role: Role.CONSTITUENT_SERVICES_MANAGER },
      {
        issueCaseId: 'case-a',
        channel: CommunicationChannel.PHONE,
        direction: InteractionDirection.INBOUND,
        sentiment: InteractionSentiment.NEUTRAL,
        summary: 'Percepcion sobre la atencion publica.',
      },
    );

    expect(prisma.interaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sentiment: InteractionSentiment.NEUTRAL,
        }),
      }),
    );
  });

  it('rejects a case interaction before the case creation timestamp', async () => {
    prisma.issueCase.findFirst.mockResolvedValue({
      id: 'case-a',
      voterId: 'voter-a',
      externalContactRef: null,
      createdAt: new Date('2026-08-15T15:30:00.000Z'),
    });

    await expect(
      service.create(currentUser, {
        issueCaseId: 'case-a',
        channel: CommunicationChannel.PHONE,
        direction: InteractionDirection.INBOUND,
        summary: 'Fecha imposible para el caso.',
        occurredAt: '2026-08-15T15:29:59.999Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.interaction.create).not.toHaveBeenCalled();
    expect(prisma.issueCase.updateMany).not.toHaveBeenCalled();
  });

  it('denies an outbound interaction when the latest consent is revoked', async () => {
    prisma.consentRecord.findFirst.mockResolvedValue({
      id: 'revocation-a',
      status: ConsentStatus.REVOKED,
      grantedAt: new Date('2026-01-01T00:00:00.000Z'),
      expiresAt: null,
      revokedAt: new Date('2026-08-01T00:00:00.000Z'),
    });

    await expect(
      service.create(currentUser, {
        issueCaseId: 'case-a',
        channel: CommunicationChannel.PHONE,
        direction: InteractionDirection.OUTBOUND,
        summary: 'Llamada de seguimiento.',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.interaction.create).not.toHaveBeenCalled();
    expect(prisma.issueCase.updateMany).not.toHaveBeenCalled();
  });

  it('denies an outbound interaction when consent is expired', async () => {
    prisma.consentRecord.findFirst.mockResolvedValue({
      id: 'consent-expired',
      status: ConsentStatus.GRANTED,
      grantedAt: new Date('2026-01-01T00:00:00.000Z'),
      expiresAt: new Date('2026-02-01T00:00:00.000Z'),
      revokedAt: null,
    });

    await expect(
      service.create(currentUser, {
        issueCaseId: 'case-a',
        channel: CommunicationChannel.EMAIL,
        direction: InteractionDirection.OUTBOUND,
        summary: 'Correo de seguimiento.',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.interaction.create).not.toHaveBeenCalled();
  });

  it('records a consented outbound response, audit event and first response atomically', async () => {
    const occurredAt = '2026-08-15T15:30:00.000Z';

    const interaction = await service.create(currentUser, {
      issueCaseId: 'case-a',
      channel: CommunicationChannel.WHATSAPP,
      direction: InteractionDirection.OUTBOUND,
      summary: '  Se informo el avance del caso.  ',
      outcome: '  Ciudadano informado  ',
      occurredAt,
    });

    expect(prisma.consentRecord.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
        purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
        voterId: 'voter-a',
        subjectType: 'VOTER',
        subjectRef: 'voter-a',
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        status: true,
        noticeVersion: true,
        grantedAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
    expect(prisma.interaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-a',
          mode: PoliticalOperationMode.CAMPAIGN,
          actorId: 'agent-a',
          issueCaseId: 'case-a',
          voterId: 'voter-a',
          consentRecordId: 'consent-a',
          summary: 'Se informo el avance del caso.',
          outcome: 'Ciudadano informado',
          occurredAt: new Date(occurredAt),
        }),
      }),
    );
    expect(prisma.issueCase.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'case-a',
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
        OR: [
          { firstResponseAt: null },
          { firstResponseAt: { gt: new Date(occurredAt) } },
        ],
      },
      data: { firstResponseAt: new Date(occurredAt) },
    });
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
        actorUserId: 'agent-a',
        action: 'INTERACTION_RECORDED',
        resourceType: 'Interaction',
        resourceId: 'interaction-a',
      }),
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(interaction).toMatchObject({ id: 'interaction-a' });
  });

  it('never marks first response for inbound or internal notes', async () => {
    await service.create(currentUser, {
      issueCaseId: 'case-a',
      channel: CommunicationChannel.PHONE,
      direction: InteractionDirection.INBOUND,
      summary: 'El ciudadano llamo para ampliar la solicitud.',
    });

    expect(prisma.consentRecord.findFirst).not.toHaveBeenCalled();
    expect(prisma.issueCase.updateMany).not.toHaveBeenCalled();
  });

  it('moves first response backwards for a valid retrospective response', async () => {
    const occurredAt = new Date('2026-07-01T08:00:00.000Z');
    prisma.issueCase.updateMany.mockResolvedValue({ count: 1 });

    await service.create(currentUser, {
      issueCaseId: 'case-a',
      channel: CommunicationChannel.PHONE,
      direction: InteractionDirection.OUTBOUND,
      summary: 'Respuesta historica verificada.',
      occurredAt: occurredAt.toISOString(),
    });

    expect(prisma.issueCase.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'case-a',
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
        OR: [
          { firstResponseAt: null },
          { firstResponseAt: { gt: occurredAt } },
        ],
      }),
      data: { firstResponseAt: occurredAt },
    });
  });

  it('cannot bypass case consent by omitting the voter id', async () => {
    prisma.consentRecord.findFirst.mockResolvedValue(null);

    await expect(
      service.create(currentUser, {
        issueCaseId: 'case-a',
        channel: CommunicationChannel.SMS,
        direction: InteractionDirection.OUTBOUND,
        summary: 'Mensaje relacionado con el caso.',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.consentRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          voterId: 'voter-a',
          subjectRef: 'voter-a',
        }),
      }),
    );
    expect(prisma.interaction.create).not.toHaveBeenCalled();
  });

  it('uses service-follow-up consent in public-office mode', async () => {
    storedRole = Role.CONSTITUENT_SERVICES_MANAGER;
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });

    await service.create(
      { ...currentUser, role: Role.CONSTITUENT_SERVICES_MANAGER },
      {
        issueCaseId: 'case-a',
        channel: CommunicationChannel.PHONE,
        direction: InteractionDirection.OUTBOUND,
        summary: 'Seguimiento de la solicitud ciudadana.',
      },
    );

    expect(prisma.consentRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          mode: PoliticalOperationMode.PUBLIC_OFFICE,
          purpose: ConsentPurpose.SERVICE_FOLLOW_UP,
        }),
      }),
    );
  });

  it('pins external-contact consent to the correct subject type', async () => {
    prisma.issueCase.findFirst.mockResolvedValue({
      id: 'case-a',
      voterId: null,
      externalContactRef: 'citizen-ref-a',
      createdAt: new Date('2026-01-15T00:00:00.000Z'),
    });

    await service.create(currentUser, {
      issueCaseId: 'case-a',
      channel: CommunicationChannel.EMAIL,
      direction: InteractionDirection.OUTBOUND,
      summary: 'Seguimiento autorizado al contacto externo.',
    });

    expect(prisma.consentRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          mode: PoliticalOperationMode.CAMPAIGN,
          subjectType: 'OTHER',
          subjectRef: 'citizen-ref-a',
          voterId: null,
          purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
        }),
      }),
    );
  });

  it('reads public-office consent status from the case-derived citizen only', async () => {
    storedRole = Role.CONSTITUENT_SERVICES_MANAGER;
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    prisma.issueCase.findFirst.mockResolvedValue({
      id: 'case-a',
      voterId: null,
      externalContactRef: 'private-citizen-reference',
      createdAt: new Date('2026-01-15T00:00:00.000Z'),
    });

    const status = await service.getCaseConsentStatus(
      { ...currentUser, role: Role.CONSTITUENT_SERVICES_MANAGER },
      'case-a',
    );

    expect(prisma.consentRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          mode: PoliticalOperationMode.PUBLIC_OFFICE,
          purpose: ConsentPurpose.SERVICE_FOLLOW_UP,
          subjectType: ConsentSubjectType.CITIZEN,
          subjectRef: 'private-citizen-reference',
          voterId: null,
        },
      }),
    );
    expect(status).toMatchObject({
      issueCaseId: 'case-a',
      purpose: ConsentPurpose.SERVICE_FOLLOW_UP,
      subjectType: ConsentSubjectType.CITIZEN,
      status: ConsentStatus.GRANTED,
      active: true,
    });
    expect(JSON.stringify(status)).not.toContain('private-citizen-reference');
  });

  it('captures explicit public-office consent append-only with hashed evidence', async () => {
    storedRole = Role.CONSTITUENT_SERVICES_MANAGER;
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    prisma.issueCase.findFirst.mockResolvedValue({
      id: 'case-a',
      voterId: null,
      externalContactRef: 'private-citizen-reference',
      createdAt: new Date('2026-01-15T00:00:00.000Z'),
    });
    prisma.consentRecord.findFirst.mockResolvedValue(null);

    const result = await service.grantCaseConsent(
      { ...currentUser, role: Role.CONSTITUENT_SERVICES_MANAGER },
      '203.0.113.42',
      {
        issueCaseId: 'case-a',
        collectionChannel: ConsentCollectionChannel.PHONE,
        noticeVersion: '2026.1',
        expiresAt: '2027-08-01T10:00:00.000Z',
      },
    );

    expect(consentEvidence.hashIp).toHaveBeenCalledWith('203.0.113.42');
    expect(prisma.consentRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-a',
          mode: PoliticalOperationMode.PUBLIC_OFFICE,
          subjectType: ConsentSubjectType.CITIZEN,
          subjectRef: 'private-citizen-reference',
          voterId: null,
          purpose: ConsentPurpose.SERVICE_FOLLOW_UP,
          legalBasis: ConsentLegalBasis.EXPLICIT_CONSENT,
          status: ConsentStatus.GRANTED,
          sourceIpHash: 'hashed-ip',
          capturedById: 'agent-a',
        }),
      }),
    );
    expect(result).toMatchObject({
      active: true,
      status: ConsentStatus.GRANTED,
    });
    const auditPayload = JSON.stringify(
      prisma.auditEvent.create.mock.calls.at(-1)?.[0],
    );
    expect(auditPayload).not.toContain('private-citizen-reference');
    expect(auditPayload).not.toContain('hashed-ip');
  });

  it('rejects imported consent without a verified proof path', async () => {
    await expect(
      service.grantCaseConsent(currentUser, '203.0.113.42', {
        issueCaseId: 'case-a',
        collectionChannel: ConsentCollectionChannel.IMPORT,
        noticeVersion: '2026.1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(consentEvidence.hashIp).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('reauthorizes a revoked consent only with server-owned time and notice', async () => {
    prisma.consentRecord.findFirst.mockResolvedValue({
      id: 'revocation-a',
      status: ConsentStatus.REVOKED,
      legalBasis: ConsentLegalBasis.EXPLICIT_CONSENT,
      collectionChannel: ConsentCollectionChannel.PHONE,
      noticeVersion: 'privacy-2026.1',
      proofPath: null,
      grantedAt: new Date('2026-01-01T00:00:00.000Z'),
      expiresAt: null,
      revokedAt: new Date('2026-08-20T10:00:00.000Z'),
      createdAt: new Date('2026-08-20T10:00:00.000Z'),
    });

    const before = new Date();
    await service.grantCaseConsent(currentUser, '203.0.113.42', {
      issueCaseId: 'case-a',
      collectionChannel: ConsentCollectionChannel.PHONE,
      noticeVersion: '2026.1',
    });
    const after = new Date();

    const createData = prisma.consentRecord.create.mock.calls[0]?.[0]?.data as {
      grantedAt: Date;
      noticeVersion: string;
    };
    expect(createData.grantedAt.getTime()).toBeGreaterThanOrEqual(
      before.getTime(),
    );
    expect(createData.grantedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(createData.noticeVersion).toBe('2026.1');
    expect(prisma.voter.update).toHaveBeenCalledWith({
      where: { id: 'voter-a', tenantId: 'tenant-a' },
      data: {
        consentAccepted: true,
        consentTimestamp: createData.grantedAt,
        termsVersion: '2026.1',
        consentIp: 'hashed-ip',
      },
    });
  });

  it('reauthorizes an expired campaign consent at server time', async () => {
    prisma.consentRecord.findFirst.mockResolvedValue({
      id: 'expired-a',
      status: ConsentStatus.GRANTED,
      legalBasis: ConsentLegalBasis.EXPLICIT_CONSENT,
      collectionChannel: ConsentCollectionChannel.PHONE,
      noticeVersion: '2026.1',
      proofPath: null,
      grantedAt: new Date('2025-01-01T00:00:00.000Z'),
      expiresAt: new Date('2025-12-31T23:59:59.000Z'),
      revokedAt: null,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    });

    await expect(
      service.grantCaseConsent(currentUser, '203.0.113.42', {
        issueCaseId: 'case-a',
        collectionChannel: ConsentCollectionChannel.PHONE,
        noticeVersion: '2026.1',
      }),
    ).resolves.toMatchObject({ active: true });

    expect(prisma.consentRecord.create).toHaveBeenCalledTimes(1);
  });

  it('keeps a future-dated legacy grant inactive and blocks outbound use', async () => {
    prisma.consentRecord.findFirst.mockResolvedValue({
      id: 'future-a',
      status: ConsentStatus.GRANTED,
      legalBasis: ConsentLegalBasis.EXPLICIT_CONSENT,
      collectionChannel: ConsentCollectionChannel.PHONE,
      noticeVersion: '2026.1',
      proofPath: null,
      grantedAt: new Date('2099-01-01T00:00:00.000Z'),
      expiresAt: null,
      revokedAt: null,
      createdAt: new Date('2026-08-31T00:00:00.000Z'),
    });

    await expect(
      service.getCaseConsentStatus(currentUser, 'case-a'),
    ).resolves.toMatchObject({
      status: ConsentStatus.GRANTED,
      active: false,
    });
    await expect(
      service.create(currentUser, {
        issueCaseId: 'case-a',
        channel: CommunicationChannel.PHONE,
        direction: InteractionDirection.OUTBOUND,
        summary: 'Contacto que no debe autorizarse antes de la vigencia.',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.interaction.create).not.toHaveBeenCalled();
  });

  it('synchronizes campaign voter revocation without exposing evidence', async () => {
    await service.revokeCaseConsent(currentUser, '203.0.113.42', {
      issueCaseId: 'case-a',
      reason: 'Solicitud expresa recibida del ciudadano',
    });

    expect(prisma.voter.update).toHaveBeenCalledWith({
      where: { id: 'voter-a', tenantId: 'tenant-a' },
      data: { consentAccepted: false },
    });
  });

  it('revokes current consent through a new record without PII in audit', async () => {
    storedRole = Role.COMPLIANCE_OFFICER;
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });

    const result = await service.revokeCaseConsent(
      { ...currentUser, role: Role.COMPLIANCE_OFFICER },
      '203.0.113.42',
      {
        issueCaseId: 'case-a',
        reason: 'Solicitud expresa recibida del ciudadano',
      },
    );

    expect(prisma.consentRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-a',
          mode: PoliticalOperationMode.PUBLIC_OFFICE,
          status: ConsentStatus.REVOKED,
          revocationReason: 'Solicitud expresa recibida del ciudadano',
          sourceIpHash: 'hashed-ip',
        }),
      }),
    );
    expect(result).toMatchObject({
      active: false,
      status: ConsentStatus.REVOKED,
    });
    const auditPayload = JSON.stringify(
      prisma.auditEvent.create.mock.calls.at(-1)?.[0],
    );
    expect(auditPayload).not.toContain('voter-a');
    expect(auditPayload).not.toContain('Solicitud expresa');
    expect(auditPayload).not.toContain('hashed-ip');
    expect(prisma.voter.update).not.toHaveBeenCalled();
  });

  it('fails closed for duplicate grants and unassigned case-worker consent', async () => {
    await expect(
      service.grantCaseConsent(currentUser, '203.0.113.42', {
        issueCaseId: 'case-a',
        collectionChannel: ConsentCollectionChannel.PHONE,
        noticeVersion: '2026.1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    storedRole = Role.CASE_WORKER;
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    prisma.issueCase.findFirst.mockResolvedValue(null);
    await expect(
      service.grantCaseConsent(
        { ...currentUser, role: Role.CASE_WORKER },
        '203.0.113.42',
        {
          issueCaseId: 'unassigned-case',
          collectionChannel: ConsentCollectionChannel.IN_PERSON,
          noticeVersion: '2026.1',
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects incoherent case and voter filters before listing data', async () => {
    prisma.issueCase.findFirst.mockResolvedValue({
      id: 'case-a',
      voterId: 'voter-a',
    });
    prisma.voter.findFirst.mockResolvedValue({ id: 'voter-b' });

    await expect(
      service.findAll(currentUser, {
        issueCaseId: 'case-a',
        voterId: 'voter-b',
        page: 1,
        limit: 20,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.interaction.findMany).not.toHaveBeenCalled();
    expect(prisma.interaction.count).not.toHaveBeenCalled();
  });
});
