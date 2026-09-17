import { BadRequestException } from '@nestjs/common';
import {
  InventoryCommandType,
  InventoryRecordOrigin,
  PoliticalOperationMode,
  PoliticalOperationStage,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateInventoryWarehouseDto } from './dto/inventory-operations.dto';
import { computeInventoryCommandSha256 } from './inventory-operations.hash';
import { InventoryOperationsService } from './inventory-operations.service';

const user: AuthenticatedUser = {
  tenantId: 'tenant-a',
  userId: 'admin-a',
  role: Role.ADMIN,
};

function warehouseDto(): CreateInventoryWarehouseDto {
  const input = {
    clientRequestId: '11111111-1111-4111-8111-111111111111',
    code: 'CENTRAL',
    name: 'Bodega central verificable',
    address: 'Carrera 1 # 2-03',
    responsibleUserId: 'operator-a',
  };
  return {
    ...input,
    payloadSha256: computeInventoryCommandSha256('WAREHOUSE_CREATE', input),
  };
}

function transactionFixture(options?: {
  stage?: PoliticalOperationStage;
  existingCommand?: Record<string, unknown> | null;
}) {
  const warehouse = {
    id: 'warehouse-a',
    code: 'CENTRAL',
    name: 'Bodega central verificable',
    address: 'Carrera 1 # 2-03',
    isActive: true,
    recordOrigin: InventoryRecordOrigin.API,
    responsibleUser: {
      id: 'operator-a',
      name: 'Operador Uno',
      role: Role.ZONE_COORDINATOR,
    },
    createdAt: new Date('2026-09-09T10:00:00.000Z'),
    updatedAt: new Date('2026-09-09T10:00:00.000Z'),
  };
  const queryRaw = jest
    .fn()
    .mockResolvedValueOnce([{ id: 'admin-a', role: Role.ADMIN }])
    .mockResolvedValue([]);
  const transaction = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        defaultMode: PoliticalOperationMode.CAMPAIGN,
        type: TenantType.CANDIDACY,
      }),
    },
    $queryRaw: queryRaw,
    operationProfile: {
      findUnique: jest.fn().mockResolvedValue({
        stage: options?.stage ?? PoliticalOperationStage.ELECTION_PREPARATION,
      }),
    },
    inventoryCommand: {
      findUnique: jest.fn().mockResolvedValue(options?.existingCommand ?? null),
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
          ...data,
          createdAt: new Date('2026-09-09T10:00:00.000Z'),
        })),
    },
    inventoryWarehouse: {
      findUnique: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValue(warehouse),
      create: jest.fn().mockResolvedValue(warehouse),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
  };
  const prisma = {
    $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  } as unknown as PrismaService;
  return { service: new InventoryOperationsService(prisma), transaction };
}

describe('InventoryOperationsService security boundaries', () => {
  it('rejects payload tampering before touching PostgreSQL', async () => {
    const transaction = jest.fn();
    const service = new InventoryOperationsService({
      $transaction: transaction,
    } as unknown as PrismaService);
    await expect(
      service.createWarehouse(user, {
        ...warehouseDto(),
        name: 'Contenido cambiado después de calcular el hash',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('blocks writes after CLOSED inside the serializable transaction', async () => {
    const { service, transaction } = transactionFixture({
      stage: PoliticalOperationStage.CLOSED,
    });
    await expect(
      service.createWarehouse(user, warehouseDto()),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVENTORY_STAGE_BLOCKED' }),
    });
    expect(transaction.inventoryWarehouse.create).not.toHaveBeenCalled();
  });

  it('replays the exact same actor/type/hash without creating a second command', async () => {
    const dto = warehouseDto();
    const existing = {
      id: 'command-a',
      clientRequestId: dto.clientRequestId,
      payloadSha256: dto.payloadSha256,
      type: InventoryCommandType.WAREHOUSE_CREATE,
      actorUserId: user.userId,
      resourceType: 'InventoryWarehouse',
      resourceId: 'warehouse-a',
      resultSummary: { warehouseId: 'warehouse-a' },
      createdAt: new Date('2026-09-09T10:00:00.000Z'),
    };
    const { service, transaction } = transactionFixture({
      existingCommand: existing,
    });
    transaction.inventoryWarehouse.findUnique.mockReset();
    transaction.inventoryWarehouse.findUnique.mockResolvedValue({
      id: 'warehouse-a',
      code: 'CENTRAL',
      name: 'Bodega central verificable',
      address: null,
      isActive: true,
      recordOrigin: InventoryRecordOrigin.API,
      responsibleUser: null,
      createdAt: new Date('2026-09-09T10:00:00.000Z'),
      updatedAt: new Date('2026-09-09T10:00:00.000Z'),
    });
    await expect(service.createWarehouse(user, dto)).resolves.toMatchObject({
      noOp: true,
      command: { id: 'command-a' },
      warehouse: { id: 'warehouse-a' },
    });
    expect(transaction.inventoryCommand.create).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('rejects reuse by a different actor even when the payload hash matches', async () => {
    const dto = warehouseDto();
    const { service } = transactionFixture({
      existingCommand: {
        id: 'command-a',
        clientRequestId: dto.clientRequestId,
        payloadSha256: dto.payloadSha256,
        type: InventoryCommandType.WAREHOUSE_CREATE,
        actorUserId: 'admin-b',
        resourceType: 'InventoryWarehouse',
        resourceId: 'warehouse-a',
        resultSummary: {},
        createdAt: new Date(),
      },
    });
    await expect(service.createWarehouse(user, dto)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'INVENTORY_IDEMPOTENCY_CONFLICT',
      }),
    });
  });

  it('rejects ambiguous dispatch destinations before opening a transaction', async () => {
    const transaction = jest.fn();
    const service = new InventoryOperationsService({
      $transaction: transaction,
    } as unknown as PrismaService);
    const input = {
      clientRequestId: '22222222-2222-4222-8222-222222222222',
      code: 'KIT-001',
      sourceWarehouseId: 'warehouse-a',
      destinationWarehouseId: 'warehouse-b',
      destinationDivisionId: 'place-a',
      destinationLabel: 'Destino ambiguo',
      custodianUserId: 'operator-a',
      purpose: 'Entrega controlada de material electoral completo.',
      custodyDeclaration:
        'Declaro recibir la custodia física de los elementos relacionados.',
      occurredAt: new Date().toISOString(),
      lines: [{ stockBalanceId: 'balance-a', quantity: 1 }],
    };
    await expect(
      service.dispatch(user, {
        ...input,
        payloadSha256: computeInventoryCommandSha256('DISPATCH', input),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('requires an HTTPS evidence reference and SHA-256 as an inseparable pair', async () => {
    const service = new InventoryOperationsService({} as PrismaService);
    const input = {
      clientRequestId: '33333333-3333-4333-8333-333333333333',
      expectedTransferUpdatedAt: '2026-09-09T10:00:00.000Z',
      type: 'CUSTODY_BREACH' as const,
      description:
        'El precinto llegó abierto y se preservó el material sin manipular.',
      evidenceReference: 'http://insecure.example.test/evidence',
      evidenceSha256: 'a'.repeat(64),
      occurredAt: new Date().toISOString(),
    };
    await expect(
      service.reportIncident(user, 'transfer-a', {
        ...input,
        payloadSha256: computeInventoryCommandSha256('INCIDENT_REPORT', input),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
