import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  ConsentCollectionChannel,
  ConsentLegalBasis,
  ConsentPurpose,
  ConsentStatus,
  ConsentSubjectType,
  PoliticalOperationMode,
  TenantType,
} from '../../prisma/generated/prisma';
import { ConsentEvidenceService } from '../common/services/consent-evidence.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVoterDto } from './dto/create-voter.dto';
import { VoterService } from './voter.service';

describe('VoterService consent transaction', () => {
  const dto: CreateVoterDto = {
    documentId: '1012345678',
    firstName: 'María',
    lastName: 'Pérez',
    consentAccepted: true,
    termsVersion: '2026.1',
  };

  const buildTransaction = (
    defaultMode: PoliticalOperationMode = PoliticalOperationMode.CAMPAIGN,
  ) => {
    const captured: {
      voterData?: Record<string, unknown>;
      consentData?: Record<string, unknown>;
    } = {};

    return {
      captured,
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode,
          type:
            defaultMode === PoliticalOperationMode.PUBLIC_OFFICE
              ? TenantType.PUBLIC_OFFICE
              : TenantType.CANDIDACY,
        }),
      },
      politicalDivision: {
        findFirst: jest.fn().mockResolvedValue({ id: 'puesto-a' }),
      },
      voter: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn((args: { data: Record<string, unknown> }) => {
          captured.voterData = args.data;
          return Promise.resolve({
            id: 'voter-id',
            tenantId: 'tenant-from-token',
            documentId: '1012345678',
            phone: '3001234567',
            email: 'private@example.test',
            consentAccepted: true,
          });
        }),
      },
      consentRecord: {
        create: jest.fn((args: { data: Record<string, unknown> }) => {
          captured.consentData = args.data;
          return Promise.resolve({ id: 'consent-id' });
        }),
      },
    };
  };

  it('atomically creates voter and legal consent evidence', async () => {
    const transaction = buildTransaction();
    const runTransaction = jest.fn(
      async (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );
    const hashIp = jest.fn().mockReturnValue('hashed-ip-evidence');
    const service = new VoterService(
      { $transaction: runTransaction } as unknown as PrismaService,
      { hashIp } as unknown as ConsentEvidenceService,
    );

    const result = await service.create(
      'tenant-from-token',
      'user-from-token',
      '203.0.113.42',
      dto,
    );

    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(hashIp).toHaveBeenCalledWith('203.0.113.42');
    const voterCreateData = transaction.captured.voterData;
    expect(voterCreateData).toMatchObject({
      tenantId: 'tenant-from-token',
      registrarId: 'user-from-token',
      consentAccepted: true,
      consentIp: 'hashed-ip-evidence',
      termsVersion: '2026.1',
    });
    expect(voterCreateData?.consentTimestamp).toBeInstanceOf(Date);
    const consentCreateData = transaction.captured.consentData;
    expect(consentCreateData).toMatchObject({
      tenantId: 'tenant-from-token',
      mode: PoliticalOperationMode.CAMPAIGN,
      subjectType: ConsentSubjectType.VOTER,
      subjectRef: 'voter-id',
      voterId: 'voter-id',
      purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
      legalBasis: ConsentLegalBasis.EXPLICIT_CONSENT,
      status: ConsentStatus.GRANTED,
      collectionChannel: ConsentCollectionChannel.IN_PERSON,
      noticeVersion: '2026.1',
      sourceIpHash: 'hashed-ip-evidence',
      capturedById: 'user-from-token',
    });
    expect(consentCreateData?.grantedAt).toBeInstanceOf(Date);
    expect(result).toEqual({ id: 'voter-id', consentAccepted: true });
    expect(result).not.toHaveProperty('documentId');
    expect(result).not.toHaveProperty('phone');
    expect(result).not.toHaveProperty('email');
  });

  it('rejects political collection for a public-office tenant', async () => {
    const transaction = buildTransaction(PoliticalOperationMode.PUBLIC_OFFICE);
    const service = new VoterService(
      {
        $transaction: jest.fn(
          async (callback: (client: typeof transaction) => Promise<unknown>) =>
            callback(transaction),
        ),
      } as unknown as PrismaService,
      {
        hashIp: jest.fn().mockReturnValue('hashed-ip'),
      } as unknown as ConsentEvidenceService,
    );

    await expect(
      service.create(
        'tenant-from-token',
        'user-from-token',
        '203.0.113.42',
        dto,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction.voter.create).not.toHaveBeenCalled();
    expect(transaction.consentRecord.create).not.toHaveBeenCalled();
  });

  it('rejects a voting place from another tenant', async () => {
    const transaction = buildTransaction();
    transaction.politicalDivision.findFirst.mockResolvedValue(null);
    const service = new VoterService(
      {
        $transaction: jest.fn(
          async (callback: (client: typeof transaction) => Promise<unknown>) =>
            callback(transaction),
        ),
      } as unknown as PrismaService,
      {
        hashIp: jest.fn().mockReturnValue('hashed-ip'),
      } as unknown as ConsentEvidenceService,
    );

    await expect(
      service.create('tenant-a', 'user-a', '203.0.113.42', {
        ...dto,
        puestoId: 'puesto-from-tenant-b',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.politicalDivision.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'puesto-from-tenant-b',
        tenantId: 'tenant-a',
        type: 'PUESTO',
      },
      select: { id: true },
    });
    expect(transaction.voter.create).not.toHaveBeenCalled();
  });

  it('returns 403 for voter reads and statistics in public-office mode', async () => {
    const findMany = jest.fn();
    const count = jest.fn();
    const service = new VoterService(
      {
        tenant: {
          findUnique: jest.fn().mockResolvedValue({
            defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
            type: TenantType.PUBLIC_OFFICE,
          }),
        },
        voter: { findMany, count },
      } as unknown as PrismaService,
      {} as ConsentEvidenceService,
    );

    await expect(service.findAll('tenant-a', {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.getStats('tenant-a')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(findMany).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });
});
