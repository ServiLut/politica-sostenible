import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  DispatchInventoryDto,
  ImportInventoryItemsDto,
  ReceiveInventoryStockDto,
  ReportInventoryIncidentDto,
} from './inventory-operations.dto';

const identity = {
  clientRequestId: '11111111-1111-4111-8111-111111111111',
  payloadSha256: 'a'.repeat(64),
};

describe('inventory operation DTO validation', () => {
  it('normalizes safe JSON imports and validates nested rows', async () => {
    const dto = plainToInstance(ImportInventoryItemsDto, {
      ...identity,
      items: [
        {
          sku: ' kit.e14-01 ',
          name: ' Kit de mesa ',
          unit: ' unidad ',
          trackingMode: 'lot',
          minimumStock: 2,
        },
      ],
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.items[0]).toMatchObject({
      sku: 'KIT.E14-01',
      name: 'Kit de mesa',
      unit: 'UNIDAD',
      trackingMode: 'LOT',
    });

    const invalid = plainToInstance(ImportInventoryItemsDto, {
      ...identity,
      items: [{ sku: '../escape', name: 'x', minimumStock: -1 }],
    });
    const errors = await validate(invalid);
    expect(errors.some(({ property }) => property === 'items')).toBe(true);
  });

  it('limits dispatch size and requires valid positive quantities', async () => {
    const dto = plainToInstance(DispatchInventoryDto, {
      ...identity,
      code: ' despacho-01 ',
      sourceWarehouseId: 'warehouse-a',
      destinationDivisionId: 'place-a',
      destinationLabel: 'Puesto 001',
      destinationTableNumber: 1,
      custodianUserId: 'operator-a',
      purpose: 'Entrega de kit completo para la mesa electoral.',
      custodyDeclaration:
        'Declaro recibir físicamente los elementos relacionados.',
      occurredAt: '2026-09-09T10:00:00.000Z',
      lines: [{ stockBalanceId: 'balance-a', quantity: 0 }],
    });
    const errors = await validate(dto);
    expect(dto.code).toBe('DESPACHO-01');
    expect(errors.some(({ property }) => property === 'lines')).toBe(true);
  });

  it('does not accept malformed dates, identifiers or hashes', async () => {
    const stock = plainToInstance(ReceiveInventoryStockDto, {
      ...identity,
      payloadSha256: 'A'.repeat(64),
      warehouseId: '../tenant-b',
      itemId: 'item-a',
      quantity: 1,
      reason: 'Recepcion física documentada',
      custodyDeclaration:
        'Declaro haber contado y recibido físicamente los elementos.',
      occurredAt: 'not-a-date',
    });
    const properties = (await validate(stock)).map(({ property }) => property);
    expect(properties).toEqual(
      expect.arrayContaining(['warehouseId', 'occurredAt']),
    );
  });

  it('caps incident text and validates evidence hashes when supplied', async () => {
    const incident = plainToInstance(ReportInventoryIncidentDto, {
      ...identity,
      expectedTransferUpdatedAt: '2026-09-09T10:00:00.000Z',
      type: 'DAMAGED',
      quantity: 2,
      description: 'Dos unidades presentan sellos rotos al recibir el kit.',
      evidenceReference: 'https://evidence.example.test/incidents/one',
      evidenceSha256: 'B'.repeat(64),
      occurredAt: '2026-09-09T11:00:00.000Z',
    });
    await expect(validate(incident)).resolves.toHaveLength(0);
    expect(incident.evidenceSha256).toBe('b'.repeat(64));
  });
});
