import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  CneCode,
  ElectoralCircumscriptionType,
  ElectoralContestType,
  EntryType,
  FinanceApprovalDecision,
  FinanceBankMatchStatus,
  FinanceExternalReviewDecision,
  FinanceReportKind,
  FinanceReportScope,
  FinanceStatus,
  OperationClosureType,
  PoliticalOperationMode,
  PoliticalOperationStage,
  PoliticalOperationType,
  Prisma,
  PrismaClient,
  Role,
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
  ApproveFinanceReportVersionDto,
  CreateFinanceBankStatementDto,
  CreateFinanceDossierDto,
  CreateFinanceInKindDto,
  CreateFinancePayableDto,
  CreateFinanceReportVersionDto,
  RecordFinanceExternalEvidenceDto,
  ReviewFinanceExternalEvidenceDto,
  SettleFinancePayableDto,
} from './dto/finance-closeout.dto';
import {
  computeFinanceCloseoutCommandSha256,
  type FinanceCloseoutCommandName,
} from './finance-closeout.hash';
import { FinanceCloseoutService } from './finance-closeout.service';

const databaseUrl =
  process.env.FINANCE_INTEGRATION_DATABASE_URL?.trim() ??
  process.env.TEST_DATABASE_URL?.trim();
const databaseSchema = resolveDatabaseSchema(databaseUrl) ?? 'public';
const physicalDescribe = databaseUrl ? describe : describe.skip;

function command<T extends object>(
  type: FinanceCloseoutCommandName,
  input: T,
  routeBinding?: Record<string, string>,
): T & { payloadSha256: string } {
  return {
    ...input,
    payloadSha256: computeFinanceCloseoutCommandSha256(type, {
      ...input,
      ...(routeBinding ?? {}),
    }),
  };
}

