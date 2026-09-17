import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ElectoralCircumscriptionType,
  ElectoralContestType,
  PoliticalOperationMode,
  PoliticalOperationStage,
  PoliticalOperationType,
  PrismaClient,
  Role,
  TenantType,
  WorkPriority,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { OfflineSyncService } from '../common/services/offline-sync.service';
import {
  resolveDatabaseSchema,
  resolveDatabaseSearchPathOptions,
  type PrismaService,
} from '../prisma/prisma.service';
import {
  OfflineIncidentCategory,
  type SyncOfflineIncidentDto,
} from './dto/sync-offline-incident.dto';
import { offlineIncidentSha256 } from './offline-incident.hash';
import { OfflineIncidentService } from './offline-incident.service';

const databaseUrl =
  process.env.OFFLINE_INCIDENT_INTEGRATION_DATABASE_URL?.trim() ??
  process.env.TEST_DATABASE_URL?.trim();
const databaseSchema = resolveDatabaseSchema(databaseUrl) ?? 'public';
const physicalDescribe = databaseUrl ? describe : describe.skip;

physicalDescribe('OfflineIncidentService on migrated PostgreSQL 16', () => {
  let prisma: PrismaClient;
  let service: OfflineIncidentService;
  let offlineSync: OfflineSyncService;

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
    offlineSync = new OfflineSyncService({
      get: () => 'offline-integration-secret-at-least-32-bytes-long',
    } as unknown as ConfigService);
    service = new OfflineIncidentService(
      prisma as unknown as PrismaService,
      offlineSync,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createContext() {
    const suffix = randomUUID();
    const tenantId = `tenant-offline-incident-${suffix}`;
    const userId = `user-offline-incident-${suffix}`;
    await prisma.tenant.create({
      data: {
        id: tenantId,
        slug: `offline-incident-${suffix}`,
        name: 'Campaña integración incidentes offline',
        type: TenantType.CANDIDACY,
        defaultMode: PoliticalOperationMode.CAMPAIGN,
      },
    });
    await prisma.user.create({
      data: {
        id: userId,
        tenantId,
        email: `offline-${suffix}@integration.invalid`,
        password: 'not-a-real-credential',
        name: 'Operador de integración',
        role: Role.ADMIN,
        isActive: true,
      },
    });
    await prisma.operationProfile.create({
      data: {
        tenantId,
        operationType: PoliticalOperationType.SINGLE_CANDIDACY,
        stage: PoliticalOperationStage.CAMPAIGN,
        electionType: ElectoralContestType.MAYORALTY,
        circumscriptionType: ElectoralCircumscriptionType.MUNICIPAL,
        circumscriptionName: 'Municipio de integración',
        circumscriptionCode: '05001',
        electionDate: new Date('2099-06-01T00:00:00.000Z'),
        votingStartDate: new Date('2099-06-01T00:00:00.000Z'),
        votingEndDate: new Date('2099-06-01T00:00:00.000Z'),
        expectedTeamSize: 3,
        candidateCount: 1,
        dataControllerName: 'Campaña integración incidentes offline',
        responsibleDataUserId: userId,
        retentionPeriodDays: 365,
        revocationProcedure: 'Solicitud verificable al responsable.',
        createdById: userId,
        updatedById: userId,
      },
    });
    return {
      tenantId,
      userId,
      user: { tenantId, userId, role: Role.ADMIN } satisfies AuthenticatedUser,
    };
  }

  function dto(clientOperationId = randomUUID()): SyncOfflineIncidentDto {
    const capturedAt = new Date(Date.now() - 1_000).toISOString();
    const input = {
      clientOperationId,
      capturedAt,
      category: OfflineIncidentCategory.LOGISTICS,
      priority: WorkPriority.HIGH,
      title: 'Falta material operativo',
      description: 'El punto reporta faltante del insumo operativo previsto.',
      occurredOn: new Date(Date.now() - 24 * 60 * 60 * 1_000)
        .toISOString()
        .slice(0, 10),
    };
    return { ...input, payloadSha256: offlineIncidentSha256(input) };
  }

  it('serializa concurrencia, devuelve el mismo recibo y crea exactamente un caso y auditoría', async () => {
    const context = await createContext();
    const input = dto();
    const results = await Promise.all([
      service.sync(context.user, input),
      service.sync(context.user, input),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      'APPLIED',
      'DUPLICATE',
    ]);
    expect(new Set(results.map((result) => result.receiptId)).size).toBe(1);
    await expect(
      prisma.issueCase.count({ where: { tenantId: context.tenantId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditEvent.count({
        where: {
          tenantId: context.tenantId,
          action: 'OFFLINE_INCIDENT_REPORTED',
        },
      }),
    ).resolves.toBe(1);
    const receipts = await prisma.offlineSyncReceipt.findMany({
      where: { tenantId: context.tenantId },
    });
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      clientOperationId: input.clientOperationId,
      payloadSha256: input.payloadSha256,
      resourceType: 'IssueCase',
    });

    const changed = {
      ...input,
      title: 'Contenido operativo distinto',
    };
    changed.payloadSha256 = offlineIncidentSha256(changed);
    await expect(service.sync(context.user, changed)).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      prisma.issueCase.count({ where: { tenantId: context.tenantId } }),
    ).resolves.toBe(1);
  });

  it('aísla el mismo UUID por tenant y revierte caso+auditoría si falla el recibo', async () => {
    const left = await createContext();
    const right = await createContext();
    const operationId = randomUUID();
    const leftInput = dto(operationId);
    const rightInput = dto(operationId);
    await service.sync(left.user, leftInput);
    await service.sync(right.user, rightInput);
    await expect(
      prisma.offlineSyncReceipt.count({
        where: { clientOperationId: operationId },
      }),
    ).resolves.toBe(2);

    const failingContext = await createContext();
    const failingSync = new OfflineSyncService({
      get: () => 'offline-integration-secret-at-least-32-bytes-long',
    } as unknown as ConfigService);
    jest
      .spyOn(failingSync, 'createReceipt')
      .mockRejectedValue(new Error('forced-receipt-failure'));
    const failingService = new OfflineIncidentService(
      prisma as unknown as PrismaService,
      failingSync,
    );
    await expect(
      failingService.sync(failingContext.user, dto()),
    ).rejects.toThrow('forced-receipt-failure');
    await expect(
      prisma.issueCase.count({
        where: { tenantId: failingContext.tenantId },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.auditEvent.count({
        where: { tenantId: failingContext.tenantId },
      }),
    ).resolves.toBe(0);
  });

  it('impide UPDATE y DELETE de recibos en la frontera PostgreSQL', async () => {
    const context = await createContext();
    const result = await service.sync(context.user, dto());
    await expect(
      prisma.offlineSyncReceipt.update({
        where: { id: result.receiptId },
        data: { resourceType: 'Rewritten' },
      }),
    ).rejects.toThrow(/append-only/i);
    await expect(
      prisma.offlineSyncReceipt.delete({ where: { id: result.receiptId } }),
    ).rejects.toThrow(/append-only/i);
    await expect(
      prisma.offlineSyncReceipt.count({ where: { id: result.receiptId } }),
    ).resolves.toBe(1);
  });
});
