import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../prisma/generated/prisma';
import { EXPECTED_SCHEMA_VERSION, HealthController } from './health.controller';
import {
  PrismaService,
  resolveDatabaseSchema,
  resolveDatabaseSearchPathOptions,
} from './prisma/prisma.service';
import { RedisThrottlerStorage } from './common/throttling/redis-throttler-storage';
import { SupabaseStorageGateway } from './storage/supabase-storage.gateway';
import type { StorageIntegrityQueuePort } from './storage/storage-integrity-queue.constants';

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const testDatabaseSchema = resolveDatabaseSchema(testDatabaseUrl) ?? 'public';
const describeWithPostgres = testDatabaseUrl ? describe : describe.skip;

describeWithPostgres('Health schema contract on migrated PostgreSQL', () => {
  let prisma: PrismaClient;
  let previousDatabaseUrl: string | undefined;

  beforeAll(async () => {
    previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = testDatabaseUrl;
    const adapter = new PrismaPg(
      {
        connectionString: testDatabaseUrl,
        options: resolveDatabaseSearchPathOptions(testDatabaseSchema),
      },
      { schema: testDatabaseSchema },
    );
    prisma = new PrismaClient({ adapter });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  it('accepts the exact final marker and rejects a different candidate atomically', async () => {
    const throttling = {
      assertAvailable: jest.fn().mockResolvedValue(undefined),
    } as unknown as RedisThrottlerStorage;
    const storage = {
      assertAvailable: jest.fn().mockResolvedValue(undefined),
    } as unknown as SupabaseStorageGateway;
    const integrityQueue = {
      checkReady: jest.fn().mockResolvedValue(undefined),
    } as unknown as StorageIntegrityQueuePort;
    const controller = new HealthController(
      prisma as unknown as PrismaService,
      throttling,
      storage,
      integrityQueue,
    );
    await expect(controller.ready()).resolves.toEqual({ status: 'ok' });

    await expect(
      prisma.$transaction(async (transaction) => {
        await transaction.systemDatabaseIdentity.update({
          where: { id: 'primary' },
          data: { schemaVersion: '20260909309999_previous_candidate' },
        });
        const incompatibleController = new HealthController(
          transaction as unknown as PrismaService,
          throttling,
          storage,
          integrityQueue,
        );
        await expect(incompatibleController.ready()).rejects.toBeInstanceOf(
          ServiceUnavailableException,
        );
        throw new Error('intentional-health-contract-rollback');
      }),
    ).rejects.toThrow('intentional-health-contract-rollback');

    const identity = await prisma.systemDatabaseIdentity.findUniqueOrThrow({
      where: { id: 'primary' },
      select: { fingerprint: true, schemaVersion: true },
    });
    expect(identity).toEqual({
      fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      schemaVersion: EXPECTED_SCHEMA_VERSION,
    });
    await expect(controller.ready()).resolves.toEqual({ status: 'ok' });
  });
});