physicalDescribe('FinanceCloseoutService on physical PostgreSQL', () => {
  let prisma: PrismaClient;
  let service: FinanceCloseoutService;

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
    service = new FinanceCloseoutService(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createUser(
    tenantId: string,
    role: Role,
    label: string,
  ): Promise<AuthenticatedUser> {
    const userId = `finance-${label}-${randomUUID()}`;
    await prisma.user.create({
      data: {
        id: userId,
        tenantId,
        email: `${label}-${randomUUID()}@finance.integration.invalid`,
        password: 'not-a-real-credential',
        name: `Control financiero ${label}`,
        role,
        isActive: true,
        documentId: `${label}-${randomUUID()}`,
      },
    });
    return { tenantId, userId, role };
  }

  async function createContext(
    stage: PoliticalOperationStage,
    closureType?: OperationClosureType,
  ) {
    const tenantId = `tenant-finance-${randomUUID()}`;
    await prisma.tenant.create({
      data: {
        id: tenantId,
        slug: `finance-${randomUUID()}`,
        name: 'Candidatura de integracion financiera',
        type: TenantType.CANDIDACY,
        defaultMode: PoliticalOperationMode.CAMPAIGN,
      },
    });
    await prisma.campaignSettings.create({
      data: {
        tenantId,
        maxTotalBudget: new Prisma.Decimal('1000000000'),
        maxPublicityLimit: new Prisma.Decimal('100000000'),
        electionName: 'Eleccion territorial de integracion',
        electionDate: new Date('2026-10-25T00:00:00.000Z'),
        reportScope: FinanceReportScope.CANDIDATE,
        officialLimitsReference: 'Resolucion CNE de integracion',
        officialLimitsUrl: 'https://www.cne.gov.co/topes-integracion',
        reportDeadline: new Date('2026-11-25T00:00:00.000Z'),
        financialManagerName: 'Gerente de integracion',
        financialManagerDocument: '111111111',
        accountantName: 'Contador de integracion',
        accountantDocument: '222222222',
        uniqueAccountBank: 'Banco de integracion',
        uniqueAccountLastFour: '1234',
        cuentasClarasCode: 'CC-INTEGRACION-001',
      },
    });
    const manager = await createUser(
      tenantId,
      Role.CAMPAIGN_MANAGER,
      'manager',
    );
    const competingManager = await createUser(
      tenantId,
      Role.CAMPAIGN_MANAGER,
      'manager-race',
    );
    const preparer = await createUser(
      tenantId,
      Role.CAMPAIGN_MANAGER,
      'preparer',
    );
    const accountant = await createUser(
      tenantId,
      Role.FINANCE_MANAGER,
      'accountant',
    );
    const compliance = await createUser(
      tenantId,
      Role.COMPLIANCE_OFFICER,
      'compliance',
    );
    const auditor = await createUser(tenantId, Role.AUDITOR, 'auditor');
    const profile = await prisma.operationProfile.create({
      data: {
        tenantId,
        operationType: PoliticalOperationType.SINGLE_CANDIDACY,
        stage,
        closureType,
        electionType: ElectoralContestType.MAYORALTY,
        circumscriptionType: ElectoralCircumscriptionType.MUNICIPAL,
        circumscriptionName: 'Municipio de integracion',
        electionDate: new Date('2026-10-25T00:00:00.000Z'),
        votingStartDate: new Date('2026-10-25T00:00:00.000Z'),
        votingEndDate: new Date('2026-10-25T00:00:00.000Z'),
        expectedTeamSize: 6,
        candidateCount: 1,
        dataControllerName: 'Candidatura de integracion financiera',
        responsibleDataUserId: manager.userId,
        retentionPeriodDays: 365,
        revocationProcedure:
          'Solicitud verificable dirigida al responsable del tratamiento.',
        createdById: manager.userId,
        updatedById: manager.userId,
      },
    });
    return {
      tenantId,
      profile,
      manager,
      competingManager,
      preparer,
      accountant,
      compliance,
      auditor,
    };
  }

  async function confirmedStorage(
    user: AuthenticatedUser,
    label: string,
    digest = 'a'.repeat(64),
  ) {
    const path = `${user.tenantId}/finance/${randomUUID()}.pdf`;
    const stored = await prisma.storedObject.create({
      data: {
        tenantId: user.tenantId,
        uploaderId: user.userId,
        path,
        module: StorageObjectModule.FINANCE,
        contentType: 'application/pdf',
        expectedSize: 128,
        actualSize: 128,
        etag: `etag-${label}-${randomUUID()}`,
        expectedSha256: digest,
        reportedSha256: digest,
        status: StoredObjectStatus.CONFIRMED,
        expiresAt: new Date(Date.now() + 3_600_000),
        confirmedAt: new Date(),
      },
    });
    return { ...stored, digest };
  }

  async function approvedEntry(
    context: Awaited<ReturnType<typeof createContext>>,
    input: {
      type: EntryType;
      amount: number;
      date: string;
      description: string;
    },
  ) {
    return prisma.financialEntry.create({
      data: {
        tenantId: context.tenantId,
        reporterId: context.accountant.userId,
        reviewedById: context.compliance.userId,
        reviewedAt: new Date('2026-02-02T15:00:00.000Z'),
        reviewReason: 'Movimiento comprobado para el corte fisico.',
        type: input.type,
        amount: input.amount,
        date: new Date(`${input.date}T00:00:00.000Z`),
        cneCode: CneCode.OTROS,
        description: input.description,
        vendorName: `Contraparte ${input.description}`,
        vendorTaxId: `${Math.floor(Math.random() * 9_000_000) + 1_000_000}`,
        evidenceUrl: `${context.tenantId}/finance/${randomUUID()}.pdf`,
        status: FinanceStatus.APPROVED,
      },
    });
  }

  it('persists corrections, exact bank math, independent controls and reviewed external evidence', async () => {
    const context = await createContext(PoliticalOperationStage.POST_ELECTION);
    const cashIncome = await approvedEntry(context, {
      type: EntryType.INCOME,
      amount: 1_000,
      date: '2026-01-05',
      description: 'Aporte monetario bancarizado',
    });
    const cashExpense = await approvedEntry(context, {
      type: EntryType.EXPENSE,
      amount: 400,
      date: '2026-01-10',
      description: 'Publicidad pagada',
    });
    const inKindIncome = await approvedEntry(context, {
      type: EntryType.INCOME,
      amount: 200,
      date: '2026-01-15',
      description: 'Ingreso por aporte en especie',
    });
    const inKindExpense = await approvedEntry(context, {
      type: EntryType.EXPENSE,
      amount: 200,
      date: '2026-01-15',
      description: 'Gasto espejo del aporte en especie',
    });
    const payableExpense = await approvedEntry(context, {
      type: EntryType.EXPENSE,
      amount: 300,
      date: '2026-01-20',
      description: 'Servicio causado y luego pagado',
    });

    const dossierInput = command('DOSSIER_CREATE', {
      clientRequestId: randomUUID(),
      kind: FinanceReportKind.CANDIDATE,
      subjectCode: 'CAND-001',
      subjectName: 'Candidatura municipal de prueba',
    }) as CreateFinanceDossierDto;
    const dossier = await service.createDossier(context.manager, dossierInput);
    const replay = await service.createDossier(context.manager, dossierInput);
    expect(replay.id).toBe(dossier.id);

    const statementFile = await confirmedStorage(
      context.accountant,
      'statement',
      'b'.repeat(64),
    );
    const statement = await service.createBankStatement(
      context.accountant,
      command('BANK_STATEMENT_CREATE', {
        clientRequestId: randomUUID(),
        bankName: 'Banco de integracion',
        accountLastFour: '6789',
        periodStartsAt: '2026-01-01',
        periodEndsAt: '2026-01-31',
        openingBalance: 0,
        closingBalance: 300,
        storagePath: statementFile.path,
        statementSha256: statementFile.digest,
        lines: [
          {
            lineNumber: 1,
            occurredAt: '2026-01-05',
            bankReference: 'ING-001',
            description: 'Ingreso conciliado',
            debit: 0,
            credit: 1_000,
            matchStatus: FinanceBankMatchStatus.MATCHED,
            matchedEntryId: cashIncome.id,
          },
          {
            lineNumber: 2,
            occurredAt: '2026-01-10',
            bankReference: 'EGR-001',
            description: 'Pago de publicidad conciliado',
            debit: 400,
            credit: 0,
            matchStatus: FinanceBankMatchStatus.MATCHED,
            matchedEntryId: cashExpense.id,
          },
          {
            lineNumber: 3,
            occurredAt: '2026-01-20',
            bankReference: 'EGR-002',
            description: 'Pago posterior de obligacion',
            debit: 300,
            credit: 0,
            matchStatus: FinanceBankMatchStatus.MATCHED,
            matchedEntryId: payableExpense.id,
          },
        ],
      }) as CreateFinanceBankStatementDto,
    );
    expect(statement).toMatchObject({ lineCount: 3, unmatchedLineCount: 0 });

    const valuationFile = await confirmedStorage(
      context.accountant,
      'valuation',
      'c'.repeat(64),
    );
    await service.createInKind(
      context.accountant,
      command('IN_KIND_CREATE', {
        clientRequestId: randomUUID(),
        incomeEntryId: inKindIncome.id,
        expenseEntryId: inKindExpense.id,
        storagePath: valuationFile.path,
        contributorName: 'Aportante en especie',
        contributorDocument: '1000000001',
        contributionDate: '2026-01-15',
        description: 'Uso temporal de equipo audiovisual para la campana.',
        value: 200,
        valuationMethod:
          'Tres cotizaciones comparables conservadas como soporte.',
        valuationSourceReference: 'COTIZACIONES-2026-001',
        valuationSha256: valuationFile.digest,
      }) as CreateFinanceInKindDto,
    );

    const payableFile = await confirmedStorage(
      context.accountant,
      'payable',
      'd'.repeat(64),
    );
    const payable = await service.createPayable(
      context.accountant,
      command('PAYABLE_CREATE', {
        clientRequestId: randomUUID(),
        expenseEntryId: payableExpense.id,
        storagePath: payableFile.path,
        supportSha256: payableFile.digest,
        creditorName: 'Proveedor de integracion SAS',
        creditorTaxId: '900000001-1',
        description: 'Servicio causado con pago posterior conciliado.',
        incurredAt: '2026-01-20',
        dueAt: '2026-01-30',
        originalAmount: 300,
      }) as CreateFinancePayableDto,
    );
    const paymentLine = await prisma.financeBankStatementLine.findFirstOrThrow({
      where: {
        tenantId: context.tenantId,
        bankStatementId: statement.id,
        lineNumber: 3,
      },
    });
    const settlementFile = await confirmedStorage(
      context.accountant,
      'settlement',
      'e'.repeat(64),
    );
    const settlement = await service.settlePayable(
      context.accountant,
      payable.id,
      command(
        'PAYABLE_SETTLE',
        {
          clientRequestId: randomUUID(),
          bankStatementLineId: paymentLine.id,
          storagePath: settlementFile.path,
          supportSha256: settlementFile.digest,
          amount: 300,
          paidAt: '2026-01-20',
          paymentReference: 'EGR-002',
        },
        { payableId: payable.id },
      ) as SettleFinancePayableDto,
    );
    expect(settlement).toMatchObject({ status: 'PAID' });

    const firstVersion = await service.createReportVersion(
      context.preparer,
      dossier.id,
      command(
        'REPORT_VERSION_CREATE',
        {
          clientRequestId: randomUUID(),
          periodStartsAt: '2026-01-01',
          periodEndsAt: '2026-01-31',
          preparationNote:
            'Primer corte completo para revision interna, sin transmision oficial.',
        },
        { dossierId: dossier.id },
      ) as CreateFinanceReportVersionDto,
    );
    expect(firstVersion).toMatchObject({
      versionNumber: 1,
      internalStatus: 'DRAFT',
      ledgerCut: {
        entryCount: 5,
      },
    });
    expect(firstVersion.ledgerCut.totalIncome.toFixed(2)).toBe('1200.00');
    expect(firstVersion.ledgerCut.totalExpense.toFixed(2)).toBe('900.00');
    expect(firstVersion.ledgerCut.balance.toFixed(2)).toBe('300.00');
    await service.approveReportVersion(
      context.manager,
      firstVersion.id,
      command(
        'REPORT_APPROVAL_RECORD',
        {
          clientRequestId: randomUUID(),
          decision: FinanceApprovalDecision.RETURN_FOR_CORRECTION,
          rationale:
            'Se requiere documentar expresamente que esta version fue reemplazada.',
        },
        { versionId: firstVersion.id },
      ) as ApproveFinanceReportVersionDto,
    );

    const secondVersion = await service.createReportVersion(
      context.preparer,
      dossier.id,
      command(
        'REPORT_VERSION_CREATE',
        {
          clientRequestId: randomUUID(),
          periodStartsAt: '2026-01-01',
          periodEndsAt: '2026-01-31',
          basedOnVersionId: firstVersion.id,
          correctionReason:
            'Se incorpora la aclaracion solicitada sin reescribir el corte anterior.',
          preparationNote:
            'Version corregida lista para tres controles incompatibles e independientes.',
        },
        { dossierId: dossier.id },
      ) as CreateFinanceReportVersionDto,
    );
    expect(secondVersion).toMatchObject({
      versionNumber: 2,
      basedOnVersionId: firstVersion.id,
    });

    const managerApproval = (actor: AuthenticatedUser) =>
      service.approveReportVersion(
        actor,
        secondVersion.id,
        command(
          'REPORT_APPROVAL_RECORD',
          {
            clientRequestId: randomUUID(),
            decision: FinanceApprovalDecision.APPROVE,
            rationale:
              'Gerencia valida integridad operativa, conciliacion y responsabilidad.',
          },
          { versionId: secondVersion.id },
        ) as ApproveFinanceReportVersionDto,
      );
    const competing = await Promise.allSettled([
      managerApproval(context.manager),
      managerApproval(context.competingManager),
    ]);
    expect(
      competing.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      competing.filter(({ status }) => status === 'rejected'),
    ).toHaveLength(1);
    await service.approveReportVersion(
      context.accountant,
      secondVersion.id,
      command(
        'REPORT_APPROVAL_RECORD',
        {
          clientRequestId: randomUUID(),
          decision: FinanceApprovalDecision.APPROVE,
          rationale:
            'Contabilidad certifica cifras, soportes, causacion y conciliacion bancaria.',
        },
        { versionId: secondVersion.id },
      ) as ApproveFinanceReportVersionDto,
    );
    await service.approveReportVersion(
      context.compliance,
      secondVersion.id,
      command(
        'REPORT_APPROVAL_RECORD',
        {
          clientRequestId: randomUUID(),
          decision: FinanceApprovalDecision.APPROVE,
          rationale:
            'Cumplimiento verifica segregacion, trazabilidad y expediente probatorio.',
        },
        { versionId: secondVersion.id },
      ) as ApproveFinanceReportVersionDto,
    );

    const externalFile = await confirmedStorage(
      context.compliance,
      'external-evidence',
      'f'.repeat(64),
    );
    const evidence = await service.recordExternalEvidence(
      context.compliance,
      secondVersion.id,
      command(
        'EXTERNAL_EVIDENCE_RECORD',
        {
          clientRequestId: randomUUID(),
          storagePath: externalFile.path,
          authorityName: 'Consejo Nacional Electoral',
          channel: 'Registro manual informado por la campana',
          externalReference: 'CONSTANCIA-EXTERNA-2026-001',
          submittedAt: '2026-02-03T15:00:00.000Z',
          evidenceSha256: externalFile.digest,
        },
        { versionId: secondVersion.id },
      ) as RecordFinanceExternalEvidenceDto,
    );
    expect(evidence).toMatchObject({
      reviewStatus: 'PENDING',
      officialPlatformVerified: false,
    });
    const review = await service.reviewExternalEvidence(
      context.auditor,
      evidence.id,
      command(
        'EXTERNAL_EVIDENCE_REVIEW',
        {
          clientRequestId: randomUUID(),
          decision: FinanceExternalReviewDecision.APPROVE,
          reviewNote:
            'Auditor independiente coteja referencia, fecha y SHA del archivo aportado.',
        },
        { evidenceId: evidence.id },
      ) as ReviewFinanceExternalEvidenceDto,
    );
    expect(review).toMatchObject({
      coveredEntryCount: 5,
      officialPlatformVerified: false,
    });

    const overview = await service.overview(context.auditor);
    expect(overview.readiness).toMatchObject({
      readyForCloseout: true,
      blockers: [],
    });
    expect(overview.summary).toMatchObject({
      dossierCount: 1,
      bankStatementCount: 1,
      inKindContributionCount: 1,
      payableCount: 1,
      pendingEntryCount: 0,
      unmatchedBankLineCount: 0,
    });
    expect(overview.legalStateNotice).toContain('no radica automaticamente');
    const reported = await prisma.financialEntry.findMany({
      where: { tenantId: context.tenantId },
      select: { status: true, cneReportReference: true },
    });
    expect(reported).toHaveLength(5);
    expect(reported).toEqual(
      expect.arrayContaining([
        {
          status: FinanceStatus.REPORTED_CNE,
          cneReportReference: 'CONSTANCIA-EXTERNA-2026-001',
        },
      ]),
    );
    const persistedVersion =
      await prisma.financeReportVersion.findUniqueOrThrow({
        where: {
          id_tenantId: { id: secondVersion.id, tenantId: context.tenantId },
        },
        select: { ledgerCutId: true },
      });

    await expect(
      prisma.$executeRaw`
        UPDATE "FinanceLedgerCut"
        SET "ledgerSha256" = ${'0'.repeat(64)}
        WHERE "id" = ${persistedVersion.ledgerCutId}
          AND "tenantId" = ${context.tenantId}
      `,
    ).rejects.toThrow(/append-only/iu);
  });

  it('rejects every service and direct-table mutation after CLOSED', async () => {
    const context = await createContext(
      PoliticalOperationStage.CLOSED,
      OperationClosureType.CLOSED_NORMAL,
    );
    const input = command('DOSSIER_CREATE', {
      clientRequestId: randomUUID(),
      kind: FinanceReportKind.CANDIDATE,
      subjectCode: 'CLOSED-001',
      subjectName: 'Expediente que no debe crearse',
    }) as CreateFinanceDossierDto;
    await expect(service.createDossier(context.manager, input)).rejects.toThrow(
      /solo lectura/iu,
    );
    await expect(
      prisma.financeReportDossier.create({
        data: {
          id: randomUUID(),
          tenantId: context.tenantId,
          operationProfileId: context.profile.id,
          kind: FinanceReportKind.CANDIDATE,
          subjectCode: 'DIRECT-CLOSED',
          subjectName: 'Insercion directa prohibida',
          createdById: context.manager.userId,
        },
      }),
    ).rejects.toThrow(/CLOSED operation/iu);
  });
});
