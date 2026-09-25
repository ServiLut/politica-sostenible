import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role } from '../../prisma/generated/prisma';
import {
  resolveDatabaseSchema,
  resolveDatabaseSearchPathOptions,
  type PrismaService,
} from '../prisma/prisma.service';
import { OperationProfileService } from './operation-profile.service';

// Only the explicitly disposable integration connection can run this suite.
// DATABASE_URL is deliberately never used as a fallback.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const physicalDescribe = databaseUrl ? describe : describe.skip;

physicalDescribe('Operation profile real PostgreSQL contracts', () => {
  let prisma: PrismaClient;
  let service: OperationProfileService;
  beforeAll(async () => {
    const schema = resolveDatabaseSchema(databaseUrl) ?? 'public';
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        {
          connectionString: databaseUrl,
          options: resolveDatabaseSearchPathOptions(schema),
        },
        { schema },
      ),
    });
    await prisma.$connect();
    service = new OperationProfileService(prisma as PrismaService);
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function context() {
    const suffix = randomUUID();
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Test alistamiento',
        slug: `readiness-${suffix}`,
        type: 'CANDIDACY',
        defaultMode: 'CAMPAIGN',
      },
    });
    const actor = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `readiness-${suffix}@integration.invalid`,
        password: 'not-a-login-credential',
        name: 'Test actor',
        role: Role.ADMIN,
      },
    });
    return { userId: actor.id, tenantId: tenant.id, role: Role.ADMIN };
  }

  it('returns a blocked complete response for an empty tenant, never a fabricated READY', async () => {
    const user = await context();
    const result = await service.getReadiness(user);
    expect(result).toMatchObject({
      overall: 'BLOCKED',
      stage: null,
      electionDate: null,
    });
    for (const section of [
      'BEFORE_CAMPAIGN',
      'CAMPAIGN',
      'ELECTION_DAY',
      'POST_ELECTION',
    ] as const)
      expect(Array.isArray(result.sections[section])).toBe(true);
    expect(JSON.stringify(result)).not.toContain(user.tenantId);
    expect(JSON.stringify(result)).not.toContain(user.userId);
  });

  it('persists an initial profile and exposes only allowed future transitions', async () => {
    const user = await context();
    const saved = await service.upsert(user, {
      operationType: 'SINGLE_CANDIDACY',
      stage: 'PRE_CAMPAIGN',
      electionType: 'MAYORALTY',
      circumscriptionType: 'MUNICIPAL',
      circumscriptionName: 'Municipio de prueba',
      electionDate: '2027-10-31',
      expectedTeamSize: 3,
      candidateCount: 1,
      maxTotalBudget: 1000000,
      maxPublicityLimit: 100000,
      dataControllerName: 'Responsable de prueba',
      responsibleDataUserId: user.userId,
      retentionPeriodDays: 365,
      revocationProcedure:
        'Solicitud verificable al responsable de datos de la organizacion.',
    });
    expect(saved.profile.allowedNextStages).toEqual([
      'PRE_CAMPAIGN',
      'SIGNATURE_COLLECTION',
      'CAMPAIGN',
    ]);
    expect((await service.getReadiness(user)).stage).toBe('PRE_CAMPAIGN');
    const readback = await service.getCurrent(user);
    expect(readback.profile?.id).toBe(saved.profile.id);
  });

  it('rejects an actor from another tenant before returning an aggregate', async () => {
    const user = await context();
    const foreign = await context();
    await expect(
      service.getReadiness({ ...user, tenantId: foreign.tenantId }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
