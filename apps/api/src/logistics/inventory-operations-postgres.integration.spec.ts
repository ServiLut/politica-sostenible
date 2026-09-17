import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ElectoralCircumscriptionType,
  ElectoralContestType,
  InventoryTransferStatus,
  PoliticalOperationMode,
  PoliticalOperationStage,
  PoliticalOperationType,
  PrismaClient,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  PrismaService,
  resolveDatabaseSchema,
  resolveDatabaseSearchPathOptions,
} from '../prisma/prisma.service';
import type {
  CreateInventoryWarehouseDto,
  DispatchInventoryDto,
  ImportInventoryItemsDto,
  ReceiveInventoryStockDto,
  ReceiveInventoryTransferDto,
  ReconcileInventoryTransferDto,
  ReturnInventoryTransferDto,
} from './dto/inventory-operations.dto';
import {
  computeInventoryCommandSha256,
  type InventoryCommandName,
} from './inventory-operations.hash';
import { InventoryOperationsService } from './inventory-operations.service';

const databaseUrl =
  process.env.INVENTORY_INTEGRATION_DATABASE_URL?.trim() ??
  process.env.TEST_DATABASE_URL?.trim();
const databaseSchema = resolveDatabaseSchema(databaseUrl) ?? 'public';
const physicalDescribe = databaseUrl ? describe : describe.skip;

function command<T extends object>(
  type: InventoryCommandName,
  input: T,
): T & { payloadSha256: string } {
  return {
    ...input,
    payloadSha256: computeInventoryCommandSha256(type, input),
  };
}

