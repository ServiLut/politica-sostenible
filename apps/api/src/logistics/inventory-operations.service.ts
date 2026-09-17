import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  DivisionType,
  InventoryCommandType,
  InventoryCustodyEventType,
  InventoryIncidentType,
  InventoryRecordOrigin,
  InventoryStockCondition,
  InventoryTrackingMode,
  InventoryTransferStatus,
  MovementType,
  PoliticalOperationMode,
  PoliticalOperationStage,
  Prisma,
  Role,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  assertCampaignTenant,
  CAMPAIGN_TENANT_SELECT,
} from '../common/utils/campaign-mode.util';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateInventoryWarehouseDto,
  DispatchInventoryDto,
  ImportInventoryItemsDto,
  InventoryIdempotentCommandDto,
  InventoryOverviewQueryDto,
  ReceiveInventoryStockDto,
  ReceiveInventoryTransferDto,
  ReconcileInventoryTransferDto,
  ReportInventoryIncidentDto,
  ReturnInventoryTransferDto,
} from './dto/inventory-operations.dto';
import {
  computeInventoryCommandSha256,
  type InventoryCommandName,
} from './inventory-operations.hash';

export const INVENTORY_READ_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.ZONE_COORDINATOR,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
] as const;

export const INVENTORY_ADMIN_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
] as const;

export const INVENTORY_FIELD_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.ZONE_COORDINATOR,
] as const;

export const INVENTORY_SETUP_STAGES = [
  PoliticalOperationStage.EXPLORATION,
  PoliticalOperationStage.PRE_CAMPAIGN,
  PoliticalOperationStage.SIGNATURE_COLLECTION,
  PoliticalOperationStage.CAMPAIGN,
  PoliticalOperationStage.ELECTION_PREPARATION,
  PoliticalOperationStage.SIMULATION,
] as const;

export const INVENTORY_STOCK_RECEIVE_STAGES = [
  ...INVENTORY_SETUP_STAGES,
  PoliticalOperationStage.ELECTION_DAY,
] as const;

export const INVENTORY_DISPATCH_STAGES = [
  PoliticalOperationStage.CAMPAIGN,
  PoliticalOperationStage.ELECTION_PREPARATION,
  PoliticalOperationStage.SIMULATION,
  PoliticalOperationStage.ELECTION_DAY,
] as const;

export const INVENTORY_TRANSFER_RECEIVE_STAGES = [
  PoliticalOperationStage.CAMPAIGN,
  PoliticalOperationStage.ELECTION_PREPARATION,
  PoliticalOperationStage.SIMULATION,
  PoliticalOperationStage.ELECTION_DAY,
  PoliticalOperationStage.POST_ELECTION,
] as const;

export const INVENTORY_RETURN_STAGES = [
  PoliticalOperationStage.SIMULATION,
  PoliticalOperationStage.ELECTION_DAY,
  PoliticalOperationStage.POST_ELECTION,
] as const;

export const INVENTORY_RECONCILE_STAGES = [
  PoliticalOperationStage.SIMULATION,
  PoliticalOperationStage.POST_ELECTION,
] as const;

export const INVENTORY_INCIDENT_STAGES = [
  PoliticalOperationStage.EXPLORATION,
  PoliticalOperationStage.PRE_CAMPAIGN,
  PoliticalOperationStage.SIGNATURE_COLLECTION,
  PoliticalOperationStage.CAMPAIGN,
  PoliticalOperationStage.ELECTION_PREPARATION,
  PoliticalOperationStage.SIMULATION,
  PoliticalOperationStage.ELECTION_DAY,
  PoliticalOperationStage.POST_ELECTION,
] as const;

const SERIALIZABLE_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 30_000,
} as const;

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const HTTPS_REFERENCE_MAX_LENGTH = 2_048;
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const MAX_HISTORICAL_OCCURRENCE_MS = 366 * 24 * 60 * 60 * 1_000;

