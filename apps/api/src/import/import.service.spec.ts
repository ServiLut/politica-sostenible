import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  ConsentCollectionChannel,
  DivisionType,
  PoliticalOperationMode,
  Role,
  StorageObjectModule,
  StoredObjectStatus,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { IdentityService } from '../common/services/identity.service';
import { PrismaService } from '../prisma/prisma.service';
import { ImportService } from './import.service';

jest.mock('../auth/guards/plan-limits.guard', () => ({
  assertPlanQuotaInTransaction: jest.fn().mockResolvedValue(undefined),
}));

const EVIDENCE_PATH =
  'tenant-a/consent/123e4567-e89b-42d3-a456-426614174000.pdf';
const SECOND_EVIDENCE_PATH =
  'tenant-a/consent/223e4567-e89b-42d3-a456-426614174001.png';
const NOTICE_VERSION = '2026-v1';
const HEADERS = [
  'Documento',
  'Nombre',
  'Apellido',
  'Teléfono',
  'Correo',
  'Puesto',
  'Mesa',
  'Consentimiento',
  'Version aviso',
  'Fecha consentimiento',
  'Ruta evidencia',
];

function escapeCsv(value: string): string {
  return /[",;\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function csvRow(
  overrides: Partial<{
    documentId: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    puesto: string;
    mesa: string;
    consent: string;
    noticeVersion: string;
    grantedAt: string;
    proofPath: string;
  }> = {},
): string {
  const row = {
    documentId: '1012345678',
    firstName: 'Ana',
    lastName: 'Pérez',
    phone: '300 123 4567',
    email: 'ANA@EXAMPLE.TEST',
    puesto: '',
    mesa: '',
    consent: 'SI',
    noticeVersion: NOTICE_VERSION,
    grantedAt: new Date(Date.now() - 60_000).toISOString(),
    proofPath: EVIDENCE_PATH,
    ...overrides,
  };

  return [
    row.documentId,
    row.firstName,
    row.lastName,
    row.phone,
    row.email,
    row.puesto,
    row.mesa,
    row.consent,
    row.noticeVersion,
    row.grantedAt,
    row.proofPath,
  ]
    .map(escapeCsv)
    .join(',');
}

function csv(...rows: string[]): string {
  return [HEADERS.join(','), ...rows].join('\n');
}

describe('ImportService privacy and tenant isolation', () => {
  const user: AuthenticatedUser = {
    tenantId: 'tenant-a',
    userId: 'admin-a',
    role: Role.ADMIN,
  };

  function createHarness(options?: {
    existingDocuments?: string[];
    availableEvidence?: string[];
    actorRole?: Role;
  }) {
    const existingDocuments = options?.existingDocuments ?? [];
    const availableEvidence = options?.availableEvidence ?? [EVIDENCE_PATH];
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ stage: 'CAMPAIGN' }]),
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ role: options?.actorRole ?? Role.ADMIN }),
      },
      consentNotice: {
        findFirst: jest.fn().mockResolvedValue({
          version: NOTICE_VERSION,
          activatedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      },
      operationProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'profile-a' }),
      },
      politicalDivision: { findMany: jest.fn().mockResolvedValue([]) },
      voter: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'voter-a' }),
      },
      storedObject: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      consentRecord: {
        create: jest.fn().mockResolvedValue({ id: 'consent-a' }),
      },
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
    };
    const prisma = {
      tenant: transaction.tenant,
      user: transaction.user,
      consentNotice: transaction.consentNotice,
      operationProfile: transaction.operationProfile,
      politicalDivision: transaction.politicalDivision,
      voter: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            existingDocuments.map((documentId) => ({ documentId })),
          ),
      },
      storedObject: {
        findMany: jest
          .fn()
          .mockImplementation(
            ({ where }: { where: { path: { in: string[] } } }) =>
              Promise.resolve(
                availableEvidence
                  .filter((path) => where.path.in.includes(path))
                  .map((path) => ({ path })),
              ),
          ),
      },
      $transaction: jest
        .fn()
        .mockImplementation(
          (callback: (tx: typeof transaction) => Promise<unknown>) =>
            callback(transaction),
        ),
    };
    const identity = {
      validateCedula: jest
        .fn()
        .mockImplementation((value: string) => /^\d{3,10}$/u.test(value)),
    } as unknown as IdentityService;
    const service = new ImportService(
      prisma as unknown as PrismaService,
      identity,
    );

    return { prisma, service, transaction };
  }

  it('previews valid rows and scopes identity, duplicate and evidence checks', async () => {
    const { prisma, service } = createHarness({
      existingDocuments: ['987654321'],
      availableEvidence: [EVIDENCE_PATH, SECOND_EVIDENCE_PATH],
    });
    const source = csv(
      csvRow(),
      csvRow({
        documentId: '987654321',
        firstName: 'Carlos',
        proofPath: SECOND_EVIDENCE_PATH,
      }),
    );

    await expect(
      service.preview('personas', source, user),
    ).resolves.toMatchObject({
      totalRows: 2,
      validRows: 1,
      duplicatesInDatabase: 1,
      errorRows: [],
      preview: expect.arrayContaining([
        expect.objectContaining({
          documentId: '1012345678',
          status: 'new',
        }),
        expect.objectContaining({
          documentId: '987654321',
          status: 'duplicate_db',
        }),
      ]),
    });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'admin-a', tenantId: 'tenant-a', isActive: true },
      select: { role: true },
    });
    expect(prisma.voter.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        documentId: { in: ['1012345678', '987654321'] },
      },
      select: { documentId: true },
    });
    expect(prisma.storedObject.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        path: { in: [EVIDENCE_PATH] },
        module: StorageObjectModule.CONSENT,
        status: StoredObjectStatus.CONFIRMED,
        consumedAt: null,
      },
      select: { path: true },
    });
  });

  it('rejects every row for a repeated document and never lets execute choose different data or evidence', async () => {
    const { prisma, service, transaction } = createHarness({
      availableEvidence: [EVIDENCE_PATH, SECOND_EVIDENCE_PATH],
    });
    const source = csv(
      csvRow({
        firstName: 'Ana Preview',
        lastName: 'Primera',
        proofPath: EVIDENCE_PATH,
      }),
      csvRow({
        firstName: 'Nombre Distinto',
        lastName: 'Segunda',
        proofPath: SECOND_EVIDENCE_PATH,
      }),
    );

    const preview = await service.preview('personas', source, user);

    expect(preview).toMatchObject({
      totalRows: 2,
      validRows: 0,
      duplicatesInFile: 1,
      errorRows: [
        expect.objectContaining({ row: 2, field: 'Documento' }),
        expect.objectContaining({ row: 3, field: 'Documento' }),
      ],
      preview: [
        expect.objectContaining({
          firstName: 'Ana Preview',
          lastName: 'Primera',
          status: 'duplicate_file',
        }),
        expect.objectContaining({
          firstName: 'Nombre Distinto',
          lastName: 'Segunda',
          status: 'duplicate_file',
        }),
      ],
    });
    expect(prisma.storedObject.findMany).not.toHaveBeenCalled();

    await expect(
      service.execute('personas', source, user),
    ).rejects.toMatchObject({
      response: {
        message: 'El archivo contiene errores. Revise la vista previa.',
        errors: preview.errorRows,
      },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(transaction.voter.create).not.toHaveBeenCalled();
    expect(transaction.storedObject.updateMany).not.toHaveBeenCalled();
    expect(transaction.consentRecord.create).not.toHaveBeenCalled();
  });

  it('supports quoted separators and escaped quotes without corrupting fields', async () => {
    const { service } = createHarness();
    const source = csv(
      csvRow({ firstName: 'Ana, "María"', lastName: 'De la Cruz' }),
    );

    await expect(
      service.preview('personas', source, user),
    ).resolves.toMatchObject({
      validRows: 1,
      errorRows: [],
      preview: [
        expect.objectContaining({
          firstName: 'Ana, "María"',
          lastName: 'De la Cruz',
        }),
      ],
    });
  });

  it('rejects absent proof, reused proof and cross-tenant paths', async () => {
    const absent = createHarness({ availableEvidence: [] });
    await expect(
      absent.service.preview('personas', csv(csvRow()), user),
    ).resolves.toMatchObject({
      validRows: 0,
      errorRows: [expect.objectContaining({ field: 'Ruta evidencia' })],
    });

    const reused = createHarness({
      availableEvidence: [EVIDENCE_PATH],
    });
    await expect(
      reused.service.preview(
        'personas',
        csv(
          csvRow(),
          csvRow({ documentId: '987654321', proofPath: EVIDENCE_PATH }),
        ),
        user,
      ),
    ).resolves.toMatchObject({
      errorRows: [
        expect.objectContaining({
          field: 'Ruta evidencia',
          message: expect.stringContaining('única'),
        }),
      ],
    });

    const crossTenant = createHarness();
    await expect(
      crossTenant.service.preview(
        'personas',
        csv(
          csvRow({ proofPath: EVIDENCE_PATH.replace('tenant-a', 'tenant-b') }),
        ),
        user,
      ),
    ).resolves.toMatchObject({
      validRows: 0,
      errorRows: [expect.objectContaining({ field: 'Ruta evidencia' })],
    });
  });

  it.each([
    ['consentimiento inventado', { consent: 'NO' }],
    ['versión obsoleta', { noticeVersion: 'old-v1' }],
    [
      'fecha futura',
      { grantedAt: new Date(Date.now() + 60_000).toISOString() },
    ],
    ['mesa parcial', { mesa: '12abc' }],
    ['correo inválido', { email: 'correo-invalido' }],
    ['puesto ajeno o inexistente', { puesto: 'Puesto inexistente' }],
  ])('fails closed for %s', async (_label, overrides) => {
    const { service } = createHarness();
    await expect(
      service.preview('personas', csv(csvRow(overrides)), user),
    ).resolves.toMatchObject({ validRows: 0, errorRows: expect.any(Array) });
  });

  it('scopes voting-place validation to the active tenant', async () => {
    const { prisma, service } = createHarness();
    prisma.politicalDivision.findMany.mockResolvedValue([
      { name: 'Puesto Central', code: 'P-001' },
    ]);

    await expect(
      service.preview(
        'personas',
        csv(csvRow({ puesto: 'Puesto Central' })),
        user,
      ),
    ).resolves.toMatchObject({ validRows: 1, errorRows: [] });
    expect(prisma.politicalDivision.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        type: DivisionType.PUESTO,
        isActive: true,
      },
      select: { name: true, code: true },
    });
  });

  it('rejects a duplicated polling-place name instead of selecting the first match', async () => {
    const { prisma, service } = createHarness();
    prisma.politicalDivision.findMany.mockResolvedValue([
      { name: 'Institución Educativa Central', code: '05-001-01-01' },
      { name: 'Institución Educativa Central', code: '76-001-02-03' },
    ]);

    await expect(
      service.preview(
        'personas',
        csv(csvRow({ puesto: 'Institución Educativa Central' })),
        user,
      ),
    ).resolves.toMatchObject({
      validRows: 0,
      errorRows: [
        expect.objectContaining({
          field: 'Puesto',
          message: expect.stringContaining('varios puestos'),
        }),
      ],
    });
  });

  it('treats an exact electoral place code as authoritative even when names repeat', async () => {
    const { prisma, service } = createHarness();
    prisma.politicalDivision.findMany.mockResolvedValue([
      { name: 'Institución Educativa Central', code: '05-001-01-01' },
      { name: 'Institución Educativa Central', code: '76-001-02-03' },
    ]);

    await expect(
      service.preview(
        'personas',
        csv(csvRow({ puesto: '76-001-02-03' })),
        user,
      ),
    ).resolves.toMatchObject({ validRows: 1, errorRows: [] });
  });

  it('consumes one confirmed proof and never fabricates an IP when executing', async () => {
    const { service, transaction } = createHarness();
    const source = csv(csvRow({ mesa: '12' }));

    await expect(service.execute('personas', source, user)).resolves.toEqual({
      success: true,
      imported: 1,
      skipped: 0,
    });
    expect(transaction.voter.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        registrarId: 'admin-a',
        phone: '3001234567',
        email: 'ana@example.test',
        mesa: 12,
        consentAccepted: true,
        termsVersion: NOTICE_VERSION,
      }),
      select: { id: true },
    });
    expect(transaction.voter.create.mock.calls[0][0].data).not.toHaveProperty(
      'consentIp',
    );
    expect(transaction.storedObject.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        path: EVIDENCE_PATH,
        module: StorageObjectModule.CONSENT,
        status: StoredObjectStatus.CONFIRMED,
        consumedAt: null,
      },
      data: {
        status: StoredObjectStatus.CONSUMED,
        consumedAt: expect.any(Date),
        consumedByType: 'VoterConsent',
        consumedById: 'voter-a',
      },
    });
    expect(transaction.consentRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        voterId: 'voter-a',
        collectionChannel: ConsentCollectionChannel.IMPORT,
        noticeVersion: NOTICE_VERSION,
        proofPath: EVIDENCE_PATH,
      }),
    });
    expect(
      transaction.consentRecord.create.mock.calls[0][0].data,
    ).not.toHaveProperty('sourceIpHash');
  });

  it('rejects malformed files and unsupported modules before reading voter data', async () => {
    const { prisma, service } = createHarness();

    await expect(
      service.preview('usuarios', csv(csvRow()), user),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.preview('personas', `${HEADERS.join(',')}\n"sin cerrar`, user),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.preview('personas', 'Documento,Nombre\n123,Ana', user),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.voter.findMany).not.toHaveBeenCalled();
  });

  it('revalidates the current database role instead of trusting a stale JWT', async () => {
    const { service } = createHarness({ actorRole: Role.VOLUNTEER });

    await expect(
      service.preview('personas', csv(csvRow()), user),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
