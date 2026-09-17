import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ElectoralCatalogStatus,
  ElectoralCatalogType,
  ElectoralCircumscriptionType,
  ElectoralContestType,
  PoliticalOperationMode,
  PoliticalOperationStage,
  PoliticalOperationType,
  PrismaClient,
  Role,
  ScrutinyActionStatus,
  ScrutinyDeclarationReviewDecision,
  ScrutinyDeclarationStatus,
  ScrutinyDocumentReviewDecision,
  ScrutinyDocumentType,
  ScrutinyEvidenceState,
  ScrutinySessionEventType,
  StorageObjectModule,
  StoredObjectStatus,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  PrismaService,
  resolveDatabaseSchema,
  resolveDatabaseSearchPathOptions,
} from '../prisma/prisma.service';
import type {
  ApproveScrutinyActionDto,
  CreateScrutinyActionDto,
  CreateScrutinyCommissionDto,
  CreateScrutinyDeclarationDto,
  CreateScrutinyDocumentDto,
  FileScrutinyActionDto,
  RecordScrutinyCustodyEventDto,
  RecordScrutinyDecisionDto,
  RecordScrutinySessionEventDto,
  ReviewScrutinyDecisionDto,
  ReviewScrutinyDeclarationDto,
  ReviewScrutinyDocumentDto,
} from './dto/scrutiny.dto';
import {
  computeScrutinyCommandSha256,
  type ScrutinyCommandName,
} from './scrutiny.hash';
import { ScrutinyService } from './scrutiny.service';

const databaseUrl =
  process.env.SCRUTINY_INTEGRATION_DATABASE_URL?.trim() ??
  process.env.TEST_DATABASE_URL?.trim();
const databaseSchema = resolveDatabaseSchema(databaseUrl) ?? 'public';
const physicalDescribe = databaseUrl ? describe : describe.skip;

function command<T extends object>(
  type: ScrutinyCommandName,
  input: T,
  binding: object = {},
): T & { payloadSha256: string } {
  return {
    ...input,
    payloadSha256: computeScrutinyCommandSha256(type, {
      ...input,
      ...binding,
    }),
  };
}

