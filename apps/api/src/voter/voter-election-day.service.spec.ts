import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ConsentStatus,
  PoliticalOperationMode,
  PoliticalOperationStage,
  Role,
  TenantType,
  VotingStatus,
} from '../../prisma/generated/prisma';
import { ConsentEvidenceService } from '../common/services/consent-evidence.service';
import { PrismaService } from '../prisma/prisma.service';
import { VoterService } from './voter.service';

const user = {
  userId: 'coordinator-a',
  tenantId: 'tenant-a',
  role: Role.ZONE_COORDINATOR,
};
const granted = {
  id: 'consent-a',
  status: ConsentStatus.GRANTED,
  noticeVersion: 'current',
  grantedAt: new Date('2020-01-01'),
  expiresAt: null,
  revokedAt: null,
  createdAt: new Date('2020-01-01'),
};

function fixture() {
  const voter = {
    id: 'voter-a',
    firstName: 'Persona',
    lastName: 'Prueba',
    phone: '3001234567',
    consentAccepted: true,
    votingStatus: VotingStatus.PENDING,
    consentRecords: [granted],
  };
  const client = {
    $queryRaw: jest
      .fn()
      .mockResolvedValue([{ stage: PoliticalOperationStage.ELECTION_DAY }]),
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        defaultMode: PoliticalOperationMode.CAMPAIGN,
        type: TenantType.CANDIDACY,
      }),
    },
    operationProfile: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ stage: PoliticalOperationStage.ELECTION_DAY }),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({
        role: Role.ZONE_COORDINATOR,
        divisionId: 'zone-a',
      }),
    },
    politicalDivision: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'zone-a', parentId: null },
        { id: 'puesto-a', parentId: 'zone-a' },
      ]),
    },
    consentNotice: {
      findFirst: jest.fn().mockResolvedValue({ version: 'current' }),
    },
    voter: {
      findMany: jest.fn().mockResolvedValue([voter]),
      findFirst: jest.fn().mockResolvedValue(voter),
      update: jest
        .fn()
        .mockResolvedValue({ id: voter.id, votingStatus: VotingStatus.VOTED }),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
  };
  const transaction = jest.fn(
    async (callback: (tx: typeof client) => Promise<unknown>) =>
      callback(client),
  );
  const service = new VoterService(
    { ...client, $transaction: transaction } as unknown as PrismaService,
    {} as ConsentEvidenceService,
  );
  return { service, client, voter, transaction };
}