physicalDescribe('InventoryOperationsService on physical PostgreSQL', () => {
  let prisma: PrismaClient;
  let service: InventoryOperationsService;

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
    service = new InventoryOperationsService(
      prisma as unknown as PrismaService,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createContext(
    stage: PoliticalOperationStage = PoliticalOperationStage.ELECTION_PREPARATION,
  ) {
    const suffix = randomUUID();
    const tenantId = `tenant-inventory-${suffix}`;
    const userId = `user-inventory-${suffix}`;
    await prisma.tenant.create({
      data: {
        id: tenantId,
        slug: `inventory-${suffix}`,
        name: 'Tenant fisico inventario',
        type: TenantType.CANDIDACY,
        defaultMode: PoliticalOperationMode.CAMPAIGN,
      },
    });
    await prisma.user.create({
      data: {
        id: userId,
        email: `inventory-${suffix}@example.test`,
        password: 'not-a-real-credential',
        name: 'Administrador de inventario',
        role: Role.ADMIN,
        isActive: true,
        tenantId,
      },
    });
    await prisma.operationProfile.create({
      data: {
        tenantId,
        operationType: PoliticalOperationType.SINGLE_CANDIDACY,
        stage,
        electionType: ElectoralContestType.MAYORALTY,
        circumscriptionType: ElectoralCircumscriptionType.MUNICIPAL,
        circumscriptionName: 'Municipio de prueba',
        electionDate: new Date('2026-10-25T00:00:00.000Z'),
        votingStartDate: new Date('2026-10-25T00:00:00.000Z'),
        votingEndDate: new Date('2026-10-25T00:00:00.000Z'),
        expectedTeamSize: 5,
        candidateCount: 1,
        dataControllerName: 'Campaña de prueba física',
        responsibleDataUserId: userId,
        retentionPeriodDays: 365,
        revocationProcedure:
          'Solicitud verificable ante el responsable de tratamiento de prueba.',
        createdById: userId,
        updatedById: userId,
      },
    });
    const user: AuthenticatedUser = {
      tenantId,
      userId,
      role: Role.ADMIN,
    };
    return { tenantId, userId, user };
  }

  async function prepareStock(
    user: AuthenticatedUser,
    quantity: number,
    codeSuffix: string,
  ) {
    const normalizedSuffix = codeSuffix.toUpperCase();
    const source = await service.createWarehouse(
      user,
      command('WAREHOUSE_CREATE', {
        clientRequestId: randomUUID(),
        code: `SRC_${normalizedSuffix}`.slice(0, 32),
        name: `Bodega origen ${codeSuffix}`,
        responsibleUserId: user.userId,
      }) as CreateInventoryWarehouseDto,
    );
    const destination = await service.createWarehouse(
      user,
      command('WAREHOUSE_CREATE', {
        clientRequestId: randomUUID(),
        code: `DST_${normalizedSuffix}`.slice(0, 32),
        name: `Bodega destino ${codeSuffix}`,
        responsibleUserId: user.userId,
      }) as CreateInventoryWarehouseDto,
    );
    const imported = await service.importItems(
      user,
      command('ITEM_IMPORT', {
        clientRequestId: randomUUID(),
        items: [
          {
            sku: `KIT_${normalizedSuffix}`.slice(0, 64),
            name: `Kit electoral ${codeSuffix}`,
            unit: 'UNIDAD',
            trackingMode: 'NONE' as const,
            minimumStock: 0,
          },
        ],
      }) as ImportInventoryItemsDto,
    );
    const stock = await service.receiveStock(
      user,
      command('STOCK_RECEIVE', {
        clientRequestId: randomUUID(),
        warehouseId: source.warehouse.id,
        itemId: imported.items[0].id,
        quantity,
        reason: 'Ingreso inicial contado para la prueba física concurrente.',
        custodyDeclaration:
          'El administrador recibe y cuenta físicamente todas las unidades indicadas.',
        occurredAt: new Date(Date.now() - 120_000).toISOString(),
      }) as ReceiveInventoryStockDto,
    );
    return { source, destination, imported, stock };
  }

  it('serializes competing dispatches and never permits a negative balance', async () => {
    const { tenantId, user } = await createContext();
    const prepared = await prepareStock(user, 5, randomUUID().slice(0, 8));
    const base = {
      sourceWarehouseId: prepared.source.warehouse.id,
      destinationWarehouseId: prepared.destination.warehouse.id,
      destinationLabel: 'Bodega destino de concurrencia',
      custodianUserId: user.userId,
      purpose:
        'Despacho concurrente controlado para probar exclusión de saldo.',
      custodyDeclaration:
        'El custodio acepta el conteo y la responsabilidad física del despacho.',
      occurredAt: new Date(Date.now() - 60_000).toISOString(),
      lines: [{ stockBalanceId: prepared.stock.balance.id, quantity: 4 }],
    };
    const attempts = await Promise.allSettled([
      service.dispatch(
        user,
        command('DISPATCH', {
          ...base,
          clientRequestId: randomUUID(),
          code: `RACE_A_${randomUUID().slice(0, 8)}`,
        }) as DispatchInventoryDto,
      ),
      service.dispatch(
        user,
        command('DISPATCH', {
          ...base,
          clientRequestId: randomUUID(),
          code: `RACE_B_${randomUUID().slice(0, 8)}`,
        }) as DispatchInventoryDto,
      ),
    ]);
    expect(
      attempts.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === 'rejected')).toHaveLength(
      1,
    );
    const balance = await prisma.inventoryStockBalance.findUniqueOrThrow({
      where: {
        id_tenantId: { id: prepared.stock.balance.id, tenantId },
      },
    });
    expect(balance.quantity).toBe(1);
    expect(balance.quantity).toBeGreaterThanOrEqual(0);
    const overview = await service.getOverview(user, { limit: 1 });
    expect(overview.summary).toMatchObject({
      availableUnits: 1,
      activeTransferCount: 1,
      lowStockItemCount: 0,
      expiredBalanceCount: 0,
      openIncidentCount: 0,
    });
    await expect(
      prisma.$executeRaw`
        UPDATE "InventoryStockBalance"
        SET "quantity" = -1
        WHERE "id" = ${balance.id} AND "tenantId" = ${tenantId}
      `,
    ).rejects.toThrow();
  });

  it('persists the full dispatch/receive/return/reconcile chain and exact replay', async () => {
    const { tenantId, userId, user } = await createContext(
      PoliticalOperationStage.SIMULATION,
    );
    const prepared = await prepareStock(user, 3, randomUUID().slice(0, 8));
    const dispatchInput = {
      clientRequestId: randomUUID(),
      code: `TRACE_${randomUUID().slice(0, 8)}`,
      sourceWarehouseId: prepared.source.warehouse.id,
      destinationWarehouseId: prepared.destination.warehouse.id,
      destinationLabel: 'Bodega destino de trazabilidad',
      custodianUserId: userId,
      purpose: 'Seguimiento físico completo de un kit para prueba de custodia.',
      custodyDeclaration:
        'El custodio recibe exactamente tres unidades y acepta la cadena documentada.',
      occurredAt: new Date(Date.now() - 90_000).toISOString(),
      lines: [{ stockBalanceId: prepared.stock.balance.id, quantity: 3 }],
    };
    const dispatchDto = command(
      'DISPATCH',
      dispatchInput,
    ) as DispatchInventoryDto;
    const dispatched = await service.dispatch(user, dispatchDto);
    const replayed = await service.dispatch(user, dispatchDto);
    expect(replayed.noOp).toBe(true);
    expect(replayed.transfer.id).toBe(dispatched.transfer.id);
    const lineId = dispatched.transfer.lines[0].id;

    const received = await service.receiveTransfer(
      user,
      dispatched.transfer.id,
      command('RECEIVE', {
        clientRequestId: randomUUID(),
        expectedTransferUpdatedAt: dispatched.transfer.updatedAt.toISOString(),
        custodyDeclaration:
          'Se reciben dos unidades utilizables y una dañada, conservando el conteo.',
        occurredAt: new Date(Date.now() - 60_000).toISOString(),
        lines: [
          {
            lineId,
            usableQuantity: 2,
            damagedQuantity: 1,
            missingQuantity: 0,
          },
        ],
      }) as ReceiveInventoryTransferDto,
    );
    expect(received.transfer.status).toBe(
      InventoryTransferStatus.RECEIVED_WITH_INCIDENT,
    );

    const returned = await service.returnTransfer(
      user,
      dispatched.transfer.id,
      command('RETURN', {
        clientRequestId: randomUUID(),
        expectedTransferUpdatedAt: received.transfer.updatedAt.toISOString(),
        custodyDeclaration:
          'Se devuelve una unidad utilizable y se verifica su ingreso a origen.',
        occurredAt: new Date(Date.now() - 30_000).toISOString(),
        lines: [{ lineId, quantity: 1 }],
      }) as ReturnInventoryTransferDto,
    );
    expect(returned.transfer.status).toBe(
      InventoryTransferStatus.PARTIALLY_RETURNED,
    );

    const reconciled = await service.reconcileTransfer(
      user,
      dispatched.transfer.id,
      command('RECONCILE', {
        clientRequestId: randomUUID(),
        expectedTransferUpdatedAt: returned.transfer.updatedAt.toISOString(),
        reconciliationNote:
          'Una unidad fue consumida, una devuelta y la dañada quedó en incidencia.',
        occurredAt: new Date().toISOString(),
        lines: [
          {
            lineId,
            consumedQuantity: 1,
            missingQuantity: 0,
            damagedQuantity: 0,
          },
        ],
      }) as ReconcileInventoryTransferDto,
    );
    expect(reconciled.transfer.status).toBe(InventoryTransferStatus.RECONCILED);
    expect(reconciled.transfer.custodyEvents.map(({ type }) => type)).toEqual([
      'DISPATCHED',
      'RECEIVED',
      'RETURNED',
      'RECONCILED',
    ]);
    expect(reconciled.transfer.incidents).toEqual([
      expect.objectContaining({ type: 'DAMAGED', quantity: 1 }),
    ]);

    const commands = await prisma.inventoryCommand.count({
      where: { tenantId },
    });
    const movements = await prisma.inventoryMovement.count({
      where: { tenantId },
    });
    expect(commands).toBe(8);
    expect(movements).toBe(6);
    await expect(
      prisma.inventoryMovement.updateMany({
        where: { tenantId },
        data: { reason: 'tampering' },
      }),
    ).rejects.toThrow();
  });
});
