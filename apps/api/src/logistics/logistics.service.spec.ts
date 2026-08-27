import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  DivisionType,
  PoliticalOperationMode,
  TenantType,
} from '../../prisma/generated/prisma';
import { ConsentEvidenceService } from '../common/services/consent-evidence.service';
import { PrismaService } from '../prisma/prisma.service';
import { LogisticsService } from './logistics.service';

describe('LogisticsService tenant isolation', () => {
  it('rejects an E-14 voting place from another tenant', async () => {
    const userFindFirst = jest.fn().mockResolvedValue({ id: 'witness-a' });
    const divisionFindFirst = jest.fn().mockResolvedValue(null);
    const reportCreate = jest.fn();
    const service = new LogisticsService(
      {
        tenant: {
          findUnique: jest.fn().mockResolvedValue({
            defaultMode: PoliticalOperationMode.CAMPAIGN,
            type: TenantType.CANDIDACY,
          }),
        },
        auditEvent: {
          findFirst: jest.fn().mockResolvedValue({ id: 'upload-receipt-a' }),
        },
        user: { findFirst: userFindFirst },
        politicalDivision: { findFirst: divisionFindFirst },
        witnessReport: { findFirst: jest.fn(), create: reportCreate },
      } as unknown as PrismaService,
      { hashIp: jest.fn() } as unknown as ConsentEvidenceService,
    );

    await expect(
      service.syncE14('tenant-a', 'witness-a', {
        puestoId: 'puesto-from-tenant-b',
        mesa: 1,
        candidateVotes: 10,
        totalTableVotes: 100,
        e14ImageUrl:
          'tenant-a/e14/123e4567-e89b-42d3-a456-426614174000-acta.pdf',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(divisionFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'puesto-from-tenant-b',
        tenantId: 'tenant-a',
        type: DivisionType.PUESTO,
      },
      select: { id: true },
    });
    expect(reportCreate).not.toHaveBeenCalled();
  });

  it('rejects an offline voter voting place from another tenant', async () => {
    const transaction = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'registrar-a' }) },
      politicalDivision: { findFirst: jest.fn().mockResolvedValue(null) },
      voter: { upsert: jest.fn() },
      consentRecord: { create: jest.fn() },
    };
    const runTransaction = jest.fn(
      async (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );
    const service = new LogisticsService(
      { $transaction: runTransaction } as unknown as PrismaService,
      {
        hashIp: jest.fn().mockReturnValue('hashed-ip'),
      } as unknown as ConsentEvidenceService,
    );

    await expect(
      service.syncVoter('tenant-a', 'registrar-a', '203.0.113.42', {
        documentId: '1012345678',
        firstName: 'María',
        lastName: 'Pérez',
        puestoId: 'puesto-from-tenant-b',
        consentAccepted: true,
        termsVersion: '2026.1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'registrar-a', tenantId: 'tenant-a' },
      select: { id: true },
    });
    expect(transaction.politicalDivision.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'puesto-from-tenant-b',
        tenantId: 'tenant-a',
        type: DivisionType.PUESTO,
      },
      select: { id: true },
    });
    expect(transaction.voter.upsert).not.toHaveBeenCalled();
  });

  it('blocks E-14 synchronization in public-office mode', async () => {
    const userFindFirst = jest.fn();
    const reportCreate = jest.fn();
    const service = new LogisticsService(
      {
        tenant: {
          findUnique: jest.fn().mockResolvedValue({
            defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
            type: TenantType.PUBLIC_OFFICE,
          }),
        },
        user: { findFirst: userFindFirst },
        witnessReport: { create: reportCreate },
      } as unknown as PrismaService,
      {} as ConsentEvidenceService,
    );

    await expect(
      service.syncE14('tenant-a', 'witness-a', {
        puestoId: 'puesto-a',
        mesa: 1,
        candidateVotes: 10,
        totalTableVotes: 100,
        e14ImageUrl:
          'tenant-a/e14/123e4567-e89b-42d3-a456-426614174000-acta.pdf',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(userFindFirst).not.toHaveBeenCalled();
    expect(reportCreate).not.toHaveBeenCalled();
  });

  it('rejects E-14 candidate votes above the table total', async () => {
    const userFindFirst = jest.fn();
    const service = new LogisticsService(
      {
        tenant: {
          findUnique: jest.fn().mockResolvedValue({
            defaultMode: PoliticalOperationMode.CAMPAIGN,
            type: TenantType.CANDIDACY,
          }),
        },
        user: { findFirst: userFindFirst },
      } as unknown as PrismaService,
      {} as ConsentEvidenceService,
    );

    await expect(
      service.syncE14('tenant-a', 'witness-a', {
        puestoId: 'puesto-a',
        mesa: 1,
        candidateVotes: 101,
        totalTableVotes: 100,
        e14ImageUrl:
          'tenant-a/e14/123e4567-e89b-42d3-a456-426614174000-acta.pdf',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it('blocks offline voter synchronization in public-office mode', async () => {
    const transaction = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
          type: TenantType.PUBLIC_OFFICE,
        }),
      },
      voter: { upsert: jest.fn() },
    };
    const hashIp = jest.fn();
    const service = new LogisticsService(
      {
        $transaction: jest.fn(
          async (callback: (client: typeof transaction) => Promise<unknown>) =>
            callback(transaction),
        ),
      } as unknown as PrismaService,
      { hashIp } as unknown as ConsentEvidenceService,
    );

    await expect(
      service.syncVoter('tenant-a', 'volunteer-a', '203.0.113.42', {
        documentId: '1012345678',
        firstName: 'María',
        lastName: 'Pérez',
        consentAccepted: true,
        termsVersion: '2026.1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(hashIp).not.toHaveBeenCalled();
    expect(transaction.voter.upsert).not.toHaveBeenCalled();
  });

  it('does not expose the private E-14 object path for an idempotent sync', async () => {
    const existingReport = {
      id: 'report-a',
      puestoId: 'puesto-a',
      mesa: 1,
      candidateVotes: 10,
      totalTableVotes: 100,
      observations: null,
      isSynced: true,
      createdAt: new Date('2026-08-21T00:00:00.000Z'),
      puesto: { code: 'P-001', name: 'Colegio Central' },
      witness: { name: 'Testigo A' },
    };
    const reportFindFirst = jest.fn().mockResolvedValue(existingReport);
    const service = new LogisticsService(
      {
        tenant: {
          findUnique: jest.fn().mockResolvedValue({
            defaultMode: PoliticalOperationMode.CAMPAIGN,
            type: TenantType.CANDIDACY,
          }),
        },
        auditEvent: {
          findFirst: jest.fn().mockResolvedValue({ id: 'upload-receipt-a' }),
        },
        user: { findFirst: jest.fn().mockResolvedValue({ id: 'witness-a' }) },
        politicalDivision: {
          findFirst: jest.fn().mockResolvedValue({ id: 'puesto-a' }),
        },
        witnessReport: { findFirst: reportFindFirst, create: jest.fn() },
      } as unknown as PrismaService,
      {} as ConsentEvidenceService,
    );

    const result = await service.syncE14('tenant-a', 'witness-a', {
      puestoId: 'puesto-a',
      mesa: 1,
      candidateVotes: 10,
      totalTableVotes: 100,
      e14ImageUrl: 'tenant-a/e14/123e4567-e89b-42d3-a456-426614174000-acta.pdf',
    });

    expect(result).not.toHaveProperty('e14ImageUrl');
    expect(reportFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({ e14ImageUrl: true }) as object,
      }),
    );
  });

  it('returns only minimal consent state after synchronizing a voter', async () => {
    const voterUpsert = jest.fn().mockResolvedValue({
      id: 'voter-a',
      consentAccepted: true,
      consentTimestamp: new Date('2026-08-21T00:00:00.000Z'),
    });
    const transaction = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'volunteer-a' }) },
      politicalDivision: { findFirst: jest.fn() },
      voter: { upsert: voterUpsert },
      consentRecord: {
        create: jest.fn().mockResolvedValue({ id: 'consent-a' }),
      },
    };
    const service = new LogisticsService(
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

    const result = await service.syncVoter(
      'tenant-a',
      'volunteer-a',
      '203.0.113.42',
      {
        documentId: '1012345678',
        firstName: 'María',
        lastName: 'Pérez',
        phone: '3001234567',
        email: 'maria@example.com',
        consentAccepted: true,
        termsVersion: '2026.1',
      },
    );

    expect(result).toEqual({
      id: 'voter-a',
      consentAccepted: true,
      consentTimestamp: new Date('2026-08-21T00:00:00.000Z'),
    });
    expect(result).not.toHaveProperty('documentId');
    expect(result).not.toHaveProperty('phone');
    expect(result).not.toHaveProperty('email');
    expect(voterUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          id: true,
          consentAccepted: true,
          consentTimestamp: true,
        },
      }),
    );
  });
});