describe('seguimiento de jornada con autorización vigente', () => {
  it('acota lectura a tenant y territorio; elimina teléfono completo y última autorización revocada', async () => {
    const { service, client, voter } = fixture();
    client.voter.findMany.mockResolvedValue([
      voter,
      {
        ...voter,
        id: 'revoked',
        consentRecords: [{ ...granted, status: ConsentStatus.REVOKED }],
      },
      {
        ...voter,
        id: 'old-notice',
        consentRecords: [{ ...granted, noticeVersion: 'obsolete' }],
      },
      {
        ...voter,
        id: 'expired',
        consentRecords: [{ ...granted, expiresAt: new Date('2020-02-01') }],
      },
    ]);
    const result = await service.getElectionDaySummary(user);
    expect(client.voter.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: user.tenantId,
          puestoId: { in: ['zone-a', 'puesto-a'] },
          consentAccepted: true,
        },
      }),
    );
    expect(result.summary).toEqual({
      total: 1,
      voted: 0,
      pending: 1,
      needsTransport: 0,
      noShow: 0,
    });
    expect(result.voters).toHaveLength(1);
    expect(result.voters[0]).toMatchObject({ phoneMasked: '******4567' });
    expect(result.voters[0]).not.toHaveProperty('phone');
    expect(result.voters[0]).not.toHaveProperty('consentRecords');
  });

  it('no revela datos cuando faltan aviso, etapa, asignación o rol vigente', async () => {
    const unavailableNotice = fixture();
    unavailableNotice.client.consentNotice.findFirst.mockResolvedValue(null);
    await expect(
      unavailableNotice.service.getElectionDaySummary(user),
    ).rejects.toThrow(ForbiddenException);
    expect(unavailableNotice.client.voter.findMany).not.toHaveBeenCalled();

    const unavailableStage = fixture();
    unavailableStage.client.operationProfile.findUnique.mockResolvedValue(null);
    await expect(
      unavailableStage.service.getElectionDaySummary(user),
    ).rejects.toThrow(ConflictException);
    expect(unavailableStage.client.voter.findMany).not.toHaveBeenCalled();

    const unavailableTerritory = fixture();
    unavailableTerritory.client.user.findFirst.mockResolvedValue({
      role: Role.ZONE_COORDINATOR,
      divisionId: null,
    });
    await expect(
      unavailableTerritory.service.getElectionDaySummary(user),
    ).rejects.toThrow(ForbiddenException);
    expect(unavailableTerritory.client.voter.findMany).not.toHaveBeenCalled();

    const unavailableRole = fixture();
    unavailableRole.client.user.findFirst.mockResolvedValue({
      role: Role.VOLUNTEER,
      divisionId: 'zone-a',
    });
    await expect(
      unavailableRole.service.getElectionDaySummary(user),
    ).rejects.toThrow(ForbiddenException);
    expect(unavailableRole.client.voter.findMany).not.toHaveBeenCalled();
  });

  it('escribe y audita juntos con id y tenant; el bloqueo lifecycle es la primera consulta', async () => {
    const { service, client, transaction } = fixture();
    await service.updateVotingStatus(user, 'voter-a', VotingStatus.VOTED);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(client.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      client.tenant.findUnique.mock.invocationCallOrder[0],
    );
    expect(client.voter.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'voter-a',
          tenantId: user.tenantId,
          puestoId: { in: ['zone-a', 'puesto-a'] },
        },
      }),
    );
    expect(client.voter.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'voter-a', tenantId: user.tenantId },
        data: {
          votingStatus: VotingStatus.VOTED,
          votedAt: expect.any(Date),
          votedConfirmedBy: user.userId,
        },
      }),
    );
    expect(client.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: 'VOTER_VOTING_STATUS_UPDATED',
          before: { votingStatus: VotingStatus.PENDING },
          after: { votingStatus: VotingStatus.VOTED },
        }),
      }),
    );
  });

  it.each([
    PoliticalOperationStage.CAMPAIGN,
    PoliticalOperationStage.SIMULATION,
    PoliticalOperationStage.POST_ELECTION,
    PoliticalOperationStage.CLOSED,
  ])('no escribe durante %s', async (stage) => {
    const { service, client } = fixture();
    client.$queryRaw.mockResolvedValue([{ stage }]);
    await expect(
      service.updateVotingStatus(user, 'voter-a', VotingStatus.VOTED),
    ).rejects.toThrow(ConflictException);
    expect(client.voter.update).not.toHaveBeenCalled();
  });

  it('no modifica una persona ajena al alcance ni sin consentimiento vigente', async () => {
    const outside = fixture();
    outside.client.voter.findFirst.mockResolvedValue(null);
    await expect(
      outside.service.updateVotingStatus(user, 'other', VotingStatus.VOTED),
    ).rejects.toThrow(NotFoundException);
    expect(outside.client.voter.update).not.toHaveBeenCalled();

    const revoked = fixture();
    revoked.client.voter.findFirst.mockResolvedValue({
      ...revoked.voter,
      consentRecords: [{ ...granted, status: ConsentStatus.REVOKED }],
    });
    await expect(
      revoked.service.updateVotingStatus(user, 'voter-a', VotingStatus.VOTED),
    ).rejects.toThrow(ForbiddenException);
    expect(revoked.client.voter.update).not.toHaveBeenCalled();
    expect(revoked.client.auditEvent.create).not.toHaveBeenCalled();
  });

  it('retirar un reporte borra fecha y confirmante previos', async () => {
    const { service, client } = fixture();
    await service.updateVotingStatus(user, 'voter-a', VotingStatus.PENDING);
    expect(client.voter.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          votingStatus: VotingStatus.PENDING,
          votedAt: null,
          votedConfirmedBy: null,
        },
      }),
    );
  });
});
