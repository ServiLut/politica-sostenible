import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  BlockWhenOperationClosed,
  RequireOperationStages,
} from '../auth/decorators/operation-stage-policy.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  CreateInventoryWarehouseDto,
  DispatchInventoryDto,
  ImportInventoryItemsDto,
  InventoryEntityIdParamsDto,
  InventoryOverviewQueryDto,
  ReceiveInventoryStockDto,
  ReceiveInventoryTransferDto,
  ReconcileInventoryTransferDto,
  ReportInventoryIncidentDto,
  ReturnInventoryTransferDto,
} from './dto/inventory-operations.dto';
import {
  INVENTORY_ADMIN_ROLES,
  INVENTORY_DISPATCH_STAGES,
  INVENTORY_FIELD_ROLES,
  INVENTORY_INCIDENT_STAGES,
  INVENTORY_READ_ROLES,
  INVENTORY_RECONCILE_STAGES,
  INVENTORY_RETURN_STAGES,
  INVENTORY_SETUP_STAGES,
  INVENTORY_STOCK_RECEIVE_STAGES,
  INVENTORY_TRANSFER_RECEIVE_STAGES,
  InventoryOperationsService,
} from './inventory-operations.service';

@ApiTags('Electoral inventory logistics')
@ApiBearerAuth()
@BlockWhenOperationClosed()
@Controller('inventory-logistics')
export class InventoryLogisticsController {
  constructor(private readonly inventory: InventoryOperationsService) {}

  @Get()
  @Roles(...INVENTORY_READ_ROLES)
  @ApiOperation({ summary: 'Consulta inventario, custodias e incidencias' })
  getOverview(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: InventoryOverviewQueryDto,
  ) {
    return this.inventory.getOverview(user, query);
  }

  @Get('transfers/:id')
  @Roles(...INVENTORY_READ_ROLES)
  @ApiOperation({ summary: 'Consulta la trazabilidad completa de un despacho' })
  getTransfer(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: InventoryEntityIdParamsDto,
  ) {
    return this.inventory.getTransfer(user, params.id);
  }

  @Post('warehouses')
  @Roles(...INVENTORY_ADMIN_ROLES)
  @RequireOperationStages(...INVENTORY_SETUP_STAGES)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Crea una bodega tenant-scoped' })
  createWarehouse(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInventoryWarehouseDto,
  ) {
    return this.inventory.createWarehouse(user, dto);
  }

  @Post('items/import')
  @Roles(...INVENTORY_ADMIN_ROLES)
  @RequireOperationStages(...INVENTORY_SETUP_STAGES)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Importa hasta 100 articulos como JSON validado, sin binarios',
  })
  importItems(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ImportInventoryItemsDto,
  ) {
    return this.inventory.importItems(user, dto);
  }

  @Post('stock/receive')
  @Roles(...INVENTORY_ADMIN_ROLES)
  @RequireOperationStages(...INVENTORY_STOCK_RECEIVE_STAGES)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Registra una recepcion inicial de existencias' })
  receiveStock(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReceiveInventoryStockDto,
  ) {
    return this.inventory.receiveStock(user, dto);
  }

  @Post('dispatches')
  @Roles(...INVENTORY_ADMIN_ROLES)
  @RequireOperationStages(...INVENTORY_DISPATCH_STAGES)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Despacha existencias y abre cadena de custodia' })
  dispatch(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DispatchInventoryDto,
  ) {
    return this.inventory.dispatch(user, dto);
  }

  @Post('dispatches/:id/receive')
  @Roles(...INVENTORY_FIELD_ROLES)
  @RequireOperationStages(...INVENTORY_TRANSFER_RECEIVE_STAGES)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Confirma recepcion y faltantes en destino' })
  receiveTransfer(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: InventoryEntityIdParamsDto,
    @Body() dto: ReceiveInventoryTransferDto,
  ) {
    return this.inventory.receiveTransfer(user, params.id, dto);
  }

  @Post('dispatches/:id/return')
  @Roles(...INVENTORY_FIELD_ROLES)
  @RequireOperationStages(...INVENTORY_RETURN_STAGES)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Registra devolucion fisica a la bodega de origen' })
  returnTransfer(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: InventoryEntityIdParamsDto,
    @Body() dto: ReturnInventoryTransferDto,
  ) {
    return this.inventory.returnTransfer(user, params.id, dto);
  }

  @Post('dispatches/:id/reconcile')
  @Roles(...INVENTORY_ADMIN_ROLES)
  @RequireOperationStages(...INVENTORY_RECONCILE_STAGES)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Concilia definitivamente todas las lineas' })
  reconcileTransfer(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: InventoryEntityIdParamsDto,
    @Body() dto: ReconcileInventoryTransferDto,
  ) {
    return this.inventory.reconcileTransfer(user, params.id, dto);
  }

  @Post('dispatches/:id/incidents')
  @Roles(...INVENTORY_FIELD_ROLES)
  @RequireOperationStages(...INVENTORY_INCIDENT_STAGES)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Agrega una incidencia append-only al expediente' })
  reportIncident(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: InventoryEntityIdParamsDto,
    @Body() dto: ReportInventoryIncidentDto,
  ) {
    return this.inventory.reportIncident(user, params.id, dto);
  }
}
