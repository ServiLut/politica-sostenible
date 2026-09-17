import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const NON_TENANT_MODELS = new Set([
  'Tenant',
  'SubscriptionPlan',
  'SystemDatabaseIdentity',
]);

interface PrismaModelSource {
  readonly name: string;
  readonly body: string;
}

function readModels(): PrismaModelSource[] {
  const schema = readFileSync(
    join(__dirname, '../../prisma/schema.prisma'),
    'utf8',
  );
  return [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gmu)].map(
    (match) => ({
      name: match[1],
      body: match[2],
    }),
  );
}

describe('Prisma multitenancy architecture contract', () => {
  it('requires tenantId on every operational model', () => {
    const missingTenant = readModels()
      .filter(({ name }) => !NON_TENANT_MODELS.has(name))
      .filter(({ body }) => !/^\s*tenantId\s+String\b/mu.test(body))
      .map(({ name }) => name);

    expect(missingTenant).toEqual([]);
  });

  it('requires every operational model to have a tenant-leading lookup key', () => {
    const missingTenantKey = readModels()
      .filter(({ name }) => !NON_TENANT_MODELS.has(name))
      .filter(
        ({ body }) =>
          !/@@(?:index|unique)\(\[tenantId(?:,|\])/u.test(body) &&
          !/^\s*tenantId\s+String\s+@unique\b/mu.test(body),
      )
      .map(({ name }) => name);

    expect(missingTenantKey).toEqual([]);
  });
});
