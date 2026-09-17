import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const apiRoot = join(__dirname, '../..');
const schema = readFileSync(join(apiRoot, 'prisma/schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    apiRoot,
    'prisma/migrations/20260909220000_witness_assignments/migration.sql',
  ),
  'utf8',
);
const readinessService = readFileSync(
  join(apiRoot, 'src/operation-profile/operation-profile.service.ts'),
  'utf8',
);

describe('witness assignment persistence contract', () => {
  it('is tenant-scoped, versioned and linked through composite foreign keys', () => {
    const model = schema.match(/model WitnessAssignment \{[\s\S]*?\n\}/)?.[0];
    expect(model).toBeDefined();
    expect(model).toContain('tenantId');
    expect(model).toContain('operationProfileId');
    expect(model).toContain('coverageWindowId');
    expect(model).toContain('clientRequestId');
    expect(model).toContain('payloadSha256');
    expect(model).toContain('tableStart');
    expect(model).toContain('tableEnd');
    expect(model).toContain('version');
    expect(model).toContain('@@unique([id, tenantId])');
    expect(model).toContain('@@unique([tenantId, clientRequestId]');
    expect(model).toContain(
      'fields: [witnessId, tenantId], references: [id, tenantId]',
    );
    expect(model).toContain(
      'fields: [puestoId, tenantId], references: [id, tenantId]',
    );
  });

  it('requires an explicit tenant-scoped local operating window', () => {
    const model = schema.match(
      /model WitnessCoverageWindow \{[\s\S]*?\n\}/,
    )?.[0];
    expect(model).toContain('tenantId');
    expect(model).toContain('localDate');
    expect(model).toContain('startsAt');
    expect(model).toContain('endsAt');
    expect(model).toContain('timeZone');
    expect(model).toContain('utcOffsetMinutes');
    expect(migration.trimStart()).toMatch(/^BEGIN;/);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/);
    expect(migration).toContain('WitnessCoverageWindow_scope_guard');
    expect(migration).toContain(
      'WitnessCoverageWindow with active assignments is immutable',
    );
    expect(migration).toContain(
      'WitnessAssignment shift must fit its declared coverage window',
    );
  });

  it('enforces exact range overlap and double-booking in PostgreSQL', () => {
    expect(migration).toContain('CREATE EXTENSION IF NOT EXISTS btree_gist');
    expect(migration).toContain(
      'CONSTRAINT "WitnessAssignment_no_duplicate_table_shift"',
    );
    expect(migration).toContain(
      'CONSTRAINT "WitnessAssignment_no_witness_double_booking"',
    );
    expect(migration).toContain(
      'int4range("tableStart", "tableEnd", \'[]\') WITH &&',
    );
    expect(migration).toContain(
      'tsrange("shiftStartsAt", "shiftEndsAt", \'[)\') WITH &&',
    );
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain(
      'WitnessAssignment requires an active WITNESS in the same tenant',
    );
  });

  it('keeps cancelled history immutable and validates optimistic versions', () => {
    expect(migration).toContain('WitnessAssignment_lifecycle_check');
    expect(migration).toContain('WitnessAssignment_lifecycle_guard');
    expect(migration).toContain('WitnessAssignment_delete_guard');
    expect(migration).toContain('NEW."version" <> OLD."version" + 1');
    expect(migration).toContain(
      'WitnessAssignment history is durable and cannot be deleted',
    );
    expect(migration).toContain('WitnessAssignment_truncate_guard');
    expect(migration).toContain('WitnessCoverageWindow_truncate_guard');
    expect(migration).toContain('WitnessCoverageWindowCommand_truncate_guard');
  });

  it('readiness queries exact assignments instead of User.divisionId ancestry', () => {
    const electionFence = readinessService.match(
      /private async assertElectionDayReadiness[\s\S]*?\n {2}}/,
    )?.[0];
    expect(electionFence).toBeDefined();
    expect(electionFence).toContain('transaction.witnessAssignment.findMany');
    expect(electionFence).toContain(
      'status: WitnessAssignmentStatus.CONFIRMED',
    );
    expect(electionFence).not.toContain('transaction.user.groupBy');
    expect(electionFence).not.toContain("by: ['divisionId']");
  });
});
