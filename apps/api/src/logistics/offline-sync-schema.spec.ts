import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('offline synchronization database invariants', () => {
  const schema = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(
    resolve(
      'prisma/migrations/20260909120000_offline_sync_receipts/migration.sql',
    ),
    'utf8',
  );

  it('stores one payload-free receipt per tenant operation UUID', () => {
    expect(schema).toContain('model OfflineSyncReceipt');
    expect(schema).toContain('clientOperationId String');
    expect(schema).toContain('payloadHmac');
    expect(schema).toContain('@@unique([tenantId, clientOperationId])');
    expect(schema).not.toMatch(/OfflineSyncReceipt[\s\S]*?payload\s+Json/);
  });

  it('enforces tenant and actor ownership in PostgreSQL', () => {
    expect(migration).toContain('"clientOperationId" UUID NOT NULL');
    expect(migration).toContain(
      '"OfflineSyncReceipt_tenantId_clientOperationId_key"',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("actorUserId", "tenantId") REFERENCES "User"("id", "tenantId")',
    );
  });

  it('labels capture, receipt and synchronization-network evidence separately', () => {
    expect(schema).toContain('capturedAt        DateTime?');
    expect(schema).toContain('receivedAt        DateTime?');
    expect(schema).toContain('syncSourceIpHash  String?');
    expect(migration).toContain('"syncSourceIpHash" TEXT');
  });
});
