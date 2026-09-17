import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  ElectoralCatalogEntryType,
  ElectoralCatalogStatus,
  ElectoralCatalogType,
  ElectoralCodeNamespace,
  PoliticalOperationMode,
  PoliticalOperationStage,
  Prisma,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { ElectoralCatalogService } from './electoral-catalog.service';
import { RNEC_DIVIPOLE_TREE_PARSER_VERSION } from './rnec-divipole-tree.parser';

const admin: AuthenticatedUser = {
  userId: 'admin-approver',
  tenantId: 'tenant-a',
  role: Role.ADMIN,
};

const complianceReviewer: AuthenticatedUser = {
  userId: 'compliance-reviewer',
  tenantId: 'tenant-a',
  role: Role.COMPLIANCE_OFFICER,
};

const syntheticTree = JSON.stringify({
  departments: [
    {
      code: '01',
      name: 'Departamento sintetico',
      municipalities: [
        {
          code: '001',
          name: 'Municipio sintetico',
          zones: [
            {
              code: '01',
              stands: [
                {
                  code: '01',
                  name: 'Puesto sintetico de prueba',
                  address: 'Direccion sintetica 1',
                  countTable: 12,
                  lat: 4.61,
                  lng: -74.08,
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});
const syntheticHash = createHash('sha256')
  .update(syntheticTree, 'utf8')
  .digest('hex');

const metadata = {
  catalogKey: 'RNEC_SYNTHETIC_TEST',
  sourceUrl: 'https://www.registraduria.gov.co/catalog-test.json',
  sourceDataset: 'Fixture sintetico para pruebas',
  sourceCutoffAt: '2026-01-30T00:00:00.000Z',
  electionDate: '2026-03-08',
  authorizationReference: 'Autorizacion sintetica de prueba',
  licenseDeclaration: 'Licencia sintetica de prueba',
  sourceArtifactPath: 'tenant-a/electoral-catalog/synthetic.json',
};

function savedRelease(overrides: Record<string, unknown> = {}) {
  return {
    id: 'release-a',
    tenantId: admin.tenantId,
    catalogKey: metadata.catalogKey,
    type: ElectoralCatalogType.ELECTORAL_RNEC,
    status: ElectoralCatalogStatus.STAGED,
    sourceUrl: metadata.sourceUrl,
    sourceOrganization: 'Registraduría Nacional del Estado Civil',
    sourceDataset: metadata.sourceDataset,
    sourceCutoffAt: new Date(metadata.sourceCutoffAt),
    electionDate: new Date('2026-03-08T00:00:00.000Z'),
    contentSha256: syntheticHash,
    parserVersion: RNEC_DIVIPOLE_TREE_PARSER_VERSION,
    authorizationReference: metadata.authorizationReference,
    licenseDeclaration: metadata.licenseDeclaration,
    sourceArtifactPath: metadata.sourceArtifactPath,
    recordCount: 4,
    departmentCount: 1,
    municipalityCount: 1,
    zoneCount: 1,
    pollingPlaceCount: 1,
    physicalPollingPlaceCount: null,
    expectedTableCount: 12,
    validationSummary: null,
    rejectionReason: null,
    createdById: 'admin-creator',
    validatedById: null,
    activatedById: null,
    approvedById: null,
    supersededByReleaseId: null,
    createdAt: new Date('2026-02-01T00:00:00.000Z'),
    validatedAt: null,
    activatedAt: null,
    supersededAt: null,
    ...overrides,
  };
}

function savedEntries() {
  return [
    {
      id: 'entry-department',
      tenantId: admin.tenantId,
      releaseId: 'release-a',
      namespace: ElectoralCodeNamespace.RNEC_DIVIPOLE,
      type: ElectoralCatalogEntryType.DEPARTMENT,
      canonicalCode: '01',
      departmentCode: '01',
      municipalityCode: null,
      zoneCode: null,
      pollingPlaceCode: null,
      sourceLocationCode: null,
      votingDate: null,
      parentId: null,
      name: 'Departamento sintetico',
      nameIsDerived: false,
      address: null,
      commune: null,
      latitude: null,
      longitude: null,
      timeZone: null,
      expectedTables: null,
    },
    {
      id: 'entry-municipality',
      tenantId: admin.tenantId,
      releaseId: 'release-a',
      namespace: ElectoralCodeNamespace.RNEC_DIVIPOLE,
      type: ElectoralCatalogEntryType.MUNICIPALITY,
      canonicalCode: '01/001',
      departmentCode: '01',
      municipalityCode: '001',
      zoneCode: null,
      pollingPlaceCode: null,
      sourceLocationCode: null,
      votingDate: null,
      parentId: 'entry-department',
      name: 'Municipio sintetico',
      nameIsDerived: false,
      address: null,
      commune: null,
      latitude: null,
      longitude: null,
      timeZone: null,
      expectedTables: null,
    },
    {
      id: 'entry-zone',
      tenantId: admin.tenantId,
      releaseId: 'release-a',
      namespace: ElectoralCodeNamespace.RNEC_DIVIPOLE,
      type: ElectoralCatalogEntryType.ZONE,
      canonicalCode: '01/001/01',
      departmentCode: '01',
      municipalityCode: '001',
      zoneCode: '01',
      pollingPlaceCode: null,
      sourceLocationCode: null,
      votingDate: null,
      parentId: 'entry-municipality',
      name: 'Zona 01',
      nameIsDerived: true,
      address: null,
      commune: null,
      latitude: null,
      longitude: null,
      timeZone: null,
      expectedTables: null,
    },
    {
      id: 'entry-place',
      tenantId: admin.tenantId,
      releaseId: 'release-a',
      namespace: ElectoralCodeNamespace.RNEC_DIVIPOLE,
      type: ElectoralCatalogEntryType.POLLING_PLACE,
      canonicalCode: '01/001/01/01',
      departmentCode: '01',
      municipalityCode: '001',
      zoneCode: '01',
      pollingPlaceCode: '01',
      sourceLocationCode: null,
      votingDate: null,
      parentId: 'entry-zone',
      name: 'Puesto sintetico de prueba',
      nameIsDerived: false,
      address: 'Direccion sintetica 1',
      commune: null,
      latitude: new Prisma.Decimal('4.61'),
      longitude: new Prisma.Decimal('-74.08'),
      timeZone: null,
      expectedTables: 12,
    },
  ];
}

function buildTransaction() {
  const transaction = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        type: TenantType.CANDIDACY,
        defaultMode: PoliticalOperationMode.CAMPAIGN,
      }),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({ id: admin.userId }),
    },
    operationProfile: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    electoralCatalogRelease: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve(savedRelease(data)),
        ),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve(savedRelease(data)),
        ),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    electoralCatalogEntry: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue({ id: 'cursor-a' }),
      findMany: jest.fn().mockResolvedValue(savedEntries()),
    },
    politicalDivision: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest
        .fn()
        .mockImplementation(
          ({ where }: { where?: { code?: { in?: string[] } } }) =>
            Promise.resolve(
              (where?.code?.in ?? []).map((code) => ({
                id: `division-${code}`,
                code,
              })),
            ),
        ),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    auditEvent: {
      create: jest.fn().mockResolvedValue({ id: 'audit-a' }),
    },
    $queryRaw: jest
      .fn()
      .mockImplementation((query: { sql: string }) =>
        Promise.resolve(
          query.sql.includes('FROM "OperationProfile"')
            ? [{ stage: 'CAMPAIGN' }]
            : [{ locked: true }],
        ),
      ),
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  return transaction;
}

function buildService(transaction = buildTransaction()) {
  const runTransaction = jest.fn(
    async (callback: (client: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
  );
  return {
    transaction,
    runTransaction,
    service: new ElectoralCatalogService({
      $transaction: runTransaction,
    } as unknown as PrismaService),
  };
}

describe('ElectoralCatalogService', () => {
  it('stages only a synthetic internal tree with JWT tenant ownership and immutable hash', async () => {
    const { service, transaction, runTransaction } = buildService();

    const result = await service.stageRnecTreeContent(
      admin,
      metadata,
      syntheticTree,
    );

    expect(result).toMatchObject({
      created: true,
      release: {
        tenantId: admin.tenantId,
        status: ElectoralCatalogStatus.STAGED,
        contentSha256: syntheticHash,
        sourceOrganization: 'Registraduría Nacional del Estado Civil',
      },
    });
    expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
      maxWait: 10_000,
      timeout: 120_000,
    });
    expect(transaction.electoralCatalogRelease.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: admin.tenantId,
          createdById: admin.userId,
          type: ElectoralCatalogType.ELECTORAL_RNEC,
          recordCount: 4,
          expectedTableCount: 12,
        }),
      }),
    );
    expect(transaction.electoralCatalogEntry.createMany).toHaveBeenCalledTimes(
      4,
    );
    type InsertBatch = {
      data: Array<{
        tenantId: string;
        releaseId: string;
        canonicalCode: string;
        parentId: string | null;
      }>;
    };
    const createManyCalls = transaction.electoralCatalogEntry.createMany.mock
      .calls as unknown as Array<[InsertBatch]>;
    const inserted = createManyCalls
      .flatMap(([call]) => call.data)
      .map((entry) => ({
        tenantId: entry.tenantId,
        releaseId: entry.releaseId,
        code: entry.canonicalCode,
        parentId: entry.parentId,
      }));
    expect(inserted).toEqual([
      expect.objectContaining({
        tenantId: admin.tenantId,
        releaseId: 'release-a',
        code: '01',
        parentId: null,
      }),
      expect.objectContaining({ code: '01/001', parentId: expect.any(String) }),
      expect.objectContaining({
        code: '01/001/01',
        parentId: expect.any(String),
      }),
      expect.objectContaining({
        code: '01/001/01/01',
        parentId: expect.any(String),
      }),
    ]);
    expect(transaction.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: admin.tenantId,
        actorUserId: admin.userId,
        actorType: AuditActorType.USER,
        action: 'ELECTORAL_CATALOG_STAGED',
        metadata: expect.objectContaining({
          transport: 'INTERNAL_TRUSTED_METHOD',
        }),
      }),
    });
    expect(
      JSON.stringify(transaction.auditEvent.create.mock.calls),
    ).not.toContain(syntheticTree);
  });

  it('returns the existing release for an exact content and metadata retry', async () => {
    const transaction = buildTransaction();
    transaction.electoralCatalogRelease.findFirst.mockResolvedValue(
      savedRelease(),
    );
    const { service } = buildService(transaction);

    await expect(
      service.stageRnecTreeContent(admin, metadata, syntheticTree),
    ).resolves.toMatchObject({ created: false, release: { id: 'release-a' } });
    expect(transaction.electoralCatalogRelease.create).not.toHaveBeenCalled();
    expect(transaction.electoralCatalogEntry.createMany).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('rejects the same content with conflicting immutable provenance', async () => {
    const transaction = buildTransaction();
    transaction.electoralCatalogRelease.findFirst.mockResolvedValue(
      savedRelease(),
    );
    const { service } = buildService(transaction);

    await expect(
      service.stageRnecTreeContent(
        admin,
        { ...metadata, catalogKey: 'DIFFERENT_CATALOG' },
        syntheticTree,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.electoralCatalogRelease.create).not.toHaveBeenCalled();
  });

  it.each([
    [
      'non-official source host',
      { sourceUrl: 'https://example.com/catalog.json' },
      'dominio oficial',
    ],
    [
      'unsafe artifact path',
      { sourceArtifactPath: 'tenant-b/electoral-catalog/source.json' },
      'prefijo',
    ],
    ['invalid catalog key', { catalogKey: 'rnec current' }, 'catalogKey'],
  ])('rejects unsafe internal metadata: %s', async (_label, patch, message) => {
    const { service, runTransaction } = buildService();

    await expect(
      service.stageRnecTreeContent(
        admin,
        { ...metadata, ...patch },
        syntheticTree,
      ),
    ).rejects.toThrow(message);
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('rejects a future source cutoff before opening a transaction', async () => {
    const { service, runTransaction } = buildService();

    await expect(
      service.stageRnecTreeContent(
        admin,
        { ...metadata, sourceCutoffAt: '2099-01-01T00:00:00.000Z' },
        syntheticTree,
      ),
    ).rejects.toThrow('sourceCutoffAt no puede estar en el futuro');
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('revalidates the active ADMIN in storage before every database mutation', async () => {
    const transaction = buildTransaction();
    transaction.user.findFirst.mockResolvedValue(null);
    const { service } = buildService(transaction);

    await expect(
      service.stageRnecTreeContent(admin, metadata, syntheticTree),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction.electoralCatalogRelease.create).not.toHaveBeenCalled();
  });

  it('refuses to stage any catalog entry when closure won the lifecycle lock', async () => {
    const transaction = buildTransaction();
    transaction.$queryRaw.mockImplementation((query: { sql: string }) =>
      Promise.resolve(
        query.sql.includes('FROM "OperationProfile"')
          ? [{ stage: PoliticalOperationStage.CLOSED }]
          : [{ locked: true }],
      ),
    );
    const { service } = buildService(transaction);

    await expect(
      service.stageRnecTreeContent(admin, metadata, syntheticTree),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'OPERATION_CLOSED' }),
    });
    expect(transaction.user.findFirst).not.toHaveBeenCalled();
    expect(transaction.electoralCatalogRelease.create).not.toHaveBeenCalled();
    expect(transaction.electoralCatalogEntry.createMany).not.toHaveBeenCalled();
  });

  it('lists releases only through tenant and optional status filters', async () => {
    const transaction = buildTransaction();
    transaction.electoralCatalogRelease.findMany.mockResolvedValue([
      savedRelease(),
    ]);
    const { service } = buildService(transaction);

    await service.listReleases(admin, {
      status: ElectoralCatalogStatus.STAGED,
      limit: 25,
    });

    expect(transaction.electoralCatalogRelease.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: admin.tenantId,
          status: ElectoralCatalogStatus.STAGED,
        },
        take: 25,
      }),
    );
  });

  it('allows an active compliance reviewer and revalidates the stored review role', async () => {
    const transaction = buildTransaction();
    transaction.user.findFirst.mockResolvedValue({
      id: complianceReviewer.userId,
    });
    const { service } = buildService(transaction);

    await expect(
      service.listReleases(complianceReviewer, { limit: 10 }),
    ).resolves.toEqual([]);
    expect(transaction.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: complianceReviewer.userId,
        tenantId: complianceReviewer.tenantId,
        role: {
          in: [Role.ADMIN, Role.COMPLIANCE_OFFICER, Role.AUDITOR],
        },
        isActive: true,
      },
      select: { id: true },
    });
  });

  it('never resolves a release outside the JWT tenant', async () => {
    const transaction = buildTransaction();
    transaction.electoralCatalogRelease.findFirst.mockResolvedValue(null);
    const { service } = buildService(transaction);

    await expect(
      service.getRelease(admin, 'tenant-b-release', { entryLimit: 10 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction.electoralCatalogRelease.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tenant-b-release', tenantId: admin.tenantId },
      }),
    );
    expect(transaction.electoralCatalogEntry.findMany).not.toHaveBeenCalled();
  });

  it('rejects a pagination cursor that does not belong to the same tenant release', async () => {
    const transaction = buildTransaction();
    transaction.electoralCatalogRelease.findFirst.mockResolvedValue(
      savedRelease(),
    );
    transaction.electoralCatalogEntry.findFirst.mockResolvedValue(null);
    const { service } = buildService(transaction);

    await expect(
      service.getRelease(admin, 'release-a', {
        entryLimit: 10,
        entryCursorId: 'tenant-b-cursor',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.electoralCatalogEntry.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'tenant-b-cursor',
        tenantId: admin.tenantId,
        releaseId: 'release-a',
      },
      select: { id: true },
    });
  });

  it('validates a staged snapshot and records tenant-scoped audit state', async () => {
    const transaction = buildTransaction();
    transaction.electoralCatalogRelease.findFirst.mockResolvedValue(
      savedRelease(),
    );
    transaction.electoralCatalogRelease.update.mockResolvedValue(
      savedRelease({
        status: ElectoralCatalogStatus.VALIDATED,
        validatedAt: new Date(),
        validatedById: admin.userId,
      }),
    );
    const { service } = buildService(transaction);

    await expect(
      service.validateRelease(admin, 'release-a', {
        expectedContentSha256: syntheticHash,
      }),
    ).resolves.toMatchObject({ validated: true, noOp: false });
    expect(transaction.electoralCatalogEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: admin.tenantId, releaseId: 'release-a' },
      }),
    );
    expect(transaction.electoralCatalogRelease.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_tenantId: { id: 'release-a', tenantId: admin.tenantId },
        },
        data: expect.objectContaining({
          status: ElectoralCatalogStatus.VALIDATED,
          validatedById: admin.userId,
        }),
      }),
    );
  });

  it('rejects a staged snapshot whose declared counts do not match entries', async () => {
    const transaction = buildTransaction();
    transaction.electoralCatalogRelease.findFirst.mockResolvedValue(
      savedRelease({ expectedTableCount: 99 }),
    );
    transaction.electoralCatalogRelease.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(savedRelease({ expectedTableCount: 99, ...data })),
    );
    const { service } = buildService(transaction);

    const result = await service.validateRelease(admin, 'release-a', {
      expectedContentSha256: syntheticHash,
    });

    expect(result).toMatchObject({
      validated: false,
      release: { status: ElectoralCatalogStatus.REJECTED },
      integrity: {
        valid: false,
        blockingIssues: [expect.stringContaining('expectedTables')],
      },
    });
    expect(transaction.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: admin.tenantId,
        action: 'ELECTORAL_CATALOG_REJECTED',
      }),
    });
  });

  it('makes repeated validation of an already validated release a no-op', async () => {
    const transaction = buildTransaction();
    transaction.electoralCatalogRelease.findFirst.mockResolvedValue(
      savedRelease({ status: ElectoralCatalogStatus.VALIDATED }),
    );
    const { service } = buildService(transaction);

    await expect(
      service.validateRelease(admin, 'release-a', {
        expectedContentSha256: syntheticHash,
      }),
    ).resolves.toMatchObject({ validated: true, noOp: true });
    expect(transaction.electoralCatalogEntry.findMany).not.toHaveBeenCalled();
    expect(transaction.electoralCatalogRelease.update).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('rejects validate and activate when the reviewed hash changed', async () => {
    const transaction = buildTransaction();
    transaction.electoralCatalogRelease.findFirst.mockResolvedValue(
      savedRelease({ status: ElectoralCatalogStatus.VALIDATED }),
    );
    const { service } = buildService(transaction);
    const wrongHash = '0'.repeat(64);

    await expect(
      service.validateRelease(admin, 'release-a', {
        expectedContentSha256: wrongHash,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.activateRelease(admin, 'release-a', {
        expectedContentSha256: wrongHash,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.electoralCatalogRelease.update).not.toHaveBeenCalled();
  });

  it('blocks activation without cutoff, authorization and license declarations', async () => {
    const transaction = buildTransaction();
    transaction.electoralCatalogRelease.findFirst.mockResolvedValue(
      savedRelease({
        status: ElectoralCatalogStatus.VALIDATED,
        authorizationReference: null,
      }),
    );
    const { service } = buildService(transaction);

    await expect(
      service.activateRelease(admin, 'release-a', {
        expectedContentSha256: syntheticHash,
      }),
    ).rejects.toThrow(
      'sin fecha de corte, autorizacion verificable y declaracion de licencia',
    );
    expect(transaction.$executeRaw).not.toHaveBeenCalled();
    expect(
      transaction.electoralCatalogRelease.updateMany,
    ).not.toHaveBeenCalled();
  });

  it.each([
    ['source cutoff', { sourceCutoffAt: null }],
    ['authorization', { authorizationReference: null }],
    ['license declaration', { licenseDeclaration: null }],
  ])('blocks activation without %s', async (_label, releasePatch) => {
    const transaction = buildTransaction();
    transaction.electoralCatalogRelease.findFirst.mockResolvedValue(
      savedRelease({
        status: ElectoralCatalogStatus.VALIDATED,
        ...releasePatch,
      }),
    );
    const { service } = buildService(transaction);

    await expect(
      service.activateRelease(admin, 'release-a', {
        expectedContentSha256: syntheticHash,
      }),
    ).rejects.toThrow(
      'sin fecha de corte, autorizacion verificable y declaracion de licencia',
    );
    expect(transaction.operationProfile.findUnique).not.toHaveBeenCalled();
    expect(transaction.$executeRaw).not.toHaveBeenCalled();
  });

  it('requires an active distinct authorized reviewer to approve activation', async () => {
    const transaction = buildTransaction();
    transaction.electoralCatalogRelease.findFirst.mockResolvedValue(
      savedRelease({
        status: ElectoralCatalogStatus.VALIDATED,
        createdById: admin.userId,
      }),
    );
    const { service } = buildService(transaction);

    await expect(
      service.activateRelease(admin, 'release-a', {
        expectedContentSha256: syntheticHash,
      }),
    ).rejects.toThrow('segunda persona');
    expect(transaction.$executeRaw).not.toHaveBeenCalled();
    expect(
      transaction.electoralCatalogRelease.updateMany,
    ).not.toHaveBeenCalled();
  });

  it('blocks activation when the release election date differs from the Bogota operation date', async () => {
    const transaction = buildTransaction();
    transaction.electoralCatalogRelease.findFirst.mockResolvedValue(
      savedRelease({ status: ElectoralCatalogStatus.VALIDATED }),
    );
    transaction.operationProfile.findUnique.mockResolvedValue({
      electionDate: new Date('2026-03-09T12:00:00.000Z'),
    });
    const { service } = buildService(transaction);

    await expect(
      service.activateRelease(admin, 'release-a', {
        expectedContentSha256: syntheticHash,
      }),
    ).rejects.toThrow(
      'La fecha electoral del release no coincide con el perfil operativo',
    );
    expect(transaction.electoralCatalogEntry.findMany).not.toHaveBeenCalled();
    expect(transaction.$executeRaw).not.toHaveBeenCalled();
  });

  it('blocks the first activation when legacy or DANE divisions need a crosswalk', async () => {
    const transaction = buildTransaction();
    const validated = savedRelease({
      status: ElectoralCatalogStatus.VALIDATED,
    });
    transaction.electoralCatalogRelease.findFirst
      .mockResolvedValueOnce(validated)
      .mockResolvedValueOnce(validated)
      .mockResolvedValueOnce(null);
    transaction.politicalDivision.findMany.mockResolvedValueOnce([
      {
        id: 'legacy-place',
        code: 'LEGACY-01',
        name: 'Puesto legacy',
        _count: { users: 1, voters: 2, witnesses: 3, issueCases: 4 },
      },
    ]);
    const { service } = buildService(transaction);

    await expect(
      service.activateRelease(admin, 'release-a', {
        expectedContentSha256: syntheticHash,
      }),
    ).rejects.toThrow('Falta un crosswalk');
    expect(transaction.politicalDivision.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: admin.tenantId,
          isActive: true,
          AND: [
            {
              OR: [
                { sourceNamespace: null },
                { sourceNamespace: ElectoralCodeNamespace.DANE_DIVIPOLA },
              ],
            },
            {
              OR: [
                { users: { some: { tenantId: admin.tenantId } } },
                { voters: { some: { tenantId: admin.tenantId } } },
                { witnesses: { some: { tenantId: admin.tenantId } } },
                { issueCases: { some: { tenantId: admin.tenantId } } },
              ],
            },
          ],
        },
      }),
    );
    expect(transaction.politicalDivision.updateMany).not.toHaveBeenCalled();
    expect(transaction.$executeRaw).not.toHaveBeenCalled();
    expect(
      transaction.electoralCatalogRelease.updateMany,
    ).not.toHaveBeenCalled();
  });

  it('retires unreferenced legacy divisions on the first activation without deleting them', async () => {
    const transaction = buildTransaction();
    const validated = savedRelease({
      status: ElectoralCatalogStatus.VALIDATED,
    });
    transaction.electoralCatalogRelease.findFirst
      .mockResolvedValueOnce(validated)
      .mockResolvedValueOnce(validated)
      .mockResolvedValueOnce(null);
    transaction.politicalDivision.updateMany.mockResolvedValueOnce({
      count: 2,
    });
    const { service } = buildService(transaction);

    await expect(
      service.activateRelease(admin, 'release-a', {
        expectedContentSha256: syntheticHash,
      }),
    ).resolves.toMatchObject({
      activated: true,
      retiredLegacy: 2,
      retiredRnec: 0,
    });
    expect(transaction.politicalDivision.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: admin.tenantId,
        isActive: true,
        OR: [
          { sourceNamespace: null },
          { sourceNamespace: ElectoralCodeNamespace.DANE_DIVIPOLA },
        ],
      },
      data: {
        isActive: false,
        retiredAt: expect.any(Date),
      },
    });
    expect(transaction.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({ retiredLegacyDivisions: 2 }),
      }),
    });
  });

  it('blocks only removed RNEC divisions that still have historical references', async () => {
    const transaction = buildTransaction();
    const validated = savedRelease({
      status: ElectoralCatalogStatus.VALIDATED,
    });
    const active = savedRelease({
      id: 'release-old',
      status: ElectoralCatalogStatus.ACTIVE,
    });
    transaction.electoralCatalogRelease.findFirst
      .mockResolvedValueOnce(validated)
      .mockResolvedValueOnce(validated)
      .mockResolvedValueOnce(active);
    transaction.politicalDivision.findMany
      .mockResolvedValueOnce([
        {
          id: 'division-removed',
          code: 'RNEC_DIVIPOLE:01/001/01/02',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'division-removed',
          code: 'RNEC_DIVIPOLE:01/001/01/02',
          name: 'Puesto retirado',
          _count: { users: 0, voters: 1, witnesses: 0, issueCases: 0 },
        },
      ]);
    const { service } = buildService(transaction);

    await expect(
      service.activateRelease(admin, 'release-a', {
        expectedContentSha256: syntheticHash,
      }),
    ).rejects.toThrow('Defina y ejecute un crosswalk');
    expect(transaction.$executeRaw).not.toHaveBeenCalled();
    expect(transaction.politicalDivision.updateMany).not.toHaveBeenCalled();
    expect(
      transaction.electoralCatalogRelease.updateMany,
    ).not.toHaveBeenCalled();
  });

  it('activates atomically under advisory lock, supersedes prior release and materializes full codes', async () => {
    const transaction = buildTransaction();
    const validated = savedRelease({
      status: ElectoralCatalogStatus.VALIDATED,
      validatedAt: new Date('2026-02-02T00:00:00.000Z'),
      validatedById: 'admin-validator',
    });
    const active = savedRelease({
      id: 'release-old',
      catalogKey: 'ANOTHER_RNEC_CATALOG',
      status: ElectoralCatalogStatus.ACTIVE,
    });
    transaction.electoralCatalogRelease.findFirst
      .mockResolvedValueOnce(validated)
      .mockResolvedValueOnce(validated)
      .mockResolvedValueOnce(active);
    transaction.politicalDivision.findMany
      .mockResolvedValueOnce([
        {
          id: 'division-removed',
          code: 'RNEC_DIVIPOLE:01/001/01/02',
        },
      ])
      .mockResolvedValueOnce([]);
    transaction.politicalDivision.updateMany.mockResolvedValueOnce({
      count: 1,
    });
    transaction.electoralCatalogRelease.updateMany.mockResolvedValue({
      count: 1,
    });
    transaction.electoralCatalogRelease.update.mockResolvedValue(
      savedRelease({
        status: ElectoralCatalogStatus.ACTIVE,
        validatedAt: validated.validatedAt,
        validatedById: validated.validatedById,
        activatedAt: new Date(),
        activatedById: admin.userId,
        approvedById: admin.userId,
      }),
    );
    const { service } = buildService(transaction);

    await expect(
      service.activateRelease(admin, 'release-a', {
        expectedContentSha256: syntheticHash,
      }),
    ).resolves.toMatchObject({
      activated: true,
      noOp: false,
      superseded: 1,
      retiredLegacy: 0,
      retiredRnec: 1,
      release: {
        status: ElectoralCatalogStatus.ACTIVE,
        approvedById: admin.userId,
      },
    });
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(3);
    expect(transaction.$executeRaw).toHaveBeenCalledTimes(4);
    for (const [query] of transaction.$executeRaw.mock.calls) {
      expect(query.sql).toContain('INSERT INTO "PoliticalDivision"');
      expect(query.sql).toContain('ON CONFLICT');
      expect(query.sql).toContain('"sourceNamespace"');
      expect(query.sql).toContain('"sourceReleaseId"');
      expect(query.sql).toContain('"name" = EXCLUDED."name"');
      expect(query.sql).toContain('"type" = EXCLUDED."type"');
      expect(query.sql).toContain('"parentId" = EXCLUDED."parentId"');
      expect(query.sql).toContain(
        '"expectedTables" = EXCLUDED."expectedTables"',
      );
      expect(query.sql).toContain('"isActive" = true');
      expect(query.sql).toContain('"retiredAt" = NULL');
      expect(query.sql).not.toContain('"id" = EXCLUDED."id"');
    }
    expect(transaction.politicalDivision.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: admin.tenantId,
        id: { in: ['division-removed'] },
        sourceNamespace: ElectoralCodeNamespace.RNEC_DIVIPOLE,
        isActive: true,
      },
      data: { isActive: false, retiredAt: expect.any(Date) },
    });
    expect(transaction.electoralCatalogRelease.updateMany).toHaveBeenCalledWith(
      {
        where: {
          tenantId: admin.tenantId,
          type: ElectoralCatalogType.ELECTORAL_RNEC,
          status: ElectoralCatalogStatus.ACTIVE,
          id: { not: 'release-a' },
        },
        data: expect.objectContaining({
          status: ElectoralCatalogStatus.SUPERSEDED,
          supersededByReleaseId: 'release-a',
        }),
      },
    );
    expect(transaction.electoralCatalogRelease.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_tenantId: { id: 'release-a', tenantId: admin.tenantId },
        },
        data: expect.objectContaining({
          status: ElectoralCatalogStatus.ACTIVE,
          activatedById: admin.userId,
          approvedById: admin.userId,
        }),
      }),
    );
    expect(transaction.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: admin.tenantId,
        mode: PoliticalOperationMode.CAMPAIGN,
        action: 'ELECTORAL_CATALOG_ACTIVATED',
      }),
    });
  });

  it('does not advance lifecycle or audit when materialization fails inside the transaction', async () => {
    const transaction = buildTransaction();
    transaction.electoralCatalogRelease.findFirst.mockResolvedValue(
      savedRelease({ status: ElectoralCatalogStatus.VALIDATED }),
    );
    transaction.$executeRaw.mockRejectedValue(new Error('database failure'));
    const { service } = buildService(transaction);

    await expect(
      service.activateRelease(admin, 'release-a', {
        expectedContentSha256: syntheticHash,
      }),
    ).rejects.toThrow('database failure');
    expect(
      transaction.electoralCatalogRelease.updateMany,
    ).not.toHaveBeenCalled();
    expect(transaction.electoralCatalogRelease.update).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('fails closed if a concurrent change prevents retiring every removed RNEC division', async () => {
    const transaction = buildTransaction();
    const validated = savedRelease({
      status: ElectoralCatalogStatus.VALIDATED,
    });
    const active = savedRelease({
      id: 'release-old',
      status: ElectoralCatalogStatus.ACTIVE,
    });
    transaction.electoralCatalogRelease.findFirst
      .mockResolvedValueOnce(validated)
      .mockResolvedValueOnce(validated)
      .mockResolvedValueOnce(active);
    transaction.politicalDivision.findMany
      .mockResolvedValueOnce([
        {
          id: 'division-removed',
          code: 'RNEC_DIVIPOLE:01/001/01/02',
        },
      ])
      .mockResolvedValueOnce([]);
    transaction.politicalDivision.updateMany.mockResolvedValueOnce({
      count: 0,
    });
    const { service } = buildService(transaction);

    await expect(
      service.activateRelease(admin, 'release-a', {
        expectedContentSha256: syntheticHash,
      }),
    ).rejects.toThrow('cambio durante la activacion');
    expect(
      transaction.electoralCatalogRelease.updateMany,
    ).not.toHaveBeenCalled();
    expect(transaction.electoralCatalogRelease.update).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('makes activation retries of the active hash idempotent', async () => {
    const transaction = buildTransaction();
    transaction.electoralCatalogRelease.findFirst.mockResolvedValue(
      savedRelease({ status: ElectoralCatalogStatus.ACTIVE }),
    );
    const { service } = buildService(transaction);

    await expect(
      service.activateRelease(admin, 'release-a', {
        expectedContentSha256: syntheticHash,
      }),
    ).resolves.toMatchObject({
      activated: true,
      noOp: true,
      retiredLegacy: 0,
      retiredRnec: 0,
    });
    expect(transaction.$executeRaw).not.toHaveBeenCalled();
    expect(
      transaction.electoralCatalogRelease.updateMany,
    ).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('reports non-blocking coordinate and commune gaps without inventing data', async () => {
    const transaction = buildTransaction();
    transaction.electoralCatalogRelease.findFirst.mockResolvedValue(
      savedRelease(),
    );
    const entries = savedEntries();
    entries[3] = {
      ...entries[3],
      latitude: null,
      longitude: null,
      commune: null,
    } as (typeof entries)[number];
    transaction.electoralCatalogEntry.findMany.mockResolvedValue(entries);
    const { service } = buildService(transaction);

    await expect(
      service.getReleaseGaps(admin, 'release-a'),
    ).resolves.toMatchObject({
      integrity: {
        valid: true,
        gaps: {
          pollingPlacesWithoutCoordinates: 1,
          pollingPlacesWithoutCommune: 1,
        },
      },
    });
  });

  it('diffs only releases from the same tenant and catalog', async () => {
    const transaction = buildTransaction();
    const target = savedRelease({ id: 'release-a' });
    const base = savedRelease({ id: 'release-base' });
    transaction.electoralCatalogRelease.findFirst
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce(base);
    const targetEntries = savedEntries();
    const baseEntries = savedEntries().map((entry) => ({
      ...entry,
      releaseId: 'release-base',
    }));
    baseEntries[3] = {
      ...baseEntries[3],
      expectedTables: 10,
    } as (typeof baseEntries)[number];
    transaction.electoralCatalogEntry.findMany
      .mockResolvedValueOnce(targetEntries)
      .mockResolvedValueOnce(baseEntries);
    const { service } = buildService(transaction);

    await expect(
      service.diffRelease(admin, 'release-a', {
        againstReleaseId: 'release-base',
      }),
    ).resolves.toMatchObject({
      target: { id: 'release-a' },
      base: { id: 'release-base' },
      summary: { added: 0, removed: 0, changed: 1 },
      sample: {
        changed: [
          {
            code: 'RNEC_DIVIPOLE:01/001/01/01',
            fields: ['expectedTables'],
          },
        ],
      },
    });
    expect(
      transaction.electoralCatalogRelease.findFirst.mock.calls[1][0].where,
    ).toEqual({
      id: 'release-base',
      tenantId: admin.tenantId,
      catalogKey: metadata.catalogKey,
    });
    for (const [call] of transaction.electoralCatalogEntry.findMany.mock
      .calls) {
      expect(call.where.tenantId).toBe(admin.tenantId);
    }
  });
});