physicalDescribe('ScrutinyService on migrated PostgreSQL 16', () => {
  let prisma: PrismaClient;
  let service: ScrutinyService;
  let context: Awaited<ReturnType<typeof createContext>>;
  let commission: Awaited<ReturnType<ScrutinyService['createCommission']>>;

  beforeAll(async () => {
    const adapter = new PrismaPg(
      {
        connectionString: databaseUrl,
        options: resolveDatabaseSearchPathOptions(databaseSchema),
      },
      { schema: databaseSchema },
    );
    prisma = new PrismaClient({ adapter });
    await prisma.$connect();
    service = new ScrutinyService(prisma as unknown as PrismaService);
    context = await createContext();
    commission = await service.createCommission(
      context.users.author,
      command('COMMISSION_CREATE', {
        clientRequestId: randomUUID(),
        code: `AUX-${randomUUID().slice(0, 8).toUpperCase()}`,
        level: 'AUXILIARY' as const,
        name: 'Comisión auxiliar de integración física',
        scopeCode: '11001',
        scopeName: 'Bogotá D.C.',
        venue: 'Sede de escrutinio de integración',
        timeZone: 'America/Bogota',
        scheduledStartsAt: '2099-06-02T13:00:00.000Z',
        scheduledEndsAt: '2099-06-02T20:00:00.000Z',
        calendarSourceUrl: 'https://www.registraduria.gov.co/',
        calendarSourceReference: 'Calendario electoral de integración 2099',
        legalLeadUserId: context.ids.author,
        escalationRoute:
          'El testigo llama al responsable jurídico, este registra el incidente y escala al apoderado dentro de quince minutos.',
        contingencyPlan:
          'Se usan formatos foliados sin conexión, custodia con sello y reconciliación por dos personas antes de digitalizar.',
        offlineDrillAt: '2099-06-01T15:00:00.000Z',
      }) as CreateScrutinyCommissionDto,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createContext() {
    const suffix = randomUUID();
    const tenantId = `tenant-scrutiny-${suffix}`;
    const ids = {
      author: `author-scrutiny-${suffix}`,
      reviewer: `reviewer-scrutiny-${suffix}`,
      filer: `filer-scrutiny-${suffix}`,
      controller: `controller-scrutiny-${suffix}`,
      witness: `witness-scrutiny-${suffix}`,
    };
    await prisma.tenant.create({
      data: {
        id: tenantId,
        slug: `scrutiny-${suffix}`,
        name: 'Campaña de escrutinio físico',
        type: TenantType.CANDIDACY,
        defaultMode: PoliticalOperationMode.CAMPAIGN,
      },
    });
    await prisma.user.createMany({
      data: [
        [ids.author, 'Autor jurídico', Role.ADMIN],
        [ids.reviewer, 'Revisor jurídico', Role.ADMIN],
        [ids.filer, 'Radicador jurídico', Role.CAMPAIGN_MANAGER],
        [ids.controller, 'Control independiente', Role.COMPLIANCE_OFFICER],
        [ids.witness, 'Testigo acreditado', Role.WITNESS],
      ].map(([id, name, role], index) => ({
        id,
        tenantId,
        email: `scrutiny-${index}-${suffix}@integration.invalid`,
        password: 'not-a-real-credential',
        name,
        role: role as Role,
        isActive: true,
      })),
    });
    const profile = await prisma.operationProfile.create({
      data: {
        tenantId,
        operationType: PoliticalOperationType.SINGLE_CANDIDACY,
        stage: PoliticalOperationStage.POST_ELECTION,
        electionType: ElectoralContestType.MAYORALTY,
        circumscriptionType: ElectoralCircumscriptionType.MUNICIPAL,
        circumscriptionName: 'Bogotá D.C.',
        electionDate: new Date('2099-06-01T00:00:00.000Z'),
        votingStartDate: new Date('2099-06-01T00:00:00.000Z'),
        votingEndDate: new Date('2099-06-01T00:00:00.000Z'),
        expectedTeamSize: 5,
        candidateCount: 1,
        dataControllerName: 'Campaña responsable de integración',
        responsibleDataUserId: ids.controller,
        retentionPeriodDays: 365,
        revocationProcedure:
          'Solicitud verificable ante la persona responsable del tratamiento.',
        createdById: ids.author,
        updatedById: ids.author,
      },
    });
    const release = await prisma.electoralCatalogRelease.create({
      data: {
        id: `release-scrutiny-${suffix}`,
        tenantId,
        catalogKey: `RNEC-2099-${suffix}`,
        type: ElectoralCatalogType.ELECTORAL_RNEC,
        sourceUrl: 'https://www.registraduria.gov.co/',
        sourceOrganization: 'Registraduría Nacional del Estado Civil',
        sourceDataset: `DIVIPOL integración ${suffix}`,
        sourceCutoffAt: new Date('2099-05-31T20:00:00.000Z'),
        electionDate: new Date('2099-06-01T00:00:00.000Z'),
        contentSha256: '1'.repeat(64),
        parserVersion: 'integration-v1',
        authorizationReference: 'Autorización de integración controlada',
        licenseDeclaration: 'Fuente oficial usada sólo para prueba física',
        recordCount: 0,
        departmentCount: 0,
        municipalityCount: 0,
        zoneCount: 0,
        pollingPlaceCount: 0,
        expectedTableCount: 0,
        createdById: ids.author,
      },
    });
    const validatedAt = new Date();
    await prisma.electoralCatalogRelease.update({
      where: { id: release.id },
      data: {
        status: ElectoralCatalogStatus.VALIDATED,
        validatedAt,
        validatedById: ids.reviewer,
        validationSummary: { valid: true, test: 'physical-postgresql-16' },
      },
    });
    await prisma.electoralCatalogRelease.update({
      where: { id: release.id },
      data: {
        status: ElectoralCatalogStatus.ACTIVE,
        activatedAt: new Date(),
        activatedById: ids.reviewer,
        approvedById: ids.reviewer,
      },
    });
    const asUser = (userId: string, role: Role): AuthenticatedUser => ({
      tenantId,
      userId,
      role,
    });
    return {
      tenantId,
      profile,
      ids,
      users: {
        author: asUser(ids.author, Role.ADMIN),
        reviewer: asUser(ids.reviewer, Role.ADMIN),
        filer: asUser(ids.filer, Role.CAMPAIGN_MANAGER),
        controller: asUser(ids.controller, Role.COMPLIANCE_OFFICER),
        witness: asUser(ids.witness, Role.WITNESS),
      },
    };
  }

  async function createReviewedDocument(
    state: ScrutinyEvidenceState,
    type: ScrutinyDocumentType,
    reference: string,
  ) {
    const sha256 = randomUUID().replaceAll('-', '').padEnd(64, '0');
    const path = `${context.tenantId}/scrutiny/${randomUUID()}.pdf`;
    await prisma.storedObject.create({
      data: {
        id: `stored-${randomUUID()}`,
        tenantId: context.tenantId,
        uploaderId: context.ids.author,
        path,
        module: StorageObjectModule.SCRUTINY,
        contentType: 'application/pdf',
        expectedSize: 512,
        expectedSha256: sha256,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await prisma.storedObject.update({
      where: { path },
      data: {
        status: StoredObjectStatus.CONFIRMED,
        actualSize: 512,
        reportedSha256: sha256,
        confirmedAt: new Date(),
      },
    });
    const input = {
      clientRequestId: randomUUID(),
      commissionId: commission.id,
      type,
      evidenceState: state,
      storagePath: path,
      sha256,
      size: 512,
      contentType: 'application/pdf',
      declaredIssuer: 'Autoridad electoral de integración',
      authorityInstance: 'Comisión auxiliar de integración',
      versionLabel: `original-${reference}`,
      cutoffAt: '2099-06-02T18:00:00.000Z',
      ...(state === ScrutinyEvidenceState.INTERNAL
        ? {}
        : {
            externalAt: '2099-06-02T18:05:00.000Z',
            externalChannel: 'Audiencia pública',
            externalReference: reference,
          }),
    };
    const document = await service.createDocument(
      context.users.author,
      command('DOCUMENT_CREATE', input) as CreateScrutinyDocumentDto,
    );
    const reviewInput = {
      clientRequestId: randomUUID(),
      decision: ScrutinyDocumentReviewDecision.APPROVE,
      reason:
        'Se verificaron emisor, referencia, integridad SHA-256 y correspondencia con la audiencia.',
      expectedVersion: document.version,
    };
    const reviewed = await service.reviewDocument(
      context.users.reviewer,
      document.id,
      command('DOCUMENT_REVIEW', reviewInput, {
        documentId: document.id,
      }) as ReviewScrutinyDocumentDto,
    );
    return reviewed;
  }

  it('serializes competing hearing events with optimistic versioning', async () => {
    const attempt = (suffix: string) => {
      const input = {
        clientRequestId: randomUUID(),
        expectedVersion: commission.version,
        type: ScrutinySessionEventType.OPENED,
        occurredAt: '2099-06-02T13:00:00.000Z',
        notes: `Apertura observada por el equipo de integración ${suffix}.`,
      };
      return service.recordSessionEvent(
        context.users.witness,
        commission.id,
        command('SESSION_EVENT_RECORD', input, {
          commissionId: commission.id,
        }) as RecordScrutinySessionEventDto,
      );
    };
    const outcomes = await Promise.allSettled([attempt('A'), attempt('B')]);
    expect(
      outcomes.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(
      1,
    );
    await expect(
      prisma.scrutinyCommission.findUniqueOrThrow({
        where: {
          id_tenantId: { id: commission.id, tenantId: context.tenantId },
        },
        select: { status: true, version: true },
      }),
    ).resolves.toEqual({ status: 'ACTIVE', version: 2 });
    await expect(
      prisma.scrutinyCommissionEvent.count({
        where: { tenantId: context.tenantId, commissionId: commission.id },
      }),
    ).resolves.toBe(1);
  });

  it('enforces exact Storage consumption, independent review and append-only custody', async () => {
    const document = await createReviewedDocument(
      ScrutinyEvidenceState.FILED,
      ScrutinyDocumentType.GENERAL_ACT,
      'RAD-INT-001',
    );
    const selfReview = {
      clientRequestId: randomUUID(),
      decision: ScrutinyDocumentReviewDecision.APPROVE,
      reason:
        'El mismo incorporador intenta ejecutar una revisión que debe ser independiente.',
      expectedVersion: 1,
    };
    await expect(
      service.reviewDocument(
        context.users.author,
        document.id,
        command('DOCUMENT_REVIEW', selfReview, {
          documentId: document.id,
        }) as ReviewScrutinyDocumentDto,
      ),
    ).rejects.toBeDefined();

    const custodyInput = {
      clientRequestId: randomUUID(),
      type: 'VERIFIED' as const,
      occurredAt: '2099-06-02T18:10:00.000Z',
      fromCustodian: 'Secretaría de la comisión',
      toCustodian: 'Responsable jurídico de integración',
      notes:
        'Se coteja el sello, la huella y la referencia antes del resguardo.',
    };
    const custody = await service.recordCustodyEvent(
      context.users.author,
      document.id,
      command('CUSTODY_EVENT_RECORD', custodyInput, {
        documentId: document.id,
      }) as RecordScrutinyCustodyEventDto,
    );
    await expect(
      prisma.scrutinyCustodyEvent.update({
        where: { id: custody.id },
        data: { notes: 'Manipulación posterior prohibida' },
      }),
    ).rejects.toThrow(/append-only scrutiny ledger/i);
    await expect(
      prisma.scrutinyCustodyEvent.delete({ where: { id: custody.id } }),
    ).rejects.toThrow(/append-only scrutiny ledger/i);
    await expect(
      prisma.scrutinyDocument.findUniqueOrThrow({ where: { id: document.id } }),
    ).resolves.toMatchObject({
      reviewStatus: 'APPROVED',
      evidenceState: ScrutinyEvidenceState.FILED,
      sha256: document.sha256,
    });
  });

  it('requires separate drafter, approver and filer and four eyes for a decision', async () => {
    const filingDocument = await createReviewedDocument(
      ScrutinyEvidenceState.FILED,
      ScrutinyDocumentType.APPEAL,
      'RAD-CLAIM-001',
    );
    const decisionDocument = await createReviewedDocument(
      ScrutinyEvidenceState.DECIDED,
      ScrutinyDocumentType.RESOLUTION,
      'RES-DEC-001',
    );
    const actionInput = {
      clientRequestId: randomUUID(),
      commissionId: commission.id,
      type: 'CLAIM' as const,
      standingType: 'CANDIDATE' as const,
      standingBasis:
        'La candidatura comparece mediante representante autorizado en el expediente.',
      legalGroundCode: 'ART-192-ARITHMETIC',
      legalGroundVersion: 'Código Electoral vigente 2099',
      legalGroundSourceUrl:
        'https://www.funcionpublica.gov.co/eva/gestornormativo/',
      facts:
        'El formulario publicado conserva una suma distinta de la registrada en el acta general revisada.',
      legalBasis:
        'Se solicita la corrección con fundamento en la causal legal documentada y dentro del término aplicable.',
      affectedReferences: ['Mesa 001', 'E-24 corte 18:00'],
      authority: 'Comisión auxiliar de integración',
      deadlineAt: '2099-06-02T19:30:00.000Z',
      deadlineRule:
        'El término vence durante la sesión y se computa en la zona horaria oficial de la comisión.',
      timeZone: 'America/Bogota',
      text: 'La candidatura solicita contrastar las operaciones aritméticas y corregir la diferencia preservando ambas fuentes, el acta y la constancia de la decisión.',
    };
    const action = await service.createAction(
      context.users.author,
      command('ACTION_CREATE', actionInput) as CreateScrutinyActionDto,
    );
    const approvalInput = {
      clientRequestId: randomUUID(),
      expectedVersion: action.version,
      reviewNote:
        'Se revisaron legitimación, causal, hechos, fundamento, autoridad y término aplicable.',
    };
    await expect(
      service.approveAction(
        context.users.author,
        action.id,
        command('ACTION_APPROVE', approvalInput, {
          actionId: action.id,
        }) as ApproveScrutinyActionDto,
      ),
    ).rejects.toBeDefined();
    const approved = await service.approveAction(
      context.users.reviewer,
      action.id,
      command('ACTION_APPROVE', approvalInput, {
        actionId: action.id,
      }) as ApproveScrutinyActionDto,
    );
    const filingInput = {
      clientRequestId: randomUUID(),
      expectedVersion: approved.version,
      supportDocumentId: filingDocument.id,
      filedAt: '2099-06-02T19:00:00.000Z',
      channel: 'Secretaría de la audiencia',
      filingReference: 'RAD-CLAIM-001',
    };
    await expect(
      service.fileAction(
        context.users.reviewer,
        action.id,
        command('ACTION_FILE', filingInput, {
          actionId: action.id,
        }) as FileScrutinyActionDto,
      ),
    ).rejects.toBeDefined();
    const filed = await service.fileAction(
      context.users.filer,
      action.id,
      command('ACTION_FILE', filingInput, {
        actionId: action.id,
      }) as FileScrutinyActionDto,
    );
    const decisionInput = {
      clientRequestId: randomUUID(),
      expectedVersion: filed.version,
      outcome: 'GRANTED' as const,
      authority: 'Comisión auxiliar de integración',
      decidedAt: '2099-06-02T19:20:00.000Z',
      decisionDocumentId: decisionDocument.id,
      reasoning:
        'La autoridad verificó la operación aritmética, encontró la diferencia y ordenó corregir el cuadro.',
    };
    const decision = await service.recordDecision(
      context.users.author,
      action.id,
      command('DECISION_RECORD', decisionInput, {
        actionId: action.id,
      }) as RecordScrutinyDecisionDto,
    );
    const reviewInput = {
      clientRequestId: randomUUID(),
      expectedVersion: decision.version,
      decision: ScrutinyDocumentReviewDecision.APPROVE,
      reviewNote:
        'La decisión y su soporte fueron contrastados independientemente con el radicado.',
    };
    await expect(
      service.reviewDecision(
        context.users.author,
        decision.id,
        command('DECISION_REVIEW', reviewInput, {
          decisionId: decision.id,
        }) as ReviewScrutinyDecisionDto,
      ),
    ).rejects.toBeDefined();
    await service.reviewDecision(
      context.users.controller,
      decision.id,
      command('DECISION_REVIEW', reviewInput, {
        decisionId: decision.id,
      }) as ReviewScrutinyDecisionDto,
    );
    await expect(
      prisma.scrutinyAction.findUniqueOrThrow({ where: { id: action.id } }),
    ).resolves.toMatchObject({ status: ScrutinyActionStatus.DECIDED_EXTERNAL });
  });

  it('rolls back the declaration, its lines and command when a database constraint fails', async () => {
    const source = await createReviewedDocument(
      ScrutinyEvidenceState.OFFICIAL,
      ScrutinyDocumentType.DECLARATION_CREDENTIAL,
      'E26-ROLLBACK',
    );
    const clientRequestId = randomUUID();
    const authorityReference = `ROLLBACK-${randomUUID()}`;
    const input = {
      clientRequestId,
      commissionId: commission.id,
      scopeReference: `ROLLBACK-SCOPE-${randomUUID()}`,
      authority: 'Comisión escrutadora de integración',
      authorityReference,
      declaredAt: '2099-06-03T14:00:00.000Z',
      officialDocumentId: source.id,
      lines: [
        {
          optionCode: 'NEGATIVE',
          optionLabel: 'Línea inválida para comprobar rollback',
          votes: -1,
          declaredStatus: 'NO_DEBE_PERSISTIR',
        },
      ],
    };
    await expect(
      service.createDeclaration(
        context.users.author,
        command('DECLARATION_CREATE', input) as CreateScrutinyDeclarationDto,
      ),
    ).rejects.toBeDefined();
    await expect(
      prisma.scrutinyDeclaration.count({
        where: { tenantId: context.tenantId, authorityReference },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.scrutinyCommand.count({
        where: { tenantId: context.tenantId, clientRequestId },
      }),
    ).resolves.toBe(0);
  });

  it('allows one official declaration per scope under concurrent approval and rejects cross-tenant references', async () => {
    const sourceA = await createReviewedDocument(
      ScrutinyEvidenceState.OFFICIAL,
      ScrutinyDocumentType.DECLARATION_CREDENTIAL,
      'E26-OFFICIAL-A',
    );
    const sourceB = await createReviewedDocument(
      ScrutinyEvidenceState.OFFICIAL,
      ScrutinyDocumentType.RESOLUTION,
      'E26-OFFICIAL-B',
    );
    const createDraft = (officialDocumentId: string, code: string) => {
      const input = {
        clientRequestId: randomUUID(),
        commissionId: commission.id,
        scopeReference: 'ALCALDÍA-BOGOTÁ-2099',
        authority: 'Comisión escrutadora de integración',
        authorityReference: `DECL-${code}`,
        declaredAt: '2099-06-03T15:00:00.000Z',
        officialDocumentId,
        lines: [
          {
            optionCode: '001',
            optionLabel: 'Candidatura de integración',
            votes: 54321,
            seats: 1,
            declaredStatus: 'ELECTA',
          },
        ],
      };
      return service.createDeclaration(
        context.users.author,
        command('DECLARATION_CREATE', input) as CreateScrutinyDeclarationDto,
      );
    };
    const draftA = await createDraft(sourceA.id, 'A');
    const draftB = await createDraft(sourceB.id, 'B');
    const approve = (draft: typeof draftA, reviewer: AuthenticatedUser) => {
      const input = {
        clientRequestId: randomUUID(),
        expectedVersion: draft.version,
        decision: ScrutinyDeclarationReviewDecision.APPROVE,
        reviewNote:
          'Fuente oficial, ámbito, autoridad, cifras y condición declarada contrastados independientemente.',
      };
      return service.reviewDeclaration(
        reviewer,
        draft.id,
        command('DECLARATION_REVIEW', input, {
          declarationId: draft.id,
        }) as ReviewScrutinyDeclarationDto,
      );
    };
    const outcomes = await Promise.allSettled([
      approve(draftA, context.users.reviewer),
      approve(draftB, context.users.controller),
    ]);
    expect(
      outcomes.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(
      1,
    );
    await expect(
      prisma.scrutinyDeclaration.count({
        where: {
          tenantId: context.tenantId,
          scopeReference: 'ALCALDÍA-BOGOTÁ-2099',
          status: ScrutinyDeclarationStatus.OFFICIAL,
        },
      }),
    ).resolves.toBe(1);

    const foreignTenantId = `tenant-foreign-${randomUUID()}`;
    await prisma.tenant.create({
      data: {
        id: foreignTenantId,
        slug: foreignTenantId,
        name: 'Tenant extranjero para prueba de aislamiento',
      },
    });
    await expect(
      prisma.scrutinyCommand.create({
        data: {
          id: randomUUID(),
          tenantId: foreignTenantId,
          clientRequestId: randomUUID(),
          payloadSha256: 'f'.repeat(64),
          type: 'COMMISSION_CREATE',
          actorUserId: context.ids.author,
          resourceType: 'CrossTenantAttempt',
          resourceId: commission.id,
          resultSnapshot: {},
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });
});
