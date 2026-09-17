import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('offline incident migration 300', () => {
  const schema = readFileSync(
    join(process.cwd(), 'prisma/schema.prisma'),
    'utf8',
  );
  const migration = readFileSync(
    join(
      process.cwd(),
      'prisma/migrations/20260909300000_offline_incident_reports/migration.sql',
    ),
    'utf8',
  );

  it('es atómica y extiende el enum existente sin recrearlo', () => {
    expect(migration.trimStart()).toMatch(/(?:^|\n)BEGIN;/);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/);
    expect(migration).toMatch(
      /ALTER TYPE "OfflineSyncOperationType" ADD VALUE 'INCIDENT_REPORT'/,
    );
    expect(migration).not.toMatch(/CREATE TYPE "OfflineSyncOperationType"/);
    expect(schema).toMatch(
      /enum OfflineSyncOperationType\s*{[\s\S]*INCIDENT_REPORT[\s\S]*}/,
    );
  });

  it('conserva SHA canónico, fecha civil e inmutabilidad física del recibo', () => {
    expect(schema).toContain('payloadSha256     String?');
    expect(schema).toContain('occurredOn             DateTime?');
    expect(migration).toContain('OfflineSyncReceipt_payload_sha256_check');
    expect(migration).toContain('OfflineSyncReceipt_no_update');
    expect(migration).toContain('OfflineSyncReceipt_no_delete');
    expect(migration).toContain('OfflineSyncReceipt_no_truncate');
    expect(migration).toContain('ENABLE ALWAYS TRIGGER');
  });
});
