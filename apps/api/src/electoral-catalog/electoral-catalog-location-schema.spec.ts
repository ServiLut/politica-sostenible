import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('electoral catalog location fidelity database invariants', () => {
  const schema = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(
    resolve(
      'prisma/migrations/20260909230000_electoral_catalog_location_fidelity/migration.sql',
    ),
    'utf8',
  );
  const model = (name: string) =>
    schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0];

  it('stores tenant-scoped source identity, logical day and geographic projection', () => {
    const entry = model('ElectoralCatalogEntry');
    const division = model('PoliticalDivision');
    const release = model('ElectoralCatalogRelease');

    for (const field of ['sourceLocationCode', 'votingDate', 'timeZone']) {
      expect(entry).toContain(field);
      expect(division).toContain(field);
    }
    for (const field of ['address', 'commune', 'latitude', 'longitude']) {
      expect(division).toContain(field);
    }
    expect(release).toContain('physicalPollingPlaceCount');
    expect(migration).toContain(
      'PoliticalDivision_validate_catalog_location_projection',
    );
    expect(migration).toMatch(
      /NEW\."sourceLocationCode"[\s\S]*NEW\."votingDate"[\s\S]*NEW\."timeZone"/,
    );
  });

  it('freezes exact catalog provenance in every new offline grant place', () => {
    const grantPlace = model('OfflineE14CaptureGrantPlace');
    for (const field of [
      'sourceReleaseIdAtIssue',
      'sourceLocationCodeAtIssue',
      'votingDateAtIssue',
      'timeZoneAtIssue',
    ]) {
      expect(grantPlace).toContain(field);
      expect(migration).toContain(`"${field}"`);
    }
    expect(migration).toContain('OfflineE14GrantPlace_location_snapshot_check');
  });

  it('backs REAL coverage with exact place day/time-zone guards in PostgreSQL', () => {
    expect(migration).toContain('validate_real_witness_window_catalog_day');
    expect(migration).toContain('WitnessCoverageWindow_catalog_day_guard');
    expect(migration).toContain('preserve_real_witness_window_catalog_day');
    expect(migration).toContain(
      'PoliticalDivision_preserve_real_witness_window',
    );
    expect(migration).toMatch(
      /NEW\."captureContext" <> 'REAL'[\s\S]*NEW\."localDate" IS DISTINCT FROM place_voting_date[\s\S]*NEW\."timeZone" IS DISTINCT FROM place_time_zone/,
    );
    expect(migration).toContain('ENABLE ALWAYS TRIGGER');
  });

  it('is transactional, forward-only and never loads or activates source data', () => {
    expect(migration.trimStart()).toMatch(/^BEGIN;/);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/);
    expect(migration).not.toMatch(/DROP TABLE|DROP TYPE|TRUNCATE|DELETE FROM/i);
    expect(migration).not.toMatch(
      /INSERT INTO\s+"(?:ElectoralCatalogEntry|ElectoralCatalogRelease|PoliticalDivision)"/i,
    );
    expect(migration).not.toMatch(/UPDATE\s+"ElectoralCatalogRelease"/i);
    expect(migration).not.toMatch(/congreso-de-la-republica|data\.json/i);
  });
});
