jest.mock('../auth/mfa.service', () => ({
  MfaService: class MfaService {},
}));

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  PoliticalOperationMode,
  PoliticalOperationStage,
  Role,
  StoredObjectStatus,
  StorageObjectModule,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import type { MfaService } from '../auth/mfa.service';
import { ConsentEvidenceService } from '../common/services/consent-evidence.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageModuleName } from '../storage/storage.constants';
import { SupabaseStorageGateway } from '../storage/supabase-storage.gateway';
import type {
  SignDocumentDto,
  VerifySignatureQueryDto,
} from './dto/electronic-signature.dto';
import { ElectronicSignatureService } from './electronic-signature.service';

const signedAt = new Date('2026-09-07T12:00:00.000Z');

const financeUser: AuthenticatedUser = {
  tenantId: 'tenant-a',
  userId: 'user-a',
  role: Role.FINANCE_MANAGER,
};

const financeDto: SignDocumentDto = {
  documentId: 'document-a',
  module: StorageModuleName.FINANCE,
  resourceId: 'finance-a',
  otpCode: '123456',
};

const financeQuery: VerifySignatureQueryDto = {
  module: StorageModuleName.FINANCE,
  resourceId: 'finance-a',
};

function createHarness() {
  const document = {
    id: 'document-a',
    path: 'tenant-a/finance/document-a.pdf',
    module: StorageObjectModule.FINANCE,
    uploaderId: 'user-a',
    contentType: 'application/pdf',
    etag: 'storage-etag-a',
    actualSize: 4_096,
    confirmedAt: new Date('2026-09-06T12:00:00.000Z'),
    consumedAt: new Date('2026-09-06T12:05:00.000Z'),
    consumedByType: 'FinancialEntry',
    consumedById: 'finance-a',
    status: StoredObjectStatus.CONSUMED,
  };
  const transaction = {
    $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
    operationProfile: {
      findUnique: jest.fn().mockResolvedValue({
        stage: PoliticalOperationStage.CAMPAIGN,
      }),
    },
    electronicSignature: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'signature-a',
        signedAt,
      }),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
  };
  const prisma = {
    storedObject: {
      findFirst: jest.fn().mockResolvedValue(document),
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({
        role: Role.FINANCE_MANAGER,
        divisionId: null,
      }),
    },
    politicalDivision: { findMany: jest.fn().mockResolvedValue([]) },
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        defaultMode: PoliticalOperationMode.CAMPAIGN,
        type: TenantType.CANDIDACY,
      }),
    },
    financialEntry: {
      findFirst: jest.fn().mockResolvedValue({ reporterId: 'user-a' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    witnessReport: {
      findFirst: jest.fn().mockResolvedValue({ witnessId: 'user-a' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    electronicSignature: { findFirst: jest.fn() },
    $transaction: jest.fn(
      async (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  };
  const consentEvidence = {
    hashIp: jest.fn().mockReturnValue('salted-ip-hash'),
  };
  const storage = {
    getObjectInfo: jest.fn().mockResolvedValue({
      name: 'document-a.pdf',
      size: 4_096,
      etag: 'storage-etag-a',
      contentType: 'application/pdf',
    }),
  };
  const mfa = {
    verifyEnabledCode: jest.fn().mockResolvedValue(true),
  };

  return {
    service: new ElectronicSignatureService(
      prisma as unknown as PrismaService,
      consentEvidence as unknown as ConsentEvidenceService,
      storage as unknown as SupabaseStorageGateway,
      mfa as unknown as MfaService,
    ),
    prisma,
    transaction,
    consentEvidence,
    storage,
    mfa,
    document,
  };
}

function createdHash(harness: ReturnType<typeof createHarness>): string {
  return harness.transaction.electronicSignature.create.mock.calls[0][0].data
    .documentHash as string;
}

describe('ElectronicSignatureService', () => {
  it('lists only owned finance evidence candidates without exposing storage paths', async () => {
    const harness = createHarness();
    harness.prisma.storedObject.findMany.mockResolvedValue([
      {
        id: 'document-a',
        path: harness.document.path,
        contentType: 'application/pdf',
        actualSize: 4_096,
        confirmedAt: harness.document.confirmedAt,
        consumedAt: harness.document.consumedAt,
        consumedById: 'finance-a',
        signatures: [{ id: 'signature-a', signedAt }],
      },
      {
        id: 'document-mismatch',
        path: 'tenant-a/finance/not-linked.pdf',
        contentType: 'application/pdf',
        actualSize: 1_024,
        confirmedAt: harness.document.confirmedAt,
        consumedAt: harness.document.consumedAt,
        consumedById: 'finance-b',
        signatures: [],
      },
    ]);
    harness.prisma.financialEntry.findMany.mockResolvedValue([
      {
        id: 'finance-a',
        evidenceUrl: harness.document.path,
        type: 'EXPENSE',
        date: new Date('2026-09-05T00:00:00.000Z'),
        description: 'Transporte territorial',
      },
      {
        id: 'finance-b',
        evidenceUrl: 'tenant-a/finance/another-document.pdf',
        type: 'INCOME',
        date: new Date('2026-09-04T00:00:00.000Z'),
        description: 'Aporte',
      },
    ]);

    const result = await harness.service.listSigningCandidates(financeUser, {
      module: StorageModuleName.FINANCE,
    });

    expect(result).toMatchObject({
      limit: 100,
      truncated: false,
      items: [
        {
          documentId: 'document-a',
          resourceId: 'finance-a',
          signature: { id: 'signature-a', signedAt },
          resource: {
            kind: 'FinancialEntry',
            type: 'EXPENSE',
            label: 'Transporte territorial',
          },
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain(harness.document.path);
    expect(harness.prisma.storedObject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          uploaderId: 'user-a',
          consumedByType: 'FinancialEntry',
        }),
        take: 101,
      }),
    );
    expect(harness.prisma.financialEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          reporterId: 'user-a',
        }),
      }),
    );
  });

  it('limits E-14 signing candidates to the current witness territory', async () => {
    const harness = createHarness();
    harness.prisma.user.findFirst.mockResolvedValue({
      role: Role.WITNESS,
      divisionId: 'zone-a',
    });
    harness.prisma.politicalDivision.findMany.mockResolvedValue([
      { id: 'zone-a', parentId: null },
      { id: 'puesto-a', parentId: 'zone-a' },
    ]);
    harness.prisma.storedObject.findMany.mockResolvedValue([
      {
        id: 'document-a',
        path: 'tenant-a/e14/report-a.pdf',
        contentType: 'application/pdf',
        actualSize: 4_096,
        confirmedAt: harness.document.confirmedAt,
        consumedAt: harness.document.consumedAt,
        consumedById: 'report-a',
        signatures: [],
      },
    ]);
    harness.prisma.witnessReport.findMany.mockResolvedValue([
      {
        id: 'report-a',
        e14ImageUrl: 'tenant-a/e14/report-a.pdf',
        mesa: 12,
        captureContext: 'REAL',
        puesto: { code: '001', name: 'Colegio Central' },
      },
    ]);

    await expect(
      harness.service.listSigningCandidates(
        { ...financeUser, role: Role.WITNESS },
        { module: StorageModuleName.E14 },
      ),
    ).resolves.toMatchObject({
      items: [
        {
          resource: {
            kind: 'WitnessReport',
            mesa: 12,
            captureContext: 'REAL',
          },
        },
      ],
    });
    expect(harness.prisma.witnessReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          witnessId: 'user-a',
          puestoId: { in: ['zone-a', 'puesto-a'] },
        }),
      }),
    );
  });

  it('signs only a consumed finance object linked to its uploader resource', async () => {
    const harness = createHarness();

    await expect(
      harness.service.signDocument(financeUser, financeDto, '203.0.113.42'),
    ).resolves.toEqual({
      id: 'signature-a',
      signedAt,
      module: StorageModuleName.FINANCE,
      resourceType: 'FinancialEntry',
      integrityScope: 'LINK_AND_STORAGE_METADATA',
      contentIntegrity: 'UNVERIFIED',
    });

    expect(harness.prisma.storedObject.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'document-a',
        tenantId: 'tenant-a',
        uploaderId: 'user-a',
        module: StorageObjectModule.FINANCE,
        status: StoredObjectStatus.CONSUMED,
        consumedAt: { not: null },
        consumedByType: 'FinancialEntry',
        consumedById: 'finance-a',
      },
      select: expect.any(Object),
    });
    expect(harness.prisma.financialEntry.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'finance-a',
        tenantId: 'tenant-a',
        evidenceUrl: harness.document.path,
      },
      select: { reporterId: true },
    });
    expect(harness.mfa.verifyEnabledCode).toHaveBeenCalledWith(
      'user-a',
      'tenant-a',
      '123456',
    );
    expect(createdHash(harness)).toMatch(/^v2:[a-f0-9]{64}$/);
    expect(harness.transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(
      harness.transaction.operationProfile.findUnique,
    ).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a' },
      select: { stage: true },
    });
    expect(harness.consentEvidence.hashIp).toHaveBeenCalledWith('203.0.113.42');
    expect(harness.transaction.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        actorUserId: 'user-a',
        sourceIpHash: 'salted-ip-hash',
        metadata: {
          module: StorageModuleName.FINANCE,
          linkedResourceType: 'FinancialEntry',
          linkedResourceId: 'finance-a',
        },
      }),
    });
  });

  it('serializes with closure and refuses a new signature after CLOSED', async () => {
    const harness = createHarness();
    harness.transaction.operationProfile.findUnique.mockResolvedValue({
      stage: PoliticalOperationStage.CLOSED,
    });

    await expect(
      harness.service.signDocument(financeUser, financeDto),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'OPERATION_CLOSED' }),
    });

    expect(harness.transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(
      harness.transaction.electronicSignature.create,
    ).not.toHaveBeenCalled();
    expect(harness.transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('makes one signer and consumed document idempotent under the lifecycle lock', async () => {
    const harness = createHarness();
    harness.transaction.electronicSignature.findFirst.mockResolvedValue({
      id: 'signature-existing',
    });

    await expect(
      harness.service.signDocument(financeUser, financeDto),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'SIGNATURE_ALREADY_EXISTS',
        signatureId: 'signature-existing',
      }),
    });

    expect(harness.transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(
      harness.transaction.electronicSignature.findFirst,
    ).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        documentId: 'document-a',
        signerId: 'user-a',
      },
      select: { id: true },
    });
    expect(
      harness.transaction.electronicSignature.create,
    ).not.toHaveBeenCalled();
    expect(harness.transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('signs an E-14 only when the uploader owns a report in the current territory', async () => {
    const harness = createHarness();
    const e14Document = {
      ...harness.document,
      path: 'tenant-a/e14/document-a.pdf',
      module: StorageObjectModule.E14,
      consumedByType: 'WitnessReport',
      consumedById: 'report-a',
    };
    harness.prisma.storedObject.findFirst.mockResolvedValue(e14Document);
    harness.prisma.user.findFirst.mockResolvedValue({
      role: Role.WITNESS,
      divisionId: 'zone-a',
    });
    harness.prisma.politicalDivision.findMany.mockResolvedValue([
      { id: 'zone-a', parentId: null },
      { id: 'puesto-a', parentId: 'zone-a' },
    ]);
    harness.prisma.witnessReport.findFirst.mockResolvedValue({
      witnessId: 'user-a',
    });

    await expect(
      harness.service.signDocument(
        { ...financeUser, role: Role.WITNESS },
        {
          documentId: 'document-a',
          module: StorageModuleName.E14,
          resourceId: 'report-a',
          otpCode: '123456',
        },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'signature-a',
        module: StorageModuleName.E14,
        resourceType: 'WitnessReport',
      }),
    );
    expect(harness.prisma.witnessReport.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'report-a',
        tenantId: 'tenant-a',
        e14ImageUrl: 'tenant-a/e14/document-a.pdf',
        puestoId: { in: ['zone-a', 'puesto-a'] },
      },
      select: { witnessId: true },
    });
  });

  it.each([TenantType.PARTY, TenantType.GSC])(
    'blocks E-14 signature operations for tenant type %s',
    async (type) => {
      const signer = createHarness();
      signer.prisma.user.findFirst.mockResolvedValue({
        role: Role.WITNESS,
        divisionId: null,
      });
      signer.prisma.tenant.findUnique.mockResolvedValue({
        defaultMode: PoliticalOperationMode.CAMPAIGN,
        type,
      });
      const e14User = { ...financeUser, role: Role.WITNESS };
      const e14Dto = {
        documentId: 'document-a',
        module: StorageModuleName.E14,
        resourceId: 'report-a',
        otpCode: '123456',
      } as const;

      await expect(
        signer.service.signDocument(e14User, e14Dto),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(signer.prisma.storedObject.findFirst).not.toHaveBeenCalled();

      const verifier = createHarness();
      verifier.prisma.user.findFirst.mockResolvedValue({
        role: Role.WITNESS,
        divisionId: null,
      });
      verifier.prisma.tenant.findUnique.mockResolvedValue({
        defaultMode: PoliticalOperationMode.CAMPAIGN,
        type,
      });
      await expect(
        verifier.service.verifySignature(e14User, 'signature-a', {
          module: StorageModuleName.E14,
          resourceId: 'report-a',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(
        verifier.prisma.electronicSignature.findFirst,
      ).not.toHaveBeenCalled();
    },
  );

  it('fails before document access when the current database role cannot sign the module', async () => {
    const harness = createHarness();
    harness.prisma.user.findFirst.mockResolvedValue({
      role: Role.AUDITOR,
      divisionId: null,
    });

    await expect(
      harness.service.signDocument(financeUser, financeDto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(harness.prisma.storedObject.findFirst).not.toHaveBeenCalled();
    expect(
      harness.transaction.electronicSignature.create,
    ).not.toHaveBeenCalled();
  });

  it('does not expose or sign a guessed object id from another tenant', async () => {
    const harness = createHarness();
    harness.prisma.storedObject.findFirst.mockResolvedValue(null);

    await expect(
      harness.service.signDocument(financeUser, financeDto),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(harness.prisma.storedObject.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'document-a',
          tenantId: 'tenant-a',
          uploaderId: 'user-a',
        }),
      }),
    );
    expect(harness.storage.getObjectInfo).not.toHaveBeenCalled();
  });

  it('rejects module and owner/resource mismatches without reaching Storage', async () => {
    const wrongModule = createHarness();
    wrongModule.prisma.user.findFirst.mockResolvedValue({
      role: Role.WITNESS,
      divisionId: 'zone-a',
    });
    wrongModule.prisma.politicalDivision.findMany.mockResolvedValue([
      { id: 'zone-a', parentId: null },
    ]);

    await expect(
      wrongModule.service.signDocument(
        { ...financeUser, role: Role.WITNESS },
        {
          ...financeDto,
          module: StorageModuleName.E14,
          resourceId: 'report-a',
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(wrongModule.storage.getObjectInfo).not.toHaveBeenCalled();

    const wrongOwner = createHarness();
    wrongOwner.prisma.financialEntry.findFirst.mockResolvedValue({
      reporterId: 'user-b',
    });
    await expect(
      wrongOwner.service.signDocument(financeUser, financeDto),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(wrongOwner.storage.getObjectInfo).not.toHaveBeenCalled();

    const unlinked = createHarness();
    unlinked.prisma.storedObject.findFirst.mockResolvedValue({
      ...unlinked.document,
      status: StoredObjectStatus.CONFIRMED,
      consumedAt: null,
      consumedByType: null,
      consumedById: null,
    });
    await expect(
      unlinked.service.signDocument(financeUser, financeDto),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(unlinked.storage.getObjectInfo).not.toHaveBeenCalled();
  });

  it('accepts current size and content type from verified Storage metadata', async () => {
    const harness = createHarness();
    harness.storage.getObjectInfo.mockResolvedValue({
      name: 'document-a.pdf',
      etag: 'storage-etag-a',
      metadata: {
        size: '4096',
        mimetype: 'application/pdf',
      },
    });

    await expect(
      harness.service.signDocument(financeUser, financeDto),
    ).resolves.toEqual(expect.objectContaining({ id: 'signature-a' }));
  });

  it('fails closed for invalid MFA and changed current Storage metadata', async () => {
    const invalidOtp = createHarness();
    invalidOtp.mfa.verifyEnabledCode.mockResolvedValue(false);
    await expect(
      invalidOtp.service.signDocument(financeUser, financeDto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(invalidOtp.prisma.storedObject.findFirst).not.toHaveBeenCalled();

    const changedStorage = createHarness();
    changedStorage.storage.getObjectInfo.mockResolvedValue({
      name: 'document-a.pdf',
      size: 4_097,
      etag: 'storage-etag-b',
      contentType: 'application/pdf',
    });
    await expect(
      changedStorage.service.signDocument(financeUser, financeDto),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      changedStorage.transaction.electronicSignature.create,
    ).not.toHaveBeenCalled();
  });

  it('recomputes the bound hash and returns only a safe validity conclusion', async () => {
    const harness = createHarness();
    await harness.service.signDocument(financeUser, financeDto);
    harness.prisma.electronicSignature.findFirst.mockResolvedValue({
      id: 'signature-a',
      signerId: 'user-a',
      documentHash: createdHash(harness),
      signedAt,
      document: harness.document,
    });

    const result = await harness.service.verifySignature(
      financeUser,
      'signature-a',
      financeQuery,
    );

    expect(result).toEqual({
      id: 'signature-a',
      valid: true,
      signedAt,
      module: StorageModuleName.FINANCE,
      resourceType: 'FinancialEntry',
      integrityScope: 'LINK_AND_STORAGE_METADATA',
      contentIntegrity: 'UNVERIFIED',
    });
    expect(result).not.toHaveProperty('documentHash');
    expect(result).not.toHaveProperty('documentId');
    expect(result).not.toHaveProperty('signerId');
    expect(result).not.toHaveProperty('path');
    expect(result).not.toHaveProperty('resourceId');
  });

  it('returns valid false when the hash or current Storage metadata changed', async () => {
    const badHash = createHarness();
    badHash.prisma.electronicSignature.findFirst.mockResolvedValue({
      id: 'signature-a',
      signerId: 'user-a',
      documentHash: `v2:${'0'.repeat(64)}`,
      signedAt,
      document: badHash.document,
    });
    await expect(
      badHash.service.verifySignature(financeUser, 'signature-a', financeQuery),
    ).resolves.toEqual(expect.objectContaining({ valid: false }));

    const changedStorage = createHarness();
    await changedStorage.service.signDocument(financeUser, financeDto);
    changedStorage.prisma.electronicSignature.findFirst.mockResolvedValue({
      id: 'signature-a',
      signerId: 'user-a',
      documentHash: createdHash(changedStorage),
      signedAt,
      document: changedStorage.document,
    });
    changedStorage.storage.getObjectInfo.mockResolvedValue({
      name: 'document-a.pdf',
      size: 4_096,
      etag: 'different-etag',
      contentType: 'application/pdf',
    });
    await expect(
      changedStorage.service.verifySignature(
        financeUser,
        'signature-a',
        financeQuery,
      ),
    ).resolves.toEqual(expect.objectContaining({ valid: false }));
  });

  it('scopes signature lookup by tenant and E-14 verification by territory', async () => {
    const otherTenant = createHarness();
    otherTenant.prisma.electronicSignature.findFirst.mockResolvedValue(null);
    await expect(
      otherTenant.service.verifySignature(
        financeUser,
        'signature-from-tenant-b',
        financeQuery,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      otherTenant.prisma.electronicSignature.findFirst,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'signature-from-tenant-b', tenantId: 'tenant-a' },
      }),
    );

    const territorial = createHarness();
    territorial.prisma.user.findFirst.mockResolvedValue({
      role: Role.WITNESS,
      divisionId: 'zone-a',
    });
    territorial.prisma.politicalDivision.findMany.mockResolvedValue([
      { id: 'zone-a', parentId: null },
      { id: 'puesto-a', parentId: 'zone-a' },
      { id: 'puesto-b', parentId: null },
    ]);
    const e14Document = {
      ...territorial.document,
      path: 'tenant-a/e14/document-a.pdf',
      module: StorageObjectModule.E14,
      consumedByType: 'WitnessReport',
      consumedById: 'report-a',
    };
    territorial.prisma.electronicSignature.findFirst.mockResolvedValue({
      id: 'signature-a',
      signerId: 'user-a',
      documentHash: `v2:${'0'.repeat(64)}`,
      signedAt,
      document: e14Document,
    });
    territorial.prisma.witnessReport.findFirst.mockResolvedValue(null);

    await expect(
      territorial.service.verifySignature(
        { ...financeUser, role: Role.WITNESS },
        'signature-a',
        { module: StorageModuleName.E14, resourceId: 'report-a' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(territorial.prisma.witnessReport.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'report-a',
        tenantId: 'tenant-a',
        e14ImageUrl: 'tenant-a/e14/document-a.pdf',
        puestoId: { in: ['zone-a', 'puesto-a'] },
      },
      select: { witnessId: true },
    });
  });

  it('rejects a role that is valid globally but not for the requested module', async () => {
    const harness = createHarness();
    harness.prisma.user.findFirst.mockResolvedValue({
      role: Role.FINANCE_MANAGER,
      divisionId: null,
    });

    await expect(
      harness.service.verifySignature(financeUser, 'signature-a', {
        module: StorageModuleName.E14,
        resourceId: 'report-a',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(harness.prisma.electronicSignature.findFirst).not.toHaveBeenCalled();
  });

  it('fails closed for Storage modules without a signature resource policy', async () => {
    const harness = createHarness();

    await expect(
      harness.service.verifySignature(financeUser, 'signature-a', {
        module: StorageModuleName.CONSENT,
        resourceId: 'consent-a',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(harness.prisma.user.findFirst).not.toHaveBeenCalled();
  });
});