const WAREHOUSE_SELECT = {
  id: true,
  code: true,
  name: true,
  address: true,
  isActive: true,
  recordOrigin: true,
  responsibleUser: { select: { id: true, name: true, role: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.InventoryWarehouseSelect;

const ITEM_SELECT = {
  id: true,
  name: true,
  sku: true,
  description: true,
  unit: true,
  trackingMode: true,
  minimumStock: true,
  recordOrigin: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.InventoryItemSelect;

const BALANCE_SELECT = {
  id: true,
  itemId: true,
  warehouseId: true,
  trackingKey: true,
  lotNumber: true,
  serialNumber: true,
  expiresAt: true,
  condition: true,
  quantity: true,
  responsibleUserId: true,
  item: { select: ITEM_SELECT },
  warehouse: { select: WAREHOUSE_SELECT },
  responsibleUser: { select: { id: true, name: true, role: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.InventoryStockBalanceSelect;

const TRANSFER_INCLUDE = {
  sourceWarehouse: { select: WAREHOUSE_SELECT },
  destinationWarehouse: { select: WAREHOUSE_SELECT },
  destinationDivision: {
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      expectedTables: true,
      isActive: true,
    },
  },
  custodian: { select: { id: true, name: true, role: true, isActive: true } },
  dispatchedBy: { select: { id: true, name: true, role: true } },
  reconciledBy: { select: { id: true, name: true, role: true } },
  lines: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      item: { select: ITEM_SELECT },
      sourceStockBalance: { select: BALANCE_SELECT },
    },
  },
  custodyEvents: {
    orderBy: { occurredAt: 'asc' as const },
    select: {
      id: true,
      type: true,
      occurredAt: true,
      declaration: true,
      actor: { select: { id: true, name: true, role: true } },
      fromUser: { select: { id: true, name: true, role: true } },
      toUser: { select: { id: true, name: true, role: true } },
      createdAt: true,
    },
  },
  incidents: {
    orderBy: { occurredAt: 'desc' as const },
    select: {
      id: true,
      transferLineId: true,
      type: true,
      quantity: true,
      description: true,
      evidenceReference: true,
      evidenceSha256: true,
      occurredAt: true,
      reportedBy: { select: { id: true, name: true, role: true } },
      createdAt: true,
    },
  },
} satisfies Prisma.InventoryTransferInclude;

const COMMAND_SELECT = {
  id: true,
  clientRequestId: true,
  payloadSha256: true,
  type: true,
  actorUserId: true,
  resourceType: true,
  resourceId: true,
  resultSummary: true,
  createdAt: true,
} satisfies Prisma.InventoryCommandSelect;

type SelectedWarehouse = Prisma.InventoryWarehouseGetPayload<{
  select: typeof WAREHOUSE_SELECT;
}>;
type SelectedItem = Prisma.InventoryItemGetPayload<{
  select: typeof ITEM_SELECT;
}>;
type SelectedBalance = Prisma.InventoryStockBalanceGetPayload<{
  select: typeof BALANCE_SELECT;
}>;
type SelectedTransfer = Prisma.InventoryTransferGetPayload<{
  include: typeof TRANSFER_INCLUDE;
}>;
type SelectedCommand = Prisma.InventoryCommandGetPayload<{
  select: typeof COMMAND_SELECT;
}>;
type InventoryActor = Readonly<{ id: string; role: Role }>;

interface CommandOutcome<T extends object> {
  resourceType: string;
  resourceId: string | null;
  resultSummary: Prisma.InputJsonObject;
  response: T;
}

interface StockMutationInput {
  tenantId: string;
  actorUserId: string;
  commandId: string;
  item: {
    id: string;
    trackingMode: InventoryTrackingMode | null;
  };
  warehouseId: string;
  delta: number;
  trackingKey: string;
  lotNumber: string | null;
  serialNumber: string | null;
  expiresAt: Date | null;
  condition: InventoryStockCondition;
  responsibleUserId: string | null;
  movementType: MovementType;
  reason: string;
  occurredAt: Date;
  transferId?: string;
  transferLineId?: string;
  custodyFromUserId?: string;
  custodyToUserId?: string;
}

@Injectable()
export class InventoryOperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(user: AuthenticatedUser, query: InventoryOverviewQueryDto) {
    const limit = Number.isInteger(query.limit)
      ? Math.min(Math.max(query.limit, 1), 100)
      : 50;
    const evaluatedAt = new Date();
    return this.prisma.$transaction(async (transaction) => {
      await this.requireActor(
        transaction,
        user,
        INVENTORY_READ_ROLES,
        'No tiene permisos vigentes para consultar logistica electoral',
      );
      const profile = await transaction.operationProfile.findUnique({
        where: { tenantId: user.tenantId },
        select: { stage: true, closureType: true, terminatedAt: true },
      });
      if (!profile) {
        throw new ConflictException(
          'Configure el perfil de operacion antes de usar logistica electoral',
        );
      }
      if (query.warehouseId) {
        await this.requireWarehouse(
          transaction,
          user.tenantId,
          query.warehouseId,
          false,
        );
      }

      const [
        warehouses,
        items,
        balances,
        transfers,
        incidents,
        operators,
        availableByItem,
        thresholdItems,
        expiredBalanceCount,
        activeTransferCount,
        incidentCount,
      ] = await Promise.all([
        transaction.inventoryWarehouse.findMany({
          where: { tenantId: user.tenantId },
          orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
          select: WAREHOUSE_SELECT,
        }),
        transaction.inventoryItem.findMany({
          where: { tenantId: user.tenantId },
          orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
          take: limit,
          select: ITEM_SELECT,
        }),
        transaction.inventoryStockBalance.findMany({
          where: {
            tenantId: user.tenantId,
            ...(query.warehouseId
              ? { warehouseId: query.warehouseId }
              : undefined),
          },
          orderBy: [{ warehouseId: 'asc' }, { itemId: 'asc' }],
          take: limit * 4,
          select: BALANCE_SELECT,
        }),
        transaction.inventoryTransfer.findMany({
          where: { tenantId: user.tenantId },
          orderBy: { dispatchedAt: 'desc' },
          take: Math.min(limit, 30),
          include: TRANSFER_INCLUDE,
        }),
        transaction.inventoryIncident.findMany({
          where: { tenantId: user.tenantId },
          orderBy: { occurredAt: 'desc' },
          take: Math.min(limit, 30),
          select: {
            id: true,
            transferId: true,
            transferLineId: true,
            type: true,
            quantity: true,
            description: true,
            evidenceReference: true,
            evidenceSha256: true,
            occurredAt: true,
            reportedBy: { select: { id: true, name: true, role: true } },
            createdAt: true,
          },
        }),
        transaction.user.findMany({
          where: {
            tenantId: user.tenantId,
            isActive: true,
            role: { in: [...INVENTORY_FIELD_ROLES] },
          },
          orderBy: { name: 'asc' },
          select: { id: true, name: true, role: true },
        }),
        transaction.inventoryStockBalance.groupBy({
          by: ['itemId'],
          where: {
            tenantId: user.tenantId,
            condition: InventoryStockCondition.AVAILABLE,
            ...(query.warehouseId
              ? { warehouseId: query.warehouseId }
              : undefined),
          },
          _sum: { quantity: true },
        }),
        transaction.inventoryItem.findMany({
          where: {
            tenantId: user.tenantId,
            isActive: true,
            minimumStock: { not: null },
          },
          select: { id: true, minimumStock: true },
        }),
        transaction.inventoryStockBalance.count({
          where: {
            tenantId: user.tenantId,
            quantity: { gt: 0 },
            expiresAt: { lte: evaluatedAt },
            ...(query.warehouseId
              ? { warehouseId: query.warehouseId }
              : undefined),
          },
        }),
        transaction.inventoryTransfer.count({
          where: {
            tenantId: user.tenantId,
            status: { not: InventoryTransferStatus.RECONCILED },
          },
        }),
        transaction.inventoryIncident.count({
          where: { tenantId: user.tenantId },
        }),
      ]);

      const availableTotals = new Map(
        availableByItem.map((balance) => [
          balance.itemId,
          balance._sum.quantity ?? 0,
        ]),
      );
      const lowStockItemIds = new Set(
        thresholdItems
          .filter(
            (item) =>
              (availableTotals.get(item.id) ?? 0) < (item.minimumStock ?? 0),
          )
          .map((item) => item.id),
      );

      return {
        operation: profile,
        readOnly: profile.stage === PoliticalOperationStage.CLOSED,
        inventoryLimitApplied: limit,
        summary: {
          warehouseCount: warehouses.length,
          itemCountReturned: items.length,
          balanceCountReturned: balances.length,
          availableUnits: [...availableTotals.values()].reduce(
            (sum, quantity) => sum + quantity,
            0,
          ),
          lowStockItemCount: lowStockItemIds.size,
          expiredBalanceCount,
          activeTransferCount,
          openIncidentCount: incidentCount,
        },
        warnings: [
          ...(warehouses.some(
            (warehouse) =>
              warehouse.recordOrigin ===
              InventoryRecordOrigin.LEGACY_UNCLASSIFIED,
          )
            ? [
                'Existen saldos heredados sin cadena de custodia verificada; concilielos antes de usarlos en un despacho.',
              ]
            : []),
          ...(balances.length >= limit * 4
            ? [
                'La lista de saldos fue limitada; filtre por bodega o consulte una pagina adicional antes de conciliar.',
              ]
            : []),
        ],
        warehouses,
        items,
        balances,
        transfers,
        incidents,
        operators,
      };
    });
  }

  async getTransfer(user: AuthenticatedUser, transferId: string) {
    this.assertSafeId(transferId, 'transferId');
    return this.prisma.$transaction(async (transaction) => {
      await this.requireActor(
        transaction,
        user,
        INVENTORY_READ_ROLES,
        'No tiene permisos vigentes para consultar custodias',
      );
      return this.requireTransfer(transaction, user.tenantId, transferId);
    });
  }

  async createWarehouse(
    user: AuthenticatedUser,
    dto: CreateInventoryWarehouseDto,
  ) {
    this.assertText(dto.code, 2, 32, 'codigo de bodega');
    this.assertText(dto.name, 3, 160, 'nombre de bodega');
    if (dto.address) this.assertText(dto.address, 3, 500, 'direccion');
    return this.executeCommand(
      user,
      dto,
      InventoryCommandType.WAREHOUSE_CREATE,
      INVENTORY_ADMIN_ROLES,
      INVENTORY_SETUP_STAGES,
      async (transaction, actor) => {
        if (dto.responsibleUserId) {
          await this.requireOperationalUser(
            transaction,
            user.tenantId,
            dto.responsibleUserId,
            INVENTORY_FIELD_ROLES,
            'La persona responsable de bodega no esta activa o no tiene un rol logistico',
          );
        }
        const duplicate = await transaction.inventoryWarehouse.findUnique({
          where: {
            tenantId_code: { tenantId: user.tenantId, code: dto.code },
          },
          select: { id: true },
        });
        if (duplicate) {
          throw new ConflictException(
            'Ya existe una bodega con este codigo en la organizacion',
          );
        }
        const warehouse = await transaction.inventoryWarehouse.create({
          data: {
            tenantId: user.tenantId,
            code: dto.code,
            name: dto.name,
            address: dto.address ?? null,
            responsibleUserId: dto.responsibleUserId ?? null,
            recordOrigin: InventoryRecordOrigin.API,
            createdById: actor.id,
          },
          select: WAREHOUSE_SELECT,
        });
        return {
          resourceType: 'InventoryWarehouse',
          resourceId: warehouse.id,
          resultSummary: { warehouseId: warehouse.id },
          response: { warehouse },
        };
      },
      async (transaction, command) => ({
        warehouse: await this.requireWarehouse(
          transaction,
          user.tenantId,
          this.requireResourceId(command),
          false,
        ),
      }),
    );
  }

  async importItems(user: AuthenticatedUser, dto: ImportInventoryItemsDto) {
    if (
      !Array.isArray(dto.items) ||
      dto.items.length < 1 ||
      dto.items.length > 100
    ) {
      throw new BadRequestException(
        'La importacion JSON admite entre 1 y 100 filas',
      );
    }
    const normalizedSkus = dto.items.map((item) =>
      item.sku.trim().toUpperCase(),
    );
    if (new Set(normalizedSkus).size !== normalizedSkus.length) {
      throw new BadRequestException('La importacion contiene SKU repetidos');
    }
    for (const item of dto.items) {
      this.assertText(item.sku, 2, 64, 'SKU');
      this.assertText(item.name, 2, 160, 'nombre del articulo');
      this.assertText(item.unit, 1, 40, 'unidad');
      if (!Number.isInteger(item.minimumStock) || item.minimumStock < 0) {
        throw new BadRequestException(
          'minimumStock debe ser un entero no negativo',
        );
      }
      if (!Object.values(InventoryTrackingMode).includes(item.trackingMode)) {
        throw new BadRequestException('trackingMode no es valido');
      }
    }
    return this.executeCommand(
      user,
      dto,
      InventoryCommandType.ITEM_IMPORT,
      INVENTORY_ADMIN_ROLES,
      INVENTORY_SETUP_STAGES,
      async (transaction, actor) => {
        const existing = await transaction.inventoryItem.findMany({
          where: { tenantId: user.tenantId, sku: { in: normalizedSkus } },
          select: ITEM_SELECT,
        });
        const bySku = new Map(existing.map((item) => [item.sku, item]));
        const itemIds: string[] = [];
        let createdCount = 0;
        let unchangedCount = 0;
        for (const row of dto.items) {
          const sku = row.sku.trim().toUpperCase();
          const stored = bySku.get(sku);
          if (stored) {
            if (
              stored.recordOrigin !== InventoryRecordOrigin.API ||
              stored.name !== row.name ||
              stored.description !== (row.description ?? null) ||
              stored.unit !== row.unit ||
              stored.trackingMode !== row.trackingMode ||
              stored.minimumStock !== row.minimumStock
            ) {
              throw new ConflictException(
                `El SKU ${sku} ya existe con una clasificacion distinta; no se reclasifica silenciosamente`,
              );
            }
            itemIds.push(stored.id);
            unchangedCount += 1;
            continue;
          }
          const created = await transaction.inventoryItem.create({
            data: {
              tenantId: user.tenantId,
              sku,
              name: row.name,
              description: row.description ?? null,
              unit: row.unit,
              trackingMode: row.trackingMode,
              minimumStock: row.minimumStock,
              recordOrigin: InventoryRecordOrigin.API,
              isActive: true,
              createdById: actor.id,
              quantity: 0,
              warehouse: null,
            },
            select: ITEM_SELECT,
          });
          itemIds.push(created.id);
          createdCount += 1;
        }
        const items = await transaction.inventoryItem.findMany({
          where: { tenantId: user.tenantId, id: { in: itemIds } },
          orderBy: { name: 'asc' },
          select: ITEM_SELECT,
        });
        return {
          resourceType: 'InventoryItemBatch',
          resourceId: null,
          resultSummary: { itemIds, createdCount, unchangedCount },
          response: { items, createdCount, unchangedCount },
        };
      },
      async (transaction, command) => {
        const itemIds = this.readStringArray(command.resultSummary, 'itemIds');
        const items = await transaction.inventoryItem.findMany({
          where: { tenantId: user.tenantId, id: { in: itemIds } },
          orderBy: { name: 'asc' },
          select: ITEM_SELECT,
        });
        return {
          items,
          createdCount: this.readJsonInteger(
            command.resultSummary,
            'createdCount',
          ),
          unchangedCount: this.readJsonInteger(
            command.resultSummary,
            'unchangedCount',
          ),
        };
      },
    );
  }

  async receiveStock(user: AuthenticatedUser, dto: ReceiveInventoryStockDto) {
    this.assertPositiveInteger(dto.quantity, 'quantity');
    this.assertText(dto.reason, 10, 1_000, 'motivo de ingreso');
    this.assertText(
      dto.custodyDeclaration,
      20,
      1_000,
      'declaracion de custodia',
    );
    const occurredAt = this.parseOccurrence(dto.occurredAt);
    return this.executeCommand(
      user,
      dto,
      InventoryCommandType.STOCK_RECEIVE,
      INVENTORY_ADMIN_ROLES,
      INVENTORY_STOCK_RECEIVE_STAGES,
      async (transaction, actor, commandId) => {
        const warehouse = await this.requireWarehouse(
          transaction,
          user.tenantId,
          dto.warehouseId,
          true,
        );
        const item = await this.requireItem(
          transaction,
          user.tenantId,
          dto.itemId,
        );
        if (dto.responsibleUserId) {
          await this.requireOperationalUser(
            transaction,
            user.tenantId,
            dto.responsibleUserId,
            INVENTORY_FIELD_ROLES,
            'La persona responsable del saldo no esta activa o no tiene un rol logistico',
          );
        }
        const tracking = this.resolveTracking(
          item,
          dto.quantity,
          dto.lotNumber,
          dto.serialNumber,
          dto.expiresAt,
        );
        if (
          tracking.expiresAt &&
          tracking.expiresAt.getTime() <= occurredAt.getTime()
        ) {
          throw new ConflictException(
            'No puede ingresar como disponible una existencia ya vencida',
          );
        }
        const balance = await this.mutateStock(transaction, {
          tenantId: user.tenantId,
          actorUserId: actor.id,
          commandId,
          item,
          warehouseId: warehouse.id,
          delta: dto.quantity,
          ...tracking,
          condition: InventoryStockCondition.AVAILABLE,
          responsibleUserId:
            dto.responsibleUserId ?? warehouse.responsibleUser?.id ?? null,
          movementType: MovementType.RECEIPT,
          reason: dto.reason,
          occurredAt,
          custodyToUserId:
            dto.responsibleUserId ?? warehouse.responsibleUser?.id ?? undefined,
        });
        await transaction.inventoryCustodyEvent.create({
          data: {
            tenantId: user.tenantId,
            commandId,
            type: InventoryCustodyEventType.STOCK_RECEIVED,
            actorUserId: actor.id,
            toUserId:
              dto.responsibleUserId ?? warehouse.responsibleUser?.id ?? null,
            declaration: dto.custodyDeclaration,
            occurredAt,
          },
        });
        return {
          resourceType: 'InventoryStockBalance',
          resourceId: balance.id,
          resultSummary: { balanceId: balance.id },
          response: { balance },
        };
      },
      async (transaction, command) => ({
        balance: await this.requireBalance(
          transaction,
          user.tenantId,
          this.requireResourceId(command),
        ),
      }),
    );
  }

  async dispatch(user: AuthenticatedUser, dto: DispatchInventoryDto) {
    if (
      !Array.isArray(dto.lines) ||
      dto.lines.length < 1 ||
      dto.lines.length > 50
    ) {
      throw new BadRequestException('El despacho admite entre 1 y 50 saldos');
    }
    this.assertText(dto.code, 3, 64, 'codigo de despacho');
    this.assertText(dto.destinationLabel, 3, 300, 'destino');
    this.assertText(dto.purpose, 20, 1_000, 'proposito');
    this.assertText(
      dto.custodyDeclaration,
      20,
      1_000,
      'declaracion de custodia',
    );
    const occurredAt = this.parseOccurrence(dto.occurredAt);
    const expectedReturnAt = dto.expectedReturnAt
      ? this.parseDate(dto.expectedReturnAt, 'expectedReturnAt')
      : null;
    if (expectedReturnAt && expectedReturnAt.getTime() < occurredAt.getTime()) {
      throw new BadRequestException(
        'expectedReturnAt no puede ser anterior al despacho',
      );
    }
    const lineIds = dto.lines.map((line) => line.stockBalanceId);
    if (new Set(lineIds).size !== lineIds.length) {
      throw new BadRequestException(
        'Un saldo no puede repetirse en el despacho',
      );
    }
    for (const line of dto.lines) {
      this.assertPositiveInteger(line.quantity, 'cantidad de despacho');
    }
    if (dto.destinationWarehouseId && dto.destinationDivisionId) {
      throw new BadRequestException(
        'El destino debe ser una bodega o un puesto electoral, no ambos',
      );
    }
    if (dto.destinationTableNumber && !dto.destinationDivisionId) {
      throw new BadRequestException(
        'La mesa solo puede declararse junto con un puesto electoral valido',
      );
    }
    return this.executeCommand(
      user,
      dto,
      InventoryCommandType.DISPATCH,
      INVENTORY_ADMIN_ROLES,
      INVENTORY_DISPATCH_STAGES,
      async (transaction, actor, commandId) => {
        const sourceWarehouse = await this.requireWarehouse(
          transaction,
          user.tenantId,
          dto.sourceWarehouseId,
          true,
        );
        let destinationWarehouse: SelectedWarehouse | null = null;
        if (dto.destinationWarehouseId) {
          destinationWarehouse = await this.requireWarehouse(
            transaction,
            user.tenantId,
            dto.destinationWarehouseId,
            true,
          );
          if (destinationWarehouse.id === sourceWarehouse.id) {
            throw new BadRequestException(
              'La bodega de destino debe ser distinta a la de origen',
            );
          }
        }
        if (dto.destinationDivisionId) {
          const division = await transaction.politicalDivision.findUnique({
            where: {
              id_tenantId: {
                id: dto.destinationDivisionId,
                tenantId: user.tenantId,
              },
            },
            select: {
              id: true,
              type: true,
              expectedTables: true,
              isActive: true,
            },
          });
          if (
            !division ||
            !division.isActive ||
            division.type !== DivisionType.PUESTO
          ) {
            throw new ConflictException(
              'El destino electoral no es un puesto activo de esta organizacion',
            );
          }
          if (
            dto.destinationTableNumber !== undefined &&
            (division.expectedTables === null ||
              dto.destinationTableNumber > division.expectedTables)
          ) {
            throw new ConflictException(
              'La mesa no existe dentro del numero oficial de mesas del puesto',
            );
          }
        }
        const custodian = await this.requireOperationalUser(
          transaction,
          user.tenantId,
          dto.custodianUserId,
          INVENTORY_FIELD_ROLES,
          'La persona custodio no esta activa o no tiene un rol logistico',
        );
        const duplicateCode = await transaction.inventoryTransfer.findUnique({
          where: {
            tenantId_code: { tenantId: user.tenantId, code: dto.code },
          },
          select: { id: true },
        });
        if (duplicateCode) {
          throw new ConflictException(
            'Ya existe un despacho con este codigo en la organizacion',
          );
        }

        await this.lockBalances(transaction, user.tenantId, lineIds);
        const balances = await transaction.inventoryStockBalance.findMany({
          where: { tenantId: user.tenantId, id: { in: lineIds } },
          orderBy: { id: 'asc' },
          select: BALANCE_SELECT,
        });
        if (balances.length !== lineIds.length) {
          throw new NotFoundException(
            'Uno o mas saldos no existen en esta organizacion',
          );
        }
        const balanceById = new Map(
          balances.map((balance) => [balance.id, balance]),
        );
        for (const requestLine of dto.lines) {
          const balance = balanceById.get(requestLine.stockBalanceId);
          if (!balance || balance.warehouseId !== sourceWarehouse.id) {
            throw new ConflictException(
              'Todos los saldos deben pertenecer a la bodega de origen',
            );
          }
          if (balance.condition !== InventoryStockCondition.AVAILABLE) {
            throw new ConflictException(
              `El saldo ${balance.id} no esta disponible para despacho`,
            );
          }
          if (
            balance.expiresAt &&
            balance.expiresAt.getTime() <= occurredAt.getTime()
          ) {
            throw new ConflictException(
              `El saldo ${balance.id} esta vencido y no puede despacharse`,
            );
          }
          if (balance.quantity < requestLine.quantity) {
            throw new ConflictException(
              `Existencia insuficiente para ${balance.item.name}`,
            );
          }
          if (
            balance.item.trackingMode === InventoryTrackingMode.SERIAL &&
            requestLine.quantity !== 1
          ) {
            throw new BadRequestException(
              'Un serial solo puede despacharse como una unidad',
            );
          }
        }

        const transfer = await transaction.inventoryTransfer.create({
          data: {
            tenantId: user.tenantId,
            commandId,
            code: dto.code,
            sourceWarehouseId: sourceWarehouse.id,
            destinationWarehouseId: destinationWarehouse?.id ?? null,
            destinationDivisionId: dto.destinationDivisionId ?? null,
            destinationLabel: dto.destinationLabel,
            destinationTableNumber: dto.destinationTableNumber ?? null,
            custodianUserId: custodian.id,
            status: InventoryTransferStatus.DISPATCHED,
            purpose: dto.purpose,
            dispatchDeclaration: dto.custodyDeclaration,
            dispatchedById: actor.id,
            dispatchedAt: occurredAt,
            expectedReturnAt,
          },
          select: { id: true },
        });
        for (const requestLine of dto.lines) {
          const balance = balanceById.get(requestLine.stockBalanceId);
          if (!balance) {
            throw new ConflictException('El saldo cambio durante el despacho');
          }
          const line = await transaction.inventoryTransferLine.create({
            data: {
              tenantId: user.tenantId,
              transferId: transfer.id,
              itemId: balance.itemId,
              sourceStockBalanceId: balance.id,
              trackingKey: balance.trackingKey,
              lotNumber: balance.lotNumber,
              serialNumber: balance.serialNumber,
              expiresAt: balance.expiresAt,
              dispatchedQuantity: requestLine.quantity,
            },
            select: { id: true },
          });
          await this.mutateStock(transaction, {
            tenantId: user.tenantId,
            actorUserId: actor.id,
            commandId,
            item: balance.item,
            warehouseId: sourceWarehouse.id,
            delta: -requestLine.quantity,
            trackingKey: balance.trackingKey,
            lotNumber: balance.lotNumber,
            serialNumber: balance.serialNumber,
            expiresAt: balance.expiresAt,
            condition: balance.condition,
            responsibleUserId: balance.responsibleUserId,
            movementType: MovementType.DISPATCH,
            reason: dto.purpose,
            occurredAt,
            transferId: transfer.id,
            transferLineId: line.id,
            custodyFromUserId:
              balance.responsibleUserId ??
              sourceWarehouse.responsibleUser?.id ??
              undefined,
            custodyToUserId: custodian.id,
          });
        }
        await transaction.inventoryCustodyEvent.create({
          data: {
            tenantId: user.tenantId,
            transferId: transfer.id,
            commandId,
            type: InventoryCustodyEventType.DISPATCHED,
            actorUserId: actor.id,
            fromUserId: sourceWarehouse.responsibleUser?.id ?? null,
            toUserId: custodian.id,
            declaration: dto.custodyDeclaration,
            occurredAt,
          },
        });
        const response = await this.requireTransfer(
          transaction,
          user.tenantId,
          transfer.id,
        );
        return {
          resourceType: 'InventoryTransfer',
          resourceId: transfer.id,
          resultSummary: {
            transferId: transfer.id,
            lineCount: dto.lines.length,
          },
          response: { transfer: response },
        };
      },
      async (transaction, command) => ({
        transfer: await this.requireTransfer(
          transaction,
          user.tenantId,
          this.requireResourceId(command),
        ),
      }),
    );
  }

  async receiveTransfer(
    user: AuthenticatedUser,
    transferId: string,
    dto: ReceiveInventoryTransferDto,
  ) {
    this.assertSafeId(transferId, 'transferId');
    this.assertTransferLines(dto.lines, (line) => {
      this.assertNonNegativeInteger(line.usableQuantity, 'usableQuantity');
      this.assertNonNegativeInteger(line.damagedQuantity, 'damagedQuantity');
      this.assertNonNegativeInteger(line.missingQuantity, 'missingQuantity');
      if (
        line.usableQuantity + line.damagedQuantity + line.missingQuantity <
        1
      ) {
        throw new BadRequestException(
          'Cada linea recibida debe reportar al menos una unidad',
        );
      }
    });
    this.assertText(
      dto.custodyDeclaration,
      20,
      2_000,
      'declaracion de recepcion',
    );
    const occurredAt = this.parseOccurrence(dto.occurredAt);
    return this.executeCommand(
      user,
      dto,
      InventoryCommandType.RECEIVE,
      INVENTORY_FIELD_ROLES,
      INVENTORY_TRANSFER_RECEIVE_STAGES,
      async (transaction, actor, commandId) => {
        const transfer = await this.requireLockedTransfer(
          transaction,
          user.tenantId,
          transferId,
        );
        this.assertFieldCustodian(actor, transfer.custodianUserId);
        this.assertTransferVersion(
          transfer.updatedAt,
          dto.expectedTransferUpdatedAt,
        );
        this.assertOccurrenceAfterDispatch(occurredAt, transfer.dispatchedAt);
        if (
          transfer.status !== InventoryTransferStatus.DISPATCHED &&
          transfer.status !== InventoryTransferStatus.PARTIALLY_RECEIVED
        ) {
          throw new ConflictException(
            `El despacho no admite mas recepciones en estado ${transfer.status}`,
          );
        }
        const lineById = new Map(transfer.lines.map((line) => [line.id, line]));
        if (dto.lines.some((line) => !lineById.has(line.lineId))) {
          throw new NotFoundException(
            'Una linea no pertenece al despacho de esta organizacion',
          );
        }
        const destinationWarehouse = transfer.destinationWarehouseId
          ? await this.requireWarehouse(
              transaction,
              user.tenantId,
              transfer.destinationWarehouseId,
              true,
            )
          : null;
        for (const requestLine of dto.lines) {
          const line = lineById.get(requestLine.lineId);
          if (!line)
            throw new ConflictException('La linea cambio durante la recepcion');
          const previouslyAccounted =
            line.receivedUsableQuantity +
            line.receivedDamagedQuantity +
            line.transitMissingQuantity;
          const receivedNow =
            requestLine.usableQuantity +
            requestLine.damagedQuantity +
            requestLine.missingQuantity;
          if (previouslyAccounted + receivedNow > line.dispatchedQuantity) {
            throw new ConflictException(
              `La recepcion excede lo despachado para ${line.item.name}`,
            );
          }
          await transaction.inventoryTransferLine.update({
            where: {
              id_tenantId: { id: line.id, tenantId: user.tenantId },
            },
            data: {
              receivedUsableQuantity: { increment: requestLine.usableQuantity },
              receivedDamagedQuantity: {
                increment: requestLine.damagedQuantity,
              },
              transitMissingQuantity: {
                increment: requestLine.missingQuantity,
              },
            },
          });
          if (destinationWarehouse && requestLine.usableQuantity > 0) {
            await this.mutateStock(transaction, {
              tenantId: user.tenantId,
              actorUserId: actor.id,
              commandId,
              item: line.item,
              warehouseId: destinationWarehouse.id,
              delta: requestLine.usableQuantity,
              trackingKey: line.trackingKey,
              lotNumber: line.lotNumber,
              serialNumber: line.serialNumber,
              expiresAt: line.expiresAt,
              condition:
                line.expiresAt &&
                line.expiresAt.getTime() <= occurredAt.getTime()
                  ? InventoryStockCondition.EXPIRED
                  : InventoryStockCondition.AVAILABLE,
              responsibleUserId:
                destinationWarehouse.responsibleUser?.id ??
                transfer.custodianUserId,
              movementType: MovementType.TRANSFER_RECEIPT,
              reason: transfer.purpose,
              occurredAt,
              transferId: transfer.id,
              transferLineId: line.id,
              custodyFromUserId: transfer.custodianUserId,
              custodyToUserId:
                destinationWarehouse.responsibleUser?.id ??
                transfer.custodianUserId,
            });
          }
          if (requestLine.damagedQuantity > 0) {
            await this.createSystemIncident(transaction, {
              tenantId: user.tenantId,
              commandId,
              transferId: transfer.id,
              transferLineId: line.id,
              type: InventoryIncidentType.DAMAGED,
              quantity: requestLine.damagedQuantity,
              description:
                'Unidades reportadas como danadas durante la recepcion del despacho.',
              actorUserId: actor.id,
              occurredAt,
            });
          }
          if (requestLine.missingQuantity > 0) {
            await this.createSystemIncident(transaction, {
              tenantId: user.tenantId,
              commandId,
              transferId: transfer.id,
              transferLineId: line.id,
              type: InventoryIncidentType.MISSING,
              quantity: requestLine.missingQuantity,
              description:
                'Unidades faltantes reportadas durante la recepcion del despacho.',
              actorUserId: actor.id,
              occurredAt,
            });
          }
          if (
            requestLine.usableQuantity > 0 &&
            line.expiresAt &&
            line.expiresAt.getTime() <= occurredAt.getTime()
          ) {
            await this.createSystemIncident(transaction, {
              tenantId: user.tenantId,
              commandId,
              transferId: transfer.id,
              transferLineId: line.id,
              type: InventoryIncidentType.EXPIRED,
              quantity: requestLine.usableQuantity,
              description:
                'Unidades que vencieron durante el traslado fueron aisladas al recibir.',
              actorUserId: actor.id,
              occurredAt,
            });
          }
        }
        await transaction.inventoryCustodyEvent.create({
          data: {
            tenantId: user.tenantId,
            transferId: transfer.id,
            commandId,
            type: InventoryCustodyEventType.RECEIVED,
            actorUserId: actor.id,
            fromUserId: transfer.dispatchedById,
            toUserId: transfer.custodianUserId,
            declaration: dto.custodyDeclaration,
            occurredAt,
          },
        });
        const currentLines = await transaction.inventoryTransferLine.findMany({
          where: { tenantId: user.tenantId, transferId: transfer.id },
          select: {
            dispatchedQuantity: true,
            receivedUsableQuantity: true,
            receivedDamagedQuantity: true,
            transitMissingQuantity: true,
          },
        });
        const complete = currentLines.every(
          (line) =>
            line.receivedUsableQuantity +
              line.receivedDamagedQuantity +
              line.transitMissingQuantity ===
            line.dispatchedQuantity,
        );
        const hasIncident = currentLines.some(
          (line) =>
            line.receivedDamagedQuantity > 0 || line.transitMissingQuantity > 0,
        );
        const expiredInTransit = transfer.lines.some(
          (line) =>
            line.expiresAt !== null &&
            line.expiresAt.getTime() <= occurredAt.getTime(),
        );
        const status = complete
          ? hasIncident || expiredInTransit
            ? InventoryTransferStatus.RECEIVED_WITH_INCIDENT
            : InventoryTransferStatus.RECEIVED
          : InventoryTransferStatus.PARTIALLY_RECEIVED;
        await transaction.inventoryTransfer.update({
          where: {
            id_tenantId: { id: transfer.id, tenantId: user.tenantId },
          },
          data: { status },
        });
        const response = await this.requireTransfer(
          transaction,
          user.tenantId,
          transfer.id,
        );
        return {
          resourceType: 'InventoryTransfer',
          resourceId: transfer.id,
          resultSummary: {
            transferId: transfer.id,
            receivedLineCount: dto.lines.length,
            resultingStatus: status,
          },
          response: { transfer: response },
        };
      },
      async (transaction, command) => ({
        transfer: await this.requireTransfer(
          transaction,
          user.tenantId,
          this.requireResourceId(command),
        ),
      }),
    );
  }

  async returnTransfer(
    user: AuthenticatedUser,
    transferId: string,
    dto: ReturnInventoryTransferDto,
  ) {
    this.assertSafeId(transferId, 'transferId');
    this.assertTransferLines(dto.lines, (line) =>
      this.assertPositiveInteger(line.quantity, 'cantidad devuelta'),
    );
    this.assertText(
      dto.custodyDeclaration,
      20,
      2_000,
      'declaracion de devolucion',
    );
    const occurredAt = this.parseOccurrence(dto.occurredAt);
    return this.executeCommand(
      user,
      dto,
      InventoryCommandType.RETURN,
      INVENTORY_FIELD_ROLES,
      INVENTORY_RETURN_STAGES,
      async (transaction, actor, commandId) => {
        const transfer = await this.requireLockedTransfer(
          transaction,
          user.tenantId,
          transferId,
        );
        this.assertFieldCustodian(actor, transfer.custodianUserId);
        this.assertTransferVersion(
          transfer.updatedAt,
          dto.expectedTransferUpdatedAt,
        );
        this.assertOccurrenceAfterDispatch(occurredAt, transfer.dispatchedAt);
        const returnableStatuses: readonly InventoryTransferStatus[] = [
          InventoryTransferStatus.RECEIVED,
          InventoryTransferStatus.RECEIVED_WITH_INCIDENT,
          InventoryTransferStatus.PARTIALLY_RETURNED,
        ];
        if (!returnableStatuses.includes(transfer.status)) {
          throw new ConflictException(
            `El despacho no admite devoluciones en estado ${transfer.status}`,
          );
        }
        const lineById = new Map(transfer.lines.map((line) => [line.id, line]));
        if (dto.lines.some((line) => !lineById.has(line.lineId))) {
          throw new NotFoundException(
            'Una linea no pertenece al despacho de esta organizacion',
          );
        }
        const sourceWarehouse = await this.requireWarehouse(
          transaction,
          user.tenantId,
          transfer.sourceWarehouseId,
          false,
        );
        const destinationWarehouse = transfer.destinationWarehouseId
          ? await this.requireWarehouse(
              transaction,
              user.tenantId,
              transfer.destinationWarehouseId,
              false,
            )
          : null;
        for (const requestLine of dto.lines) {
          const line = lineById.get(requestLine.lineId);
          if (!line)
            throw new ConflictException(
              'La linea cambio durante la devolucion',
            );
          const returnable =
            line.receivedUsableQuantity - line.returnedQuantity;
          if (requestLine.quantity > returnable) {
            throw new ConflictException(
              `La devolucion excede las unidades utilizables bajo custodia para ${line.item.name}`,
            );
          }
          if (destinationWarehouse) {
            const destinationBalance = await this.findTrackingBalance(
              transaction,
              user.tenantId,
              line.itemId,
              destinationWarehouse.id,
              line.trackingKey,
            );
            if (!destinationBalance) {
              throw new ConflictException(
                `No existe saldo verificable en la bodega de destino para ${line.item.name}`,
              );
            }
            await this.mutateStock(transaction, {
              tenantId: user.tenantId,
              actorUserId: actor.id,
              commandId,
              item: line.item,
              warehouseId: destinationWarehouse.id,
              delta: -requestLine.quantity,
              trackingKey: line.trackingKey,
              lotNumber: line.lotNumber,
              serialNumber: line.serialNumber,
              expiresAt: line.expiresAt,
              condition: destinationBalance.condition,
              responsibleUserId: destinationBalance.responsibleUserId,
              movementType: MovementType.RETURN_OUT,
              reason: transfer.purpose,
              occurredAt,
              transferId: transfer.id,
              transferLineId: line.id,
              custodyFromUserId:
                destinationBalance.responsibleUserId ??
                transfer.custodianUserId,
              custodyToUserId:
                sourceWarehouse.responsibleUser?.id ?? transfer.dispatchedById,
            });
          }
          const sourceCondition =
            line.expiresAt && line.expiresAt.getTime() <= occurredAt.getTime()
              ? InventoryStockCondition.EXPIRED
              : InventoryStockCondition.AVAILABLE;
          await this.mutateStock(transaction, {
            tenantId: user.tenantId,
            actorUserId: actor.id,
            commandId,
            item: line.item,
            warehouseId: sourceWarehouse.id,
            delta: requestLine.quantity,
            trackingKey: line.trackingKey,
            lotNumber: line.lotNumber,
            serialNumber: line.serialNumber,
            expiresAt: line.expiresAt,
            condition: sourceCondition,
            responsibleUserId:
              sourceWarehouse.responsibleUser?.id ?? transfer.dispatchedById,
            movementType: MovementType.RETURN_IN,
            reason: transfer.purpose,
            occurredAt,
            transferId: transfer.id,
            transferLineId: line.id,
            custodyFromUserId: transfer.custodianUserId,
            custodyToUserId:
              sourceWarehouse.responsibleUser?.id ?? transfer.dispatchedById,
          });
          await transaction.inventoryTransferLine.update({
            where: {
              id_tenantId: { id: line.id, tenantId: user.tenantId },
            },
            data: { returnedQuantity: { increment: requestLine.quantity } },
          });
        }
        await transaction.inventoryCustodyEvent.create({
          data: {
            tenantId: user.tenantId,
            transferId: transfer.id,
            commandId,
            type: InventoryCustodyEventType.RETURNED,
            actorUserId: actor.id,
            fromUserId: transfer.custodianUserId,
            toUserId:
              sourceWarehouse.responsibleUser?.id ?? transfer.dispatchedById,
            declaration: dto.custodyDeclaration,
            occurredAt,
          },
        });
        const currentLines = await transaction.inventoryTransferLine.findMany({
          where: { tenantId: user.tenantId, transferId: transfer.id },
          select: {
            receivedUsableQuantity: true,
            returnedQuantity: true,
          },
        });
        const allReturned = currentLines.every(
          (line) => line.returnedQuantity === line.receivedUsableQuantity,
        );
        const status = allReturned
          ? InventoryTransferStatus.RETURNED
          : InventoryTransferStatus.PARTIALLY_RETURNED;
        await transaction.inventoryTransfer.update({
          where: {
            id_tenantId: { id: transfer.id, tenantId: user.tenantId },
          },
          data: { status },
        });
        return {
          resourceType: 'InventoryTransfer',
          resourceId: transfer.id,
          resultSummary: {
            transferId: transfer.id,
            returnedLineCount: dto.lines.length,
            resultingStatus: status,
          },
          response: {
            transfer: await this.requireTransfer(
              transaction,
              user.tenantId,
              transfer.id,
            ),
          },
        };
      },
      async (transaction, command) => ({
        transfer: await this.requireTransfer(
          transaction,
          user.tenantId,
          this.requireResourceId(command),
        ),
      }),
    );
  }

  async reconcileTransfer(
    user: AuthenticatedUser,
    transferId: string,
    dto: ReconcileInventoryTransferDto,
  ) {
    this.assertSafeId(transferId, 'transferId');
    this.assertTransferLines(dto.lines, (line) => {
      this.assertNonNegativeInteger(line.consumedQuantity, 'consumedQuantity');
      this.assertNonNegativeInteger(line.missingQuantity, 'missingQuantity');
      this.assertNonNegativeInteger(line.damagedQuantity, 'damagedQuantity');
    });
    this.assertText(dto.reconciliationNote, 20, 2_000, 'nota de conciliacion');
    const occurredAt = this.parseOccurrence(dto.occurredAt);
    return this.executeCommand(
      user,
      dto,
      InventoryCommandType.RECONCILE,
      INVENTORY_ADMIN_ROLES,
      INVENTORY_RECONCILE_STAGES,
      async (transaction, actor, commandId) => {
        const transfer = await this.requireLockedTransfer(
          transaction,
          user.tenantId,
          transferId,
        );
        this.assertTransferVersion(
          transfer.updatedAt,
          dto.expectedTransferUpdatedAt,
        );
        this.assertOccurrenceAfterDispatch(occurredAt, transfer.dispatchedAt);
        const reconcilableStatuses: readonly InventoryTransferStatus[] = [
          InventoryTransferStatus.RECEIVED,
          InventoryTransferStatus.RECEIVED_WITH_INCIDENT,
          InventoryTransferStatus.PARTIALLY_RETURNED,
          InventoryTransferStatus.RETURNED,
        ];
        if (!reconcilableStatuses.includes(transfer.status)) {
          throw new ConflictException(
            `El despacho no admite conciliacion en estado ${transfer.status}`,
          );
        }
        const allDispatchedAccounted = transfer.lines.every(
          (line) =>
            line.receivedUsableQuantity +
              line.receivedDamagedQuantity +
              line.transitMissingQuantity ===
            line.dispatchedQuantity,
        );
        if (!allDispatchedAccounted) {
          throw new ConflictException(
            'No puede conciliar hasta recibir o declarar faltante todo lo despachado',
          );
        }
        const expectedLineIds = new Set(transfer.lines.map((line) => line.id));
        const receivedLineIds = new Set(dto.lines.map((line) => line.lineId));
        if (
          expectedLineIds.size !== receivedLineIds.size ||
          [...expectedLineIds].some((lineId) => !receivedLineIds.has(lineId))
        ) {
          throw new BadRequestException(
            'La conciliacion debe incluir exactamente todas las lineas del despacho',
          );
        }
        const requestById = new Map(
          dto.lines.map((line) => [line.lineId, line]),
        );
        const destinationWarehouse = transfer.destinationWarehouseId
          ? await this.requireWarehouse(
              transaction,
              user.tenantId,
              transfer.destinationWarehouseId,
              false,
            )
          : null;
        for (const line of transfer.lines) {
          const requestLine = requestById.get(line.id);
          if (!requestLine) {
            throw new BadRequestException('Falta una linea en la conciliacion');
          }
          const unaccountedUsable =
            line.receivedUsableQuantity -
            line.returnedQuantity -
            line.consumedQuantity -
            line.custodyMissingQuantity -
            line.custodyDamagedQuantity;
          const declaredNow =
            requestLine.consumedQuantity +
            requestLine.missingQuantity +
            requestLine.damagedQuantity;
          if (declaredNow !== unaccountedUsable) {
            throw new ConflictException(
              `La conciliacion de ${line.item.name} debe explicar exactamente ${unaccountedUsable} unidades`,
            );
          }
          if (destinationWarehouse && declaredNow > 0) {
            const destinationBalance = await this.findTrackingBalance(
              transaction,
              user.tenantId,
              line.itemId,
              destinationWarehouse.id,
              line.trackingKey,
            );
            if (!destinationBalance) {
              throw new ConflictException(
                `No existe saldo verificable para conciliar ${line.item.name}`,
              );
            }
            await this.mutateStock(transaction, {
              tenantId: user.tenantId,
              actorUserId: actor.id,
              commandId,
              item: line.item,
              warehouseId: destinationWarehouse.id,
              delta: -declaredNow,
              trackingKey: line.trackingKey,
              lotNumber: line.lotNumber,
              serialNumber: line.serialNumber,
              expiresAt: line.expiresAt,
              condition: destinationBalance.condition,
              responsibleUserId: destinationBalance.responsibleUserId,
              movementType: MovementType.RECONCILIATION_OUT,
              reason: dto.reconciliationNote,
              occurredAt,
              transferId: transfer.id,
              transferLineId: line.id,
              custodyFromUserId:
                destinationBalance.responsibleUserId ??
                transfer.custodianUserId,
            });
          }
          await transaction.inventoryTransferLine.update({
            where: {
              id_tenantId: { id: line.id, tenantId: user.tenantId },
            },
            data: {
              consumedQuantity: { increment: requestLine.consumedQuantity },
              custodyMissingQuantity: {
                increment: requestLine.missingQuantity,
              },
              custodyDamagedQuantity: {
                increment: requestLine.damagedQuantity,
              },
            },
          });
          if (requestLine.missingQuantity > 0) {
            await this.createSystemIncident(transaction, {
              tenantId: user.tenantId,
              commandId,
              transferId: transfer.id,
              transferLineId: line.id,
              type: InventoryIncidentType.MISSING,
              quantity: requestLine.missingQuantity,
              description:
                'Unidades faltantes declaradas al conciliar la custodia final.',
              actorUserId: actor.id,
              occurredAt,
            });
          }
          if (requestLine.damagedQuantity > 0) {
            await this.createSystemIncident(transaction, {
              tenantId: user.tenantId,
              commandId,
              transferId: transfer.id,
              transferLineId: line.id,
              type: InventoryIncidentType.DAMAGED,
              quantity: requestLine.damagedQuantity,
              description:
                'Unidades danadas declaradas al conciliar la custodia final.',
              actorUserId: actor.id,
              occurredAt,
            });
          }
        }
        await transaction.inventoryCustodyEvent.create({
          data: {
            tenantId: user.tenantId,
            transferId: transfer.id,
            commandId,
            type: InventoryCustodyEventType.RECONCILED,
            actorUserId: actor.id,
            fromUserId: transfer.custodianUserId,
            declaration: dto.reconciliationNote,
            occurredAt,
          },
        });
        await transaction.inventoryTransfer.update({
          where: {
            id_tenantId: { id: transfer.id, tenantId: user.tenantId },
          },
          data: {
            status: InventoryTransferStatus.RECONCILED,
            reconciledById: actor.id,
            reconciledAt: occurredAt,
            reconciliationNote: dto.reconciliationNote,
          },
        });
        return {
          resourceType: 'InventoryTransfer',
          resourceId: transfer.id,
          resultSummary: {
            transferId: transfer.id,
            reconciledLineCount: dto.lines.length,
          },
          response: {
            transfer: await this.requireTransfer(
              transaction,
              user.tenantId,
              transfer.id,
            ),
          },
        };
      },
      async (transaction, command) => ({
        transfer: await this.requireTransfer(
          transaction,
          user.tenantId,
          this.requireResourceId(command),
        ),
      }),
    );
  }

  async reportIncident(
    user: AuthenticatedUser,
    transferId: string,
    dto: ReportInventoryIncidentDto,
  ) {
    this.assertSafeId(transferId, 'transferId');
    this.assertText(dto.description, 20, 2_000, 'descripcion de incidencia');
    if (dto.quantity !== undefined) {
      this.assertPositiveInteger(dto.quantity, 'cantidad de incidencia');
    }
    this.assertEvidencePair(dto.evidenceReference, dto.evidenceSha256);
    const occurredAt = this.parseOccurrence(dto.occurredAt);
    return this.executeCommand(
      user,
      dto,
      InventoryCommandType.INCIDENT_REPORT,
      INVENTORY_FIELD_ROLES,
      INVENTORY_INCIDENT_STAGES,
      async (transaction, actor, commandId) => {
        const transfer = await this.requireLockedTransfer(
          transaction,
          user.tenantId,
          transferId,
        );
        this.assertFieldCustodian(actor, transfer.custodianUserId);
        this.assertTransferVersion(
          transfer.updatedAt,
          dto.expectedTransferUpdatedAt,
        );
        this.assertOccurrenceAfterDispatch(occurredAt, transfer.dispatchedAt);
        const line = dto.lineId
          ? transfer.lines.find((candidate) => candidate.id === dto.lineId)
          : null;
        if (dto.lineId && !line) {
          throw new NotFoundException(
            'La linea indicada no pertenece al despacho de esta organizacion',
          );
        }
        if (
          line &&
          dto.quantity !== undefined &&
          dto.quantity > line.dispatchedQuantity
        ) {
          throw new BadRequestException(
            'La cantidad de la incidencia excede lo despachado en la linea',
          );
        }
        const incident = await transaction.inventoryIncident.create({
          data: {
            tenantId: user.tenantId,
            transferId: transfer.id,
            transferLineId: line?.id ?? null,
            commandId,
            type: dto.type,
            quantity: dto.quantity ?? null,
            description: dto.description,
            evidenceReference: dto.evidenceReference ?? null,
            evidenceSha256: dto.evidenceSha256 ?? null,
            reportedById: actor.id,
            occurredAt,
          },
          select: {
            id: true,
            transferId: true,
            transferLineId: true,
            type: true,
            quantity: true,
            description: true,
            evidenceReference: true,
            evidenceSha256: true,
            occurredAt: true,
            createdAt: true,
          },
        });
        await transaction.inventoryCustodyEvent.create({
          data: {
            tenantId: user.tenantId,
            transferId: transfer.id,
            commandId,
            type: InventoryCustodyEventType.INCIDENT_REPORTED,
            actorUserId: actor.id,
            fromUserId: transfer.custodianUserId,
            declaration:
              'Incidencia registrada; consulte el expediente autorizado para el detalle.',
            occurredAt,
          },
        });
        return {
          resourceType: 'InventoryIncident',
          resourceId: incident.id,
          resultSummary: {
            incidentId: incident.id,
            transferId: transfer.id,
            type: incident.type,
            quantity: incident.quantity,
            evidenceSha256: incident.evidenceSha256,
          },
          response: { incident },
        };
      },
      async (transaction, command) => {
        const incident = await transaction.inventoryIncident.findUnique({
          where: {
            id_tenantId: {
              id: this.requireResourceId(command),
              tenantId: user.tenantId,
            },
          },
          select: {
            id: true,
            transferId: true,
            transferLineId: true,
            type: true,
            quantity: true,
            description: true,
            evidenceReference: true,
            evidenceSha256: true,
            occurredAt: true,
            createdAt: true,
          },
        });
        if (!incident) throw new NotFoundException('Incidencia no encontrada');
        return { incident };
      },
    );
  }

  private async executeCommand<T extends object>(
    user: AuthenticatedUser,
    dto: InventoryIdempotentCommandDto,
    commandType: InventoryCommandName,
    roles: readonly Role[],
    stages: readonly PoliticalOperationStage[],
    mutate: (
      transaction: Prisma.TransactionClient,
      actor: InventoryActor,
      commandId: string,
    ) => Promise<CommandOutcome<T>>,
    replay: (
      transaction: Prisma.TransactionClient,
      command: SelectedCommand,
    ) => Promise<T>,
  ): Promise<
    T & {
      command: ReturnType<InventoryOperationsService['toCommandReceipt']>;
      noOp: boolean;
    }
  > {
    this.assertCommandInput(dto, commandType);
    const payloadSha256 = computeInventoryCommandSha256(commandType, dto);
    const commandId = randomUUID();
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const actor = await this.requireActor(
          transaction,
          user,
          roles,
          'No tiene un rol vigente para ejecutar esta operacion logistica',
        );
        await this.lockLifecycleAndRequireStage(
          transaction,
          user.tenantId,
          stages,
        );
        const existing = await transaction.inventoryCommand.findUnique({
          where: {
            tenantId_clientRequestId: {
              tenantId: user.tenantId,
              clientRequestId: dto.clientRequestId,
            },
          },
          select: COMMAND_SELECT,
        });
        if (existing) {
          this.assertExactReplay(
            existing,
            commandType,
            payloadSha256,
            actor.id,
          );
          return {
            ...(await replay(transaction, existing)),
            command: this.toCommandReceipt(existing),
            noOp: true,
          };
        }

        const outcome = await mutate(transaction, actor, commandId);
        const command = await transaction.inventoryCommand.create({
          data: {
            id: commandId,
            tenantId: user.tenantId,
            clientRequestId: dto.clientRequestId,
            payloadSha256,
            type: commandType,
            actorUserId: actor.id,
            resourceType: outcome.resourceType,
            resourceId: outcome.resourceId,
            resultSummary: outcome.resultSummary,
          },
          select: COMMAND_SELECT,
        });
        await transaction.auditEvent.create({
          data: {
            tenantId: user.tenantId,
            mode: PoliticalOperationMode.CAMPAIGN,
            actorType: AuditActorType.USER,
            actorUserId: actor.id,
            action: `INVENTORY_${commandType}`,
            resourceType: outcome.resourceType,
            resourceId: outcome.resourceId,
            requestId: dto.clientRequestId,
            after: {
              commandId: command.id,
              clientRequestId: command.clientRequestId,
              payloadSha256,
              type: commandType,
              resourceType: outcome.resourceType,
              resourceId: outcome.resourceId,
              resultSummary: outcome.resultSummary,
            },
          },
        });
        return {
          ...outcome.response,
          command: this.toCommandReceipt(command),
          noOp: false,
        };
      }, SERIALIZABLE_OPTIONS);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2034')
      ) {
        return this.resolveConcurrentCommand(
          user,
          dto,
          commandType,
          payloadSha256,
          roles,
          stages,
          replay,
        );
      }
      throw error;
    }
  }

  private async resolveConcurrentCommand<T extends object>(
    user: AuthenticatedUser,
    dto: InventoryIdempotentCommandDto,
    commandType: InventoryCommandName,
    payloadSha256: string,
    roles: readonly Role[],
    stages: readonly PoliticalOperationStage[],
    replay: (
      transaction: Prisma.TransactionClient,
      command: SelectedCommand,
    ) => Promise<T>,
  ): Promise<
    T & {
      command: ReturnType<InventoryOperationsService['toCommandReceipt']>;
      noOp: boolean;
    }
  > {
    return this.prisma.$transaction(async (transaction) => {
      const actor = await this.requireActor(
        transaction,
        user,
        roles,
        'No tiene un rol vigente para reintentar esta operacion logistica',
      );
      await this.lockLifecycleAndRequireStage(
        transaction,
        user.tenantId,
        stages,
      );
      const existing = await transaction.inventoryCommand.findUnique({
        where: {
          tenantId_clientRequestId: {
            tenantId: user.tenantId,
            clientRequestId: dto.clientRequestId,
          },
        },
        select: COMMAND_SELECT,
      });
      if (!existing) {
        throw new ConflictException({
          code: 'INVENTORY_CONCURRENT_CHANGE',
          message:
            'El inventario cambio concurrentemente; recargue saldos y reintente con un nuevo clientRequestId',
        });
      }
      this.assertExactReplay(existing, commandType, payloadSha256, actor.id);
      return {
        ...(await replay(transaction, existing)),
        command: this.toCommandReceipt(existing),
        noOp: true,
      };
    }, SERIALIZABLE_OPTIONS);
  }

  private assertCommandInput(
    dto: InventoryIdempotentCommandDto,
    commandType: InventoryCommandName,
  ): void {
    if (!UUID_V4_PATTERN.test(dto.clientRequestId)) {
      throw new BadRequestException('clientRequestId debe ser un UUID v4');
    }
    if (!SHA256_PATTERN.test(dto.payloadSha256)) {
      throw new BadRequestException(
        'payloadSha256 debe ser un SHA-256 hexadecimal en minuscula',
      );
    }
    const calculated = computeInventoryCommandSha256(commandType, dto);
    if (calculated !== dto.payloadSha256) {
      throw new BadRequestException(
        'payloadSha256 no corresponde al comando logistico canonico',
      );
    }
  }

  private assertExactReplay(
    command: SelectedCommand,
    commandType: InventoryCommandName,
    payloadSha256: string,
    actorUserId: string,
  ): void {
    if (
      command.type !== commandType ||
      command.payloadSha256 !== payloadSha256 ||
      command.actorUserId !== actorUserId
    ) {
      throw new ConflictException({
        code: 'INVENTORY_IDEMPOTENCY_CONFLICT',
        message:
          'clientRequestId ya fue usado por otro actor, tipo de comando o contenido',
      });
    }
  }

  private toCommandReceipt(command: SelectedCommand) {
    return {
      id: command.id,
      clientRequestId: command.clientRequestId,
      payloadSha256: command.payloadSha256,
      type: command.type,
      resourceType: command.resourceType,
      resourceId: command.resourceId,
      createdAt: command.createdAt,
    };
  }

  private async requireActor(
    transaction: Prisma.TransactionClient,
    user: AuthenticatedUser,
    roles: readonly Role[],
    forbiddenMessage: string,
  ): Promise<InventoryActor> {
    const tenant = await transaction.tenant.findUnique({
      where: { id: user.tenantId },
      select: CAMPAIGN_TENANT_SELECT,
    });
    if (!tenant) throw new NotFoundException('Organizacion no encontrada');
    assertCampaignTenant(tenant);
    const locked = await transaction.$queryRaw<Array<InventoryActor>>(
      Prisma.sql`
        SELECT "id", "role"
        FROM "User"
        WHERE "id" = ${user.userId}
          AND "tenantId" = ${user.tenantId}
          AND "isActive" = true
          AND "role"::text IN (${Prisma.join(roles.map((role) => role))})
        FOR KEY SHARE
      `,
    );
    const actor = locked[0];
    if (!actor) throw new ForbiddenException(forbiddenMessage);
    return actor;
  }

  private async lockLifecycleAndRequireStage(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    stages: readonly PoliticalOperationStage[],
  ): Promise<PoliticalOperationStage> {
    // Do not project pg_advisory_xact_lock's PostgreSQL `void` value: the
    // Prisma driver adapter cannot deserialize it. MATERIALIZED guarantees
    // that the volatile lock call runs while exposing only a supported bool.
    await transaction.$queryRaw<Array<{ locked: boolean }>>(
      Prisma.sql`
        WITH lifecycle_lock AS MATERIALIZED (
          SELECT pg_advisory_xact_lock(
            hashtextextended(${`operation-profile-lifecycle:${tenantId}`}, 0)
          )
        )
        SELECT TRUE AS "locked" FROM lifecycle_lock
      `,
    );
    await transaction.$queryRaw(
      Prisma.sql`SELECT "id" FROM "OperationProfile" WHERE "tenantId" = ${tenantId} FOR UPDATE`,
    );
    const profile = await transaction.operationProfile.findUnique({
      where: { tenantId },
      select: { stage: true },
    });
    if (!profile) {
      throw new ConflictException(
        'Configure el perfil de operacion antes de mutar inventario',
      );
    }
    if (
      profile.stage === PoliticalOperationStage.CLOSED ||
      !stages.includes(profile.stage)
    ) {
      throw new ConflictException({
        code: 'INVENTORY_STAGE_BLOCKED',
        message: `La operacion logistica no esta permitida en etapa ${profile.stage}`,
        stage: profile.stage,
      });
    }
    return profile.stage;
  }

  private async requireOperationalUser(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    roles: readonly Role[],
    message: string,
  ) {
    this.assertSafeId(userId, 'userId');
    const users = await transaction.$queryRaw<
      Array<{ id: string; name: string; role: Role }>
    >(Prisma.sql`
      SELECT "id", "name", "role"
      FROM "User"
      WHERE "id" = ${userId}
        AND "tenantId" = ${tenantId}
        AND "isActive" = true
        AND "role"::text IN (${Prisma.join(roles.map((role) => role))})
      FOR KEY SHARE
    `);
    const operationalUser = users[0];
    if (!operationalUser) throw new ConflictException(message);
    return operationalUser;
  }

  private async requireWarehouse(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    warehouseId: string,
    requireActive: boolean,
  ): Promise<SelectedWarehouse> {
    this.assertSafeId(warehouseId, 'warehouseId');
    const warehouse = await transaction.inventoryWarehouse.findUnique({
      where: { id_tenantId: { id: warehouseId, tenantId } },
      select: WAREHOUSE_SELECT,
    });
    if (!warehouse) throw new NotFoundException('Bodega no encontrada');
    if (requireActive && !warehouse.isActive) {
      throw new ConflictException('La bodega esta inactiva');
    }
    return warehouse;
  }

  private async requireItem(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    itemId: string,
  ): Promise<SelectedItem> {
    this.assertSafeId(itemId, 'itemId');
    const item = await transaction.inventoryItem.findUnique({
      where: { id_tenantId: { id: itemId, tenantId } },
      select: ITEM_SELECT,
    });
    if (!item) throw new NotFoundException('Articulo no encontrado');
    if (!item.isActive)
      throw new ConflictException('El articulo esta inactivo');
    return item;
  }

  private async requireBalance(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    balanceId: string,
  ): Promise<SelectedBalance> {
    const balance = await transaction.inventoryStockBalance.findUnique({
      where: { id_tenantId: { id: balanceId, tenantId } },
      select: BALANCE_SELECT,
    });
    if (!balance)
      throw new NotFoundException('Saldo de inventario no encontrado');
    return balance;
  }

  private async requireTransfer(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    transferId: string,
  ): Promise<SelectedTransfer> {
    const transfer = await transaction.inventoryTransfer.findUnique({
      where: { id_tenantId: { id: transferId, tenantId } },
      include: TRANSFER_INCLUDE,
    });
    if (!transfer) throw new NotFoundException('Despacho no encontrado');
    return transfer;
  }

  private async requireLockedTransfer(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    transferId: string,
  ): Promise<SelectedTransfer> {
    await transaction.$queryRaw(
      Prisma.sql`
        SELECT "id"
        FROM "InventoryTransfer"
        WHERE "id" = ${transferId} AND "tenantId" = ${tenantId}
        FOR UPDATE
      `,
    );
    return this.requireTransfer(transaction, tenantId, transferId);
  }

  private async findTrackingBalance(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    itemId: string,
    warehouseId: string,
    trackingKey: string,
  ): Promise<SelectedBalance | null> {
    return transaction.inventoryStockBalance.findUnique({
      where: {
        tenantId_itemId_warehouseId_trackingKey: {
          tenantId,
          itemId,
          warehouseId,
          trackingKey,
        },
      },
      select: BALANCE_SELECT,
    });
  }

  private async lockBalances(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    balanceIds: readonly string[],
  ): Promise<void> {
    if (balanceIds.length === 0) return;
    await transaction.$queryRaw(
      Prisma.sql`
        SELECT "id"
        FROM "InventoryStockBalance"
        WHERE "tenantId" = ${tenantId}
          AND "id" IN (${Prisma.join([...balanceIds].sort())})
        ORDER BY "id"
        FOR UPDATE
      `,
    );
  }

  private async mutateStock(
    transaction: Prisma.TransactionClient,
    input: StockMutationInput,
  ): Promise<SelectedBalance> {
    let balance = await this.findTrackingBalance(
      transaction,
      input.tenantId,
      input.item.id,
      input.warehouseId,
      input.trackingKey,
    );
    if (balance) {
      await this.lockBalances(transaction, input.tenantId, [balance.id]);
      balance = await this.requireBalance(
        transaction,
        input.tenantId,
        balance.id,
      );
    }
    if (
      balance &&
      (balance.lotNumber !== input.lotNumber ||
        balance.serialNumber !== input.serialNumber ||
        balance.expiresAt?.getTime() !== input.expiresAt?.getTime())
    ) {
      throw new ConflictException(
        'El saldo existente tiene metadatos de lote, serial o vencimiento distintos',
      );
    }
    const before = balance?.quantity ?? 0;
    const after = before + input.delta;
    if (after < 0) {
      throw new ConflictException({
        code: 'INVENTORY_NEGATIVE_STOCK_BLOCKED',
        message: 'La operacion produciria existencias negativas',
        balanceId: balance?.id ?? null,
        available: before,
        requested: Math.abs(input.delta),
      });
    }
    if (input.item.trackingMode === InventoryTrackingMode.SERIAL && after > 1) {
      throw new ConflictException(
        'Un serial no puede representar mas de una unidad activa',
      );
    }
    if (!balance && input.delta < 0) {
      throw new ConflictException('No existe saldo para descontar');
    }

    let balanceId: string;
    if (!balance) {
      const created = await transaction.inventoryStockBalance.create({
        data: {
          tenantId: input.tenantId,
          itemId: input.item.id,
          warehouseId: input.warehouseId,
          trackingKey: input.trackingKey,
          lotNumber: input.lotNumber,
          serialNumber: input.serialNumber,
          expiresAt: input.expiresAt,
          condition: input.condition,
          quantity: after,
          responsibleUserId: input.responsibleUserId,
        },
        select: { id: true },
      });
      balanceId = created.id;
    } else {
      let condition = balance.condition;
      if (condition !== input.condition) {
        if (
          input.condition === InventoryStockCondition.EXPIRED &&
          input.expiresAt &&
          input.expiresAt.getTime() <= input.occurredAt.getTime()
        ) {
          condition = InventoryStockCondition.EXPIRED;
        } else {
          throw new ConflictException(
            'No se pueden mezclar condiciones de inventario en el mismo lote o serial',
          );
        }
      }
      const updated = await transaction.inventoryStockBalance.update({
        where: {
          id_tenantId: { id: balance.id, tenantId: input.tenantId },
        },
        data: {
          quantity: { increment: input.delta },
          condition,
          responsibleUserId: input.responsibleUserId,
        },
        select: { id: true },
      });
      balanceId = updated.id;
    }

    await transaction.inventoryMovement.create({
      data: {
        tenantId: input.tenantId,
        itemId: input.item.id,
        userId: input.actorUserId,
        quantity: Math.abs(input.delta),
        type: input.movementType,
        reason: input.reason,
        recordOrigin: InventoryRecordOrigin.API,
        commandId: input.commandId,
        warehouseId: input.warehouseId,
        stockBalanceId: balanceId,
        transferId: input.transferId ?? null,
        transferLineId: input.transferLineId ?? null,
        delta: input.delta,
        balanceBefore: before,
        balanceAfter: after,
        occurredAt: input.occurredAt,
        custodyFromUserId: input.custodyFromUserId ?? null,
        custodyToUserId: input.custodyToUserId ?? null,
      },
    });
    return this.requireBalance(transaction, input.tenantId, balanceId);
  }

  private resolveTracking(
    item: SelectedItem,
    quantity: number,
    rawLotNumber: string | undefined,
    rawSerialNumber: string | undefined,
    rawExpiresAt: string | undefined,
  ) {
    const lotNumber = rawLotNumber?.trim().toUpperCase() || null;
    const serialNumber = rawSerialNumber?.trim().toUpperCase() || null;
    const expiresAt = rawExpiresAt
      ? this.parseDate(rawExpiresAt, 'expiresAt')
      : null;
    const mode = item.trackingMode;
    if (mode === null || mode === InventoryTrackingMode.NONE) {
      if (lotNumber || serialNumber || expiresAt) {
        throw new BadRequestException(
          mode === null
            ? 'Un articulo heredado no puede reclamar trazabilidad de lote, serial o vencimiento'
            : 'Un articulo sin trazabilidad no admite lote, serial ni vencimiento',
        );
      }
      return {
        trackingKey: 'UNTRACKED',
        lotNumber: null,
        serialNumber: null,
        expiresAt: null,
      };
    }
    if (mode === InventoryTrackingMode.LOT) {
      if (!lotNumber || serialNumber) {
        throw new BadRequestException(
          'Un articulo por lote exige lotNumber y no admite serialNumber',
        );
      }
      return {
        trackingKey: `LOT:${lotNumber}`,
        lotNumber,
        serialNumber: null,
        expiresAt,
      };
    }
    if (!serialNumber || lotNumber || quantity !== 1) {
      throw new BadRequestException(
        'Un articulo serializado exige un unico serialNumber y cantidad 1',
      );
    }
    return {
      trackingKey: `SERIAL:${serialNumber}`,
      lotNumber: null,
      serialNumber,
      expiresAt,
    };
  }

  private async createSystemIncident(
    transaction: Prisma.TransactionClient,
    input: {
      tenantId: string;
      commandId: string;
      transferId: string;
      transferLineId: string;
      type: InventoryIncidentType;
      quantity: number;
      description: string;
      actorUserId: string;
      occurredAt: Date;
    },
  ): Promise<void> {
    await transaction.inventoryIncident.create({
      data: {
        tenantId: input.tenantId,
        commandId: input.commandId,
        transferId: input.transferId,
        transferLineId: input.transferLineId,
        type: input.type,
        quantity: input.quantity,
        description: input.description,
        reportedById: input.actorUserId,
        occurredAt: input.occurredAt,
      },
    });
  }

  private assertFieldCustodian(
    actor: InventoryActor,
    custodianUserId: string,
  ): void {
    if (actor.role === Role.ZONE_COORDINATOR && actor.id !== custodianUserId) {
      throw new ForbiddenException(
        'Una coordinacion zonal solo puede confirmar custodias que le fueron asignadas',
      );
    }
  }

  private assertTransferVersion(actual: Date, expected: string): void {
    const expectedDate = this.parseDate(expected, 'expectedTransferUpdatedAt');
    if (actual.getTime() !== expectedDate.getTime()) {
      throw new ConflictException({
        code: 'INVENTORY_TRANSFER_CHANGED',
        message:
          'El despacho cambio desde que fue consultado; recargue antes de confirmar',
      });
    }
  }

  private assertOccurrenceAfterDispatch(
    occurredAt: Date,
    dispatchedAt: Date,
  ): void {
    if (occurredAt.getTime() < dispatchedAt.getTime()) {
      throw new BadRequestException(
        'El evento de custodia no puede ocurrir antes del despacho',
      );
    }
  }

  private assertTransferLines<T extends { lineId: string }>(
    lines: T[],
    validate: (line: T) => void,
  ): void {
    if (!Array.isArray(lines) || lines.length < 1 || lines.length > 50) {
      throw new BadRequestException('El comando admite entre 1 y 50 lineas');
    }
    const ids = lines.map((line) => line.lineId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        'Una linea no puede repetirse en el comando',
      );
    }
    for (const line of lines) {
      this.assertSafeId(line.lineId, 'lineId');
      validate(line);
    }
  }

  private assertEvidencePair(
    evidenceReference: string | undefined,
    evidenceSha256: string | undefined,
  ): void {
    if (Boolean(evidenceReference) !== Boolean(evidenceSha256)) {
      throw new BadRequestException(
        'La evidencia exige referencia HTTPS y SHA-256 juntos',
      );
    }
    if (!evidenceReference || !evidenceSha256) return;
    if (!SHA256_PATTERN.test(evidenceSha256)) {
      throw new BadRequestException('evidenceSha256 no es valido');
    }
    try {
      const url = new URL(evidenceReference);
      if (
        url.protocol !== 'https:' ||
        !url.hostname ||
        url.username ||
        url.password ||
        /\s/u.test(evidenceReference) ||
        evidenceReference.length > HTTPS_REFERENCE_MAX_LENGTH
      ) {
        throw new Error('unsafe');
      }
    } catch {
      throw new BadRequestException(
        'La evidencia debe ser una referencia HTTPS durable, sin credenciales',
      );
    }
  }

  private parseOccurrence(value: string): Date {
    const occurredAt = this.parseDate(value, 'occurredAt');
    const now = Date.now();
    if (occurredAt.getTime() > now + MAX_FUTURE_CLOCK_SKEW_MS) {
      throw new BadRequestException(
        'occurredAt excede el margen permitido del reloj del servidor',
      );
    }
    if (occurredAt.getTime() < now - MAX_HISTORICAL_OCCURRENCE_MS) {
      throw new BadRequestException(
        'occurredAt es demasiado antiguo para una captura operativa',
      );
    }
    return occurredAt;
  }

  private parseDate(value: string, field: string): Date {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      throw new BadRequestException(`${field} no contiene una fecha valida`);
    }
    return date;
  }

  private assertSafeId(value: string, field: string): void {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
      throw new BadRequestException(`${field} no es un identificador valido`);
    }
  }

  private assertText(
    value: string,
    minimum: number,
    maximum: number,
    field: string,
  ): void {
    const length = value?.trim().length ?? 0;
    if (length < minimum || length > maximum) {
      throw new BadRequestException(
        `${field} debe tener entre ${minimum} y ${maximum} caracteres`,
      );
    }
  }

  private assertPositiveInteger(value: number, field: string): void {
    if (!Number.isInteger(value) || value < 1 || value > 1_000_000) {
      throw new BadRequestException(
        `${field} debe ser un entero entre 1 y 1000000`,
      );
    }
  }

  private assertNonNegativeInteger(value: number, field: string): void {
    if (!Number.isInteger(value) || value < 0 || value > 1_000_000) {
      throw new BadRequestException(
        `${field} debe ser un entero entre 0 y 1000000`,
      );
    }
  }

  private requireResourceId(command: SelectedCommand): string {
    if (!command.resourceId) {
      throw new ConflictException(
        'El recibo idempotente no conserva un recurso recuperable',
      );
    }
    return command.resourceId;
  }

  private readStringArray(value: Prisma.JsonValue, key: string): string[] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new ConflictException('El recibo idempotente esta incompleto');
    }
    const nested = value[key];
    if (
      !Array.isArray(nested) ||
      !nested.every((item) => typeof item === 'string')
    ) {
      throw new ConflictException('El recibo idempotente esta incompleto');
    }
    return nested;
  }

  private readJsonInteger(value: Prisma.JsonValue, key: string): number {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new ConflictException('El recibo idempotente esta incompleto');
    }
    const nested = value[key];
    if (typeof nested !== 'number' || !Number.isInteger(nested)) {
      throw new ConflictException('El recibo idempotente esta incompleto');
    }
    return nested;
  }
}
