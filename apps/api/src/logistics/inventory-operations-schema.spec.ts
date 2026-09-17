import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('electoral inventory database and service invariants', () => {
  const schema = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(
    resolve(
      'prisma/migrations/20260909210000_logistics_inventory_operations/migration.sql',
    ),
    'utf8',
  );
  const service = readFileSync(
    resolve('src/logistics/inventory-operations.service.ts'),
    'utf8',
  );

  function model(name: string): string {
    const result = schema.match(
      new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`),
    )?.[0];
    if (!result) throw new Error(`Modelo ausente: ${name}`);
    return result;
  }

  it.each([
    'InventoryItem',
    'InventoryMovement',
    'InventoryWarehouse',
    'InventoryStockBalance',
    'InventoryCommand',
    'InventoryTransfer',
    'InventoryTransferLine',
    'InventoryCustodyEvent',
    'InventoryIncident',
  ])('%s is tenant-scoped with a composite identity', (name) => {
    expect(model(name)).toContain('tenantId');
    expect(model(name)).toContain('@@unique([id, tenantId])');
  });

  it('uses composite tenant foreign keys for every operational cross-reference', () => {
    for (const name of [
      'InventoryWarehouse',
      'InventoryStockBalance',
      'InventoryCommand',
      'InventoryTransfer',
      'InventoryTransferLine',
      'InventoryCustodyEvent',
      'InventoryIncident',
    ]) {
      const source = model(name);
      for (const line of source
        .split('\n')
        .filter(
          (entry) => entry.includes('@relation(') && entry.includes('fields:'),
        )) {
        if (/^\s*tenant\s/u.test(line)) continue;
        expect(line).toContain('tenantId]');
        expect(line).toContain('references: [id, tenantId]');
      }
    }
  });

  it('never treats legacy quantity or movements as verified custody', () => {
    expect(migration).toContain(`'LEGACY_UNCLASSIFIED'`);
    expect(migration).toContain('Bodega heredada sin custodia verificada');
    expect(migration).toContain(
      'Legacy inventory balances cannot claim verified lot or serial tracking',
    );
    expect(migration).toContain(
      'InventoryItem contains a negative legacy balance; migration cannot reinterpret it safely',
    );
    expect(model('InventoryItem')).toContain(
      'recordOrigin  InventoryRecordOrigin',
    );
    expect(model('InventoryItem')).not.toMatch(
      /recordOrigin\s+InventoryRecordOrigin\s+@default/u,
    );
  });

  it('enforces non-negative balances, serial uniqueness and canonical tracking in PostgreSQL', () => {
    expect(migration).toContain('InventoryStockBalance_quantity_check');
    expect(migration).toContain('InventoryStockBalance_active_serial_key');
    expect(migration).toContain('validate_inventory_stock_tracking');
    expect(migration).toContain(
      'Serialized inventory requires its canonical serial tracking key and quantity at most one',
    );
    expect(service).toContain('FOR UPDATE');
    expect(service).toContain('INVENTORY_NEGATIVE_STOCK_BLOCKED');
    expect(service).toContain('Prisma.TransactionIsolationLevel.Serializable');
  });

  it('keeps commands, movements, custody events and incidents append-only', () => {
    for (const table of [
      'InventoryMovement',
      'InventoryCommand',
      'InventoryCustodyEvent',
      'InventoryIncident',
    ]) {
      expect(migration).toContain(`${table}_prevent_update_delete`);
      expect(migration).toContain(`${table}_prevent_truncate`);
      expect(migration).toContain(
        `ALTER TABLE "${table}" ENABLE ALWAYS TRIGGER`,
      );
    }
  });

  it('binds idempotency and dispatch identities inside each tenant', () => {
    expect(model('InventoryCommand')).toContain(
      '@@unique([tenantId, clientRequestId])',
    );
    expect(model('InventoryTransfer')).toContain('@@unique([tenantId, code])');
    expect(model('InventoryTransfer')).toContain(
      '@@unique([commandId, tenantId])',
    );
    expect(service).toContain('INVENTORY_IDEMPOTENCY_CONFLICT');
    expect(service).toContain('actorUserId !== actorUserId');
  });

  it('fences every mutation against ordinary or exceptional closure inside the transaction', () => {
    expect(service).toContain('operation-profile-lifecycle:${tenantId}');
    expect(service).toContain(
      'FROM "OperationProfile" WHERE "tenantId" = ${tenantId} FOR UPDATE',
    );
    expect(service).toContain(
      'profile.stage === PoliticalOperationStage.CLOSED',
    );
  });

  it('uses only known polling-place identity and does not invent geography', () => {
    expect(model('InventoryTransfer')).toContain('destinationDivisionId');
    expect(service).toContain('division.type !== DivisionType.PUESTO');
    expect(service).toContain('division.expectedTables');
    expect(model('InventoryTransfer')).not.toMatch(
      /latitude|longitude|commune/iu,
    );
  });

  it('is additive and preserves all pre-existing inventory rows', () => {
    expect(migration.trimStart()).toMatch(/^--[\s\S]*?\nBEGIN;\n/u);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/u);
    expect(migration).not.toMatch(
      /DROP TABLE|DROP TYPE|DELETE FROM|TRUNCATE TABLE/iu,
    );
    expect(migration).not.toMatch(/ON DELETE CASCADE/iu);
    expect(migration).toContain('INSERT INTO "InventoryStockBalance"');
    expect(migration).toContain('item."quantity"');
  });
});
