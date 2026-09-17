import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceService } from './finance.service';
import {
  AuditActorType,
  EntryType,
  FinanceReportScope,
  FinanceStatus,
  PoliticalOperationMode,
  Prisma,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';

const completeSettings = (overrides: Record<string, unknown> = {}) => ({
  id: 'settings-a',
  maxTotalBudget: new Prisma.Decimal('1000000'),
  maxPublicityLimit: new Prisma.Decimal('250000'),
  electionName: 'Elecciones territoriales 2027',
  electionDate: new Date('2027-10-31T00:00:00.000Z'),
  reportScope: FinanceReportScope.CANDIDATE,
  officialLimitsReference: 'Resolución CNE 0001 de 2027',
  officialLimitsUrl: 'https://www.cne.gov.co/resoluciones/0001',
  reportDeadline: new Date('2027-11-30T00:00:00.000Z'),
  financialManagerName: 'Gerencia financiera',
  financialManagerDocument: '1234567890',
  accountantName: 'Contador responsable',
  accountantDocument: '9876543210',
  uniqueAccountBank: 'Banco autorizado',
  uniqueAccountLastFour: '1234',
  cuentasClarasCode: 'CC-CANDIDATO-001',
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  ...overrides,
});

const completeSettingsDto = (overrides: Record<string, unknown> = {}) => ({
  maxTotalBudget: 1_000_000,
  maxPublicityLimit: 250_000,
  electionName: 'Elecciones territoriales 2027',
  electionDate: '2027-10-31',
  reportScope: FinanceReportScope.CANDIDATE,
  officialLimitsReference: 'Resolución CNE 0001 de 2027',
  officialLimitsUrl: 'https://www.cne.gov.co/resoluciones/0001',
  reportDeadline: '2027-11-30',
  financialManagerName: 'Gerencia financiera',
  financialManagerDocument: '1234567890',
  accountantName: 'Contador responsable',
  accountantDocument: '9876543210',
  uniqueAccountBank: 'Banco autorizado',
  uniqueAccountLastFour: '1234',
  cuentasClarasCode: 'CC-CANDIDATO-001',
  ...overrides,
});

const openLifecycleQuery = () =>
  jest.fn().mockResolvedValue([{ stage: 'CAMPAIGN' }]);

describe('FinanceService tenant-safe exports', () => {
  it('queries only the JWT tenant and neutralizes malicious CSV cells', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        type: EntryType.EXPENSE,
        date: new Date('2026-08-21T00:00:00.000Z'),
        description: '=HYPERLINK("https://evil.invalid")',
        amount: 125000,
        vendorName: 'ACME",\r\n=WEBSERVICE("https://evil.invalid")',
        vendorTaxId: '+900123456',
        cneCode: 'OTROS',
        reporter: { name: '@SUM(1,1)' },
      },
    ]);
    const auditCreate = jest.fn().mockResolvedValue({ id: 'audit-a' });
    const transaction = {
      $queryRaw: openLifecycleQuery(),
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ role: Role.AUDITOR }),
      },
      campaignSettings: {
        findUnique: jest.fn().mockResolvedValue(completeSettings()),
      },
      financialEntry: { findMany },
      auditEvent: { create: auditCreate },
    };
    const runTransaction = jest.fn(
      async (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );
    const service = new FinanceService({
      $transaction: runTransaction,
    } as unknown as PrismaService);

    const csv = await service.generateCneReport(
      'tenant-from-jwt',
      'auditor-from-jwt',
    );

    expect(findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-from-jwt',
        status: { in: ['APPROVED', 'REPORTED_CNE'] },
      },
      select: {
        type: true,
        date: true,
        description: true,
        amount: true,
        vendorName: true,
        vendorTaxId: true,
        cneCode: true,
        reporter: { select: { name: true } },
      },
      orderBy: { date: 'asc' },
    });
    expect(csv.split('\n')).toHaveLength(2);
    expect(csv).not.toContain('\r');
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+900123456");
    expect(csv).toContain("'@SUM(1,1)");
    expect(csv).toContain('ACME""');
    expect(transaction.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'auditor-from-jwt',
        tenantId: 'tenant-from-jwt',
        isActive: true,
      },
      select: { role: true },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-from-jwt',
        mode: PoliticalOperationMode.CAMPAIGN,
        actorType: AuditActorType.USER,
        actorUserId: 'auditor-from-jwt',
        action: 'CAMPAIGN_CNE_REVIEW_DRAFT_EXPORTED',
        resourceType: 'CneReviewDraft',
        after: { status: 'GENERATED' },
        metadata: {
          format: 'CSV',
          recordCount: 1,
          includedTypes: [EntryType.INCOME, EntryType.EXPENSE],
          includedStatuses: [
            FinanceStatus.APPROVED,
            FinanceStatus.REPORTED_CNE,
          ],
        },
      },
    });
    const serializedAudit = JSON.stringify(auditCreate.mock.calls);
    expect(serializedAudit).not.toContain('HYPERLINK');
    expect(serializedAudit).not.toContain('900123456');
    expect(serializedAudit).not.toContain('SUM(1,1)');
  });

  it('does not return a CNE draft when its audit record fails', async () => {
    const transaction = {
      $queryRaw: openLifecycleQuery(),
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ role: Role.COMPLIANCE_OFFICER }),
      },
      campaignSettings: {
        findUnique: jest.fn().mockResolvedValue(completeSettings()),
      },
      financialEntry: { findMany: jest.fn().mockResolvedValue([]) },
      auditEvent: {
        create: jest.fn().mockRejectedValue(new Error('audit unavailable')),
      },
    };
    const service = new FinanceService({
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService);

    await expect(
      service.generateCneReport('tenant-a', 'compliance-a'),
    ).rejects.toThrow('audit unavailable');

    expect(transaction.financialEntry.findMany).toHaveBeenCalledTimes(1);
    expect(transaction.auditEvent.create).toHaveBeenCalledTimes(1);
  });

  it('revalidates the persisted export role and fails before reading finance data', async () => {
    const transaction = {
      $queryRaw: openLifecycleQuery(),
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ role: Role.VOLUNTEER }),
      },
      financialEntry: { findMany: jest.fn() },
      auditEvent: { create: jest.fn() },
    };
    const service = new FinanceService({
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService);

    await expect(
      service.generateCneReport('tenant-a', 'former-auditor-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(transaction.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'former-auditor-a',
        tenantId: 'tenant-a',
        isActive: true,
      },
      select: { role: true },
    });
    expect(transaction.financialEntry.findMany).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('rejects a finance object path owned by another tenant before writing', async () => {
    const create = jest.fn();
    const service = new FinanceService({
      campaignSettings: {
        findUnique: jest.fn().mockResolvedValue({ id: 'settings-a' }),
      },
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      financialEntry: { create },
    } as unknown as PrismaService);

    await expect(
      service.create('tenant-from-jwt', 'user-from-jwt', {
        type: 'INCOME',
        amount: 1000,
        date: '2026-08-21T00:00:00.000Z',
        cneCode: 'OTROS',
        description: 'Aporte',
        vendorName: 'Aportante',
        vendorTaxId: '900123456',
        evidenceUrl:
          'tenant-attacker/finance/123e4567-e89b-42d3-a456-426614174000.pdf',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('rolls back association when the durable upload cannot be consumed', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'entry-a',
      type: 'INCOME',
      amount: 1000,
      date: new Date('2026-08-21T00:00:00.000Z'),
      cneCode: 'OTROS',
      description: 'Aporte',
      vendorName: 'Aportante',
      vendorTaxId: '900123456',
      status: 'PENDING',
      createdAt: new Date(),
      reviewedAt: null,
      evidenceUrl: null,
      reporterId: 'user-a',
    });
    const consume = jest.fn().mockResolvedValue({ count: 0 });
    const transaction = {
      $queryRaw: openLifecycleQuery(),
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'user-a' }) },
      campaignSettings: {
        findUnique: jest.fn().mockResolvedValue(completeSettings()),
      },
      financialEntry: { create },
      storedObject: { updateMany: consume },
      auditEvent: { create: jest.fn() },
    };
    const service = new FinanceService({
      campaignSettings: {
        findUnique: jest.fn().mockResolvedValue({ id: 'settings-a' }),
      },
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService);
    const path = 'tenant-a/finance/123e4567-e89b-42d3-a456-426614174000.pdf';

    await expect(
      service.create('tenant-a', 'user-a', {
        type: 'INCOME',
        amount: 1000,
        date: '2026-08-21T00:00:00.000Z',
        cneCode: 'OTROS',
        description: 'Aporte',
        vendorName: 'Aportante',
        vendorTaxId: '900123456',
        evidenceUrl: path,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(consume).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        path,
        module: 'FINANCE',
        uploaderId: 'user-a',
        status: 'CONFIRMED',
        consumedAt: null,
      },
      data: expect.objectContaining({
        status: 'CONSUMED',
        consumedByType: 'FinancialEntry',
        consumedById: 'entry-a',
      }) as object,
    });
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('blocks every finance operation when the active mode is public office', async () => {
    const create = jest.fn();
    const findMany = jest.fn();
    const aggregate = jest.fn();
    const tenantFindUnique = jest.fn().mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
      type: TenantType.PUBLIC_OFFICE,
    });
    const transaction = {
      $queryRaw: openLifecycleQuery(),
      tenant: { findUnique: tenantFindUnique },
      user: { findFirst: jest.fn() },
      campaignSettings: {
        findUnique: jest.fn().mockResolvedValue(completeSettings()),
      },
      financialEntry: { create, aggregate },
      auditEvent: { create: jest.fn() },
    };
    const service = new FinanceService({
      campaignSettings: {
        findUnique: jest.fn().mockResolvedValue({ id: 'settings-a' }),
      },
      tenant: { findUnique: tenantFindUnique },
      financialEntry: { create, findMany, aggregate },
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService);

    await expect(
      service.create('tenant-a', 'user-a', {
        type: 'INCOME',
        amount: 1000,
        date: '2026-08-21T00:00:00.000Z',
        cneCode: 'OTROS',
        description: 'Aporte',
        vendorName: 'Aportante',
        vendorTaxId: '900123456',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.findAll('tenant-a')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.getSummary('tenant-a')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.generateCneReport('tenant-a', 'user-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
    expect(aggregate).not.toHaveBeenCalled();
  });

  it('returns safe finance views with a boolean instead of the private evidence path', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'entry-with-evidence',
        type: 'EXPENSE',
        amount: 100,
        date: new Date('2026-08-21T00:00:00.000Z'),
        cneCode: 'OTROS',
        description: 'Transporte',
        vendorName: 'Proveedor',
        vendorTaxId: '900123456',
        status: 'PENDING',
        createdAt: new Date('2026-08-21T00:00:00.000Z'),
        cneReportEvidenceUrl:
          'tenant-a/finance/223e4567-e89b-42d3-a456-426614174000.pdf',
        evidenceUrl:
          'tenant-a/finance/123e4567-e89b-42d3-a456-426614174000.pdf',
      },
      {
        id: 'entry-without-evidence',
        type: 'INCOME',
        amount: 200,
        date: new Date('2026-08-21T00:00:00.000Z'),
        cneCode: 'OTROS',
        description: 'Aporte',
        vendorName: 'Aportante',
        vendorTaxId: '900123457',
        status: 'PENDING',
        createdAt: new Date('2026-08-21T00:00:00.000Z'),
        cneReportEvidenceUrl: null,
        evidenceUrl: null,
      },
    ]);
    const create = jest.fn().mockResolvedValue({
      id: 'created-entry',
      type: 'INCOME',
      amount: 300,
      date: new Date('2026-08-21T00:00:00.000Z'),
      cneCode: 'OTROS',
      description: 'Aporte',
      vendorName: 'Aportante',
      vendorTaxId: '900123458',
      status: 'PENDING',
      createdAt: new Date('2026-08-21T00:00:00.000Z'),
      cneReportEvidenceUrl: null,
      evidenceUrl: 'tenant-a/finance/123e4567-e89b-42d3-a456-426614174000.pdf',
    });
    const tenantFindUnique = jest.fn().mockResolvedValue({
      defaultMode: PoliticalOperationMode.CAMPAIGN,
      type: TenantType.CANDIDACY,
    });
    const transaction = {
      $queryRaw: openLifecycleQuery(),
      tenant: { findUnique: tenantFindUnique },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'user-a' }) },
      campaignSettings: {
        findUnique: jest.fn().mockResolvedValue(completeSettings()),
      },
      financialEntry: { create },
      storedObject: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
    };
    const service = new FinanceService({
      campaignSettings: {
        findUnique: jest.fn().mockResolvedValue({ id: 'settings-a' }),
      },
      tenant: { findUnique: tenantFindUnique },
      financialEntry: { findMany },
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService);

    const listed = await service.findAll('tenant-a');
    const created = await service.create('tenant-a', 'user-a', {
      type: 'INCOME',
      amount: 300,
      date: '2026-08-21T00:00:00.000Z',
      cneCode: 'OTROS',
      description: 'Aporte',
      vendorName: 'Aportante',
      vendorTaxId: '900123458',
      evidenceUrl: 'tenant-a/finance/123e4567-e89b-42d3-a456-426614174000.pdf',
    });

    expect(listed.map((entry) => entry.hasEvidence)).toEqual([true, false]);
    expect(listed.map((entry) => entry.hasCneReportEvidence)).toEqual([
      true,
      false,
    ]);
    expect(created.hasEvidence).toBe(true);
    expect(created.hasCneReportEvidence).toBe(false);
    expect(listed[0]).not.toHaveProperty('evidenceUrl');
    expect(listed[0]).not.toHaveProperty('cneReportEvidenceUrl');
    expect(created).not.toHaveProperty('evidenceUrl');
    expect(created).not.toHaveProperty('cneReportEvidenceUrl');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({
          tenantId: true,
          auditLog: true,
        }) as object,
      }),
    );
  });

  it('atomically upserts tenant settings and records an audit event', async () => {
    const settings = completeSettings({
      createdAt: new Date('2026-08-21T00:00:00.000Z'),
      updatedAt: new Date('2026-08-21T00:00:00.000Z'),
    });
    const transaction = {
      $queryRaw: openLifecycleQuery(),
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'manager-a', role: Role.FINANCE_MANAGER }),
      },
      financialEntry: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
      campaignSettings: {
        findUnique: jest.fn().mockResolvedValue(
          completeSettings({
            maxTotalBudget: new Prisma.Decimal('900000'),
            maxPublicityLimit: new Prisma.Decimal('200000'),
          }),
        ),
        upsert: jest.fn().mockResolvedValue(settings),
      },
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
    };
    const runTransaction = jest.fn(
      async (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );
    const service = new FinanceService({
      $transaction: runTransaction,
    } as unknown as PrismaService);

    const result = await service.updateSettings(
      'tenant-a',
      'manager-a',
      completeSettingsDto({
        officialLimitsUrl: 'HTTPS://WWW.CNE.GOV.CO/resoluciones/0001',
      }),
    );

    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(transaction.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'manager-a', tenantId: 'tenant-a', isActive: true },
      select: { id: true, role: true },
    });
    expect(transaction.campaignSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-a' },
        update: expect.objectContaining({
          maxTotalBudget: expect.any(Prisma.Decimal),
          maxPublicityLimit: expect.any(Prisma.Decimal),
          electionName: 'Elecciones territoriales 2027',
          officialLimitsUrl: 'https://www.cne.gov.co/resoluciones/0001',
          financialManagerDocument: '1234567890',
          accountantDocument: '9876543210',
          uniqueAccountLastFour: '1234',
        }),
        create: expect.objectContaining({
          tenantId: 'tenant-a',
          maxTotalBudget: expect.any(Prisma.Decimal),
          maxPublicityLimit: expect.any(Prisma.Decimal),
        }),
      }),
    );
    expect(transaction.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
        actorType: AuditActorType.USER,
        actorUserId: 'manager-a',
        action: 'CAMPAIGN_FINANCE_SETTINGS_UPSERTED',
        resourceType: 'CampaignSettings',
        resourceId: 'settings-a',
        before: expect.objectContaining({ ready: true }),
        after: expect.objectContaining({ ready: true }),
      }),
    });
    const serializedAudit = JSON.stringify(
      transaction.auditEvent.create.mock.calls,
    );
    expect(serializedAudit).not.toContain('1234567890');
    expect(serializedAudit).not.toContain('9876543210');
    expect(serializedAudit).not.toContain('Gerencia financiera');
    expect(result).toEqual(
      expect.objectContaining({
        financialManagerDocumentMasked: '•••• 7890',
        accountantDocumentMasked: '•••• 3210',
        uniqueAccountLastFour: '1234',
        readiness: expect.objectContaining({ ready: true }),
      }),
    );
    expect(result).not.toHaveProperty('financialManagerDocument');
    expect(result).not.toHaveProperty('accountantDocument');
  });

  it('rejects a cross-tenant settings actor before upsert or audit', async () => {
    const upsert = jest.fn();
    const auditCreate = jest.fn();
    const transaction = {
      $queryRaw: openLifecycleQuery(),
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      campaignSettings: { findUnique: jest.fn(), upsert },
      auditEvent: { create: auditCreate },
    };
    const service = new FinanceService({
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService);

    await expect(
      service.updateSettings(
        'tenant-a',
        'user-from-tenant-b',
        completeSettingsDto(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'user-from-tenant-b',
        tenantId: 'tenant-a',
        isActive: true,
      },
      select: { id: true, role: true },
    });
    expect(upsert).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('blocks settings changes outside campaign mode', async () => {
    const upsert = jest.fn();
    const transaction = {
      $queryRaw: openLifecycleQuery(),
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
          type: TenantType.PUBLIC_OFFICE,
        }),
      },
      user: { findFirst: jest.fn() },
      campaignSettings: { findUnique: jest.fn(), upsert },
      auditEvent: { create: jest.fn() },
    };
    const service = new FinanceService({
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService);

    await expect(
      service.updateSettings(
        'tenant-office',
        'manager-a',
        completeSettingsDto(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(upsert).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('blocks movement creation when a legacy tenant has only budget limits', async () => {
    const financialCreate = jest.fn();
    const transaction = {
      $queryRaw: openLifecycleQuery(),
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'reporter-a' }),
      },
      campaignSettings: {
        findUnique: jest.fn().mockResolvedValue({
          maxTotalBudget: new Prisma.Decimal('1000000'),
          maxPublicityLimit: new Prisma.Decimal('250000'),
        }),
      },
      financialEntry: { create: financialCreate },
      auditEvent: { create: jest.fn() },
    };
    const service = new FinanceService({
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService);

    await expect(
      service.create('tenant-a', 'reporter-a', {
        type: 'INCOME',
        amount: 1000,
        date: '2027-01-10',
        cneCode: 'OTROS',
        description: 'Aporte registrado',
        vendorName: 'Aportante',
        vendorTaxId: '123456789',
      }),
    ).rejects.toThrow('completar el expediente electoral');
    expect(financialCreate).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('blocks the audited review draft when the compliance file is incomplete', async () => {
    const findMany = jest.fn();
    const auditCreate = jest.fn();
    const transaction = {
      $queryRaw: openLifecycleQuery(),
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ role: Role.AUDITOR }),
      },
      campaignSettings: {
        findUnique: jest.fn().mockResolvedValue(
          completeSettings({
            officialLimitsUrl: null,
          }),
        ),
      },
      financialEntry: { findMany },
      auditEvent: { create: auditCreate },
    };
    const service = new FinanceService({
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService);

    await expect(
      service.generateCneReport('tenant-a', 'auditor-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findMany).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('returns an authorized, tenant-scoped settings view with documents masked', async () => {
    const settings = completeSettings();
    const transaction = {
      $queryRaw: openLifecycleQuery(),
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ role: Role.FINANCE_MANAGER }),
      },
      campaignSettings: {
        findUnique: jest.fn().mockResolvedValue(settings),
      },
    };
    const service = new FinanceService({
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService);

    const result = await service.getSettings('tenant-from-jwt', 'manager-a');

    expect(transaction.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'manager-a',
        tenantId: 'tenant-from-jwt',
        isActive: true,
      },
      select: { role: true },
    });
    expect(transaction.campaignSettings.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-from-jwt' } }),
    );
    expect(result.settings).toEqual(
      expect.objectContaining({
        financialManagerDocumentMasked: '•••• 7890',
        accountantDocumentMasked: '•••• 3210',
        readiness: expect.objectContaining({ ready: true }),
      }),
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('1234567890');
    expect(serialized).not.toContain('9876543210');
    expect(result.settings).not.toHaveProperty('financialManagerDocument');
    expect(result.settings).not.toHaveProperty('accountantDocument');
  });
});
