import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('OperationProfile database invariants', () => {
  const schema = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(
    resolve('prisma/migrations/20260905000000_operation_profile/migration.sql'),
    'utf8',
  );
  const model = schema.match(/model OperationProfile \{[\s\S]*?\n\}/)?.[0];

  it('owns exactly one aggregate operation profile per tenant', () => {
    expect(model).toBeDefined();
    expect(model).toContain('tenantId              String');
    expect(model).toContain('@unique');
    expect(model).toContain('responsibleDataUserId String');
    expect(model).toContain('retentionPeriodDays   Int');
    expect(model).toContain('revocationProcedure   String');
  });

  it('enforces cross-tenant ownership through compound user foreign keys', () => {
    expect(migration).toContain(
      'FOREIGN KEY ("responsibleDataUserId", "tenantId") REFERENCES "User"("id", "tenantId")',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("createdById", "tenantId") REFERENCES "User"("id", "tenantId")',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("updatedById", "tenantId") REFERENCES "User"("id", "tenantId")',
    );
  });

  it('backs DTO constraints with PostgreSQL checks', () => {
    expect(migration).toContain('"retentionPeriodDays" BETWEEN 1 AND 3650');
    expect(migration).toContain('"expectedTeamSize" BETWEEN 1 AND 100000');
    expect(migration).toContain('"candidateCount" BETWEEN 1 AND 10000');
    expect(migration).toMatch(/"listType" IS NULL\s+OR "operationType" IN/);
  });

  it('does not model individual persuasion or sensitive-person scoring', () => {
    expect(model).not.toMatch(
      /supportProbability|ideology|persuadable|religion/i,
    );
  });
});
