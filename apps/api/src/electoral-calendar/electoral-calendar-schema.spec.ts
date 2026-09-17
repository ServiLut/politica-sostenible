import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('versioned electoral calendar database invariants', () => {
  const schema = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(
    resolve(
      'prisma/migrations/20260909270000_electoral_calendar_releases/migration.sql',
    ),
    'utf8',
  );
  const service = readFileSync(
    resolve('src/electoral-calendar/electoral-calendar.service.ts'),
    'utf8',
  );
  const profileService = readFileSync(
    resolve('src/operation-profile/operation-profile.service.ts'),
    'utf8',
  );
  const commandCenter = readFileSync(
    resolve('src/command-center/command-center.service.ts'),
    'utf8',
  );

  function model(name: string) {
    const block = schema.match(
      new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`),
    )?.[0];
    if (!block) throw new Error(`Modelo ausente: ${name}`);
    return block;
  }

  it.each([
    'ElectoralCalendarRelease',
    'ElectoralCalendarMilestone',
    'ElectoralCalendarReleaseDecision',
    'ElectoralCalendarMilestoneResult',
    'ElectoralCalendarResultReview',
    'ElectoralCalendarCommand',
  ])('%s has tenant-scoped identity and composite relations', (name) => {
    const block = model(name);
    expect(block).toContain('tenantId');
    expect(block).toMatch(/@@unique\(\[id, tenantId\]/u);
    for (const relation of block
      .split('\n')
      .filter(
        (line) => line.includes('@relation(') && line.includes('fields:'),
      )) {
      if (/^\s*tenant\s/u.test(relation)) continue;
      expect(relation).toContain('tenantId]');
      expect(relation).toContain('references: [id, tenantId]');
    }
  });

  it('enforces version lifecycle, one active round and immutable history', () => {
    expect(migration).toContain(
      'ElectoralCalendarRelease_one_active_round_key',
    );
    expect(migration).toContain('WHERE "status" = \'ACTIVE\'');
    expect(migration).toContain('STAGED');
    expect(migration).toContain('VALIDATED');
    expect(migration).toContain('SUPERSEDED');
    expect(migration).toContain('calendar release contents are immutable');
    expect(migration).toContain('ENABLE ALWAYS TRIGGER');
    expect(migration).toContain('BEFORE TRUNCATE');
  });

  it('physically enforces external accountability, evidence and four eyes', () => {
    expect(migration).toContain('ElectoralCalendarMilestone_owner_check');
    expect(migration).toContain('ElectoralCalendarResult_evidence_shape_check');
    expect(migration).toContain(
      'object_row."module" <> \'ELECTORAL_CALENDAR\'',
    );
    expect(migration).toContain(
      'release_row."createdById" = NEW."actorUserId"',
    );
    expect(migration).toContain(
      'result_row."recordedById" = NEW."reviewedById"',
    );
  });

  it('uses canonical idempotency, Serializable locks and CLOSED revalidation', () => {
    expect(model('ElectoralCalendarCommand')).toContain(
      '@@unique([tenantId, clientRequestId]',
    );
    expect(service).toContain('Prisma.TransactionIsolationLevel.Serializable');
    expect(service).toContain('pg_advisory_xact_lock');
    expect(service).toContain('FOR UPDATE');
    expect(service).toContain(
      'context.profile.stage === PoliticalOperationStage.CLOSED',
    );
    expect(service).toContain('expectedVersion');
  });

  it('makes diff and configured-only stage gates real consumers', () => {
    expect(service).toContain('releaseDiff(');
    expect(service).toContain('added,');
    expect(service).toContain('removed,');
    expect(service).toContain('moved,');
    expect(profileService).toContain('assertConfiguredCalendarStageGates');
    expect(profileService).toContain('stageGateRequired: true');
    expect(commandCenter).toContain('getCommandCenterSummary');
    expect(commandCenter).toContain('ELECTORAL_CALENDAR_OVERDUE');
  });

  it('is the only atomic additive 270 migration', () => {
    expect(migration.trimStart()).toMatch(/^BEGIN;/u);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/u);
    expect(migration).not.toMatch(
      /DROP TABLE|DROP TYPE|DELETE FROM|ON DELETE CASCADE/iu,
    );
  });
});
