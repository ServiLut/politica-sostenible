import { ServiceUnavailableException } from '@nestjs/common';
import { EXPECTED_SCHEMA_VERSION, HealthController } from './health.controller';
import { RedisThrottlerStorage } from './common/throttling/redis-throttler-storage';
import { PrismaService } from './prisma/prisma.service';
import { SupabaseStorageGateway } from './storage/supabase-storage.gateway';
import type { StorageIntegrityQueuePort } from './storage/storage-integrity-queue.constants';

const HEALTH_COLUMNS = [
  { table_name: 'User', column_name: 'authVersion' },
  { table_name: 'User', column_name: 'lastTotpTimeStep' },
  { table_name: 'CampaignSettings', column_name: 'officialLimitsUrl' },
  { table_name: 'CampaignSettings', column_name: 'reportScope' },
  { table_name: 'FinancialEntry', column_name: 'cneReportEvidenceUrl' },
  { table_name: 'WitnessReport', column_name: 'credentialType' },
  { table_name: 'WitnessReport', column_name: 'e14FormType' },
  { table_name: 'WitnessReport', column_name: 'hasWrittenClaim' },
  { table_name: 'StoredObject', column_name: 'integrityStatus' },
  { table_name: 'StoredObject', column_name: 'calculatedSha256' },
  {
    table_name: 'StoredObject',
    column_name: 'integrityVerificationLeaseId',
  },
] as const;

describe('HealthController', () => {
  const queryRaw = jest.fn();
  const identityFindUnique = jest.fn();
  const plansFindMany = jest.fn();
  const prisma = {
    $queryRaw: queryRaw,
    systemDatabaseIdentity: { findUnique: identityFindUnique },
    subscriptionPlan: { findMany: plansFindMany },
  } as unknown as PrismaService;
  const throttlingAssertAvailable = jest.fn();
  const storageAssertAvailable = jest.fn();
  const throttling = {
    assertAvailable: throttlingAssertAvailable,
  } as unknown as RedisThrottlerStorage;
  const storage = {
    assertAvailable: storageAssertAvailable,
  } as unknown as SupabaseStorageGateway;
  const integrityQueueCheckReady = jest.fn();
  const integrityQueue = {
    checkReady: integrityQueueCheckReady,
  } as unknown as StorageIntegrityQueuePort;
  const controller = new HealthController(
    prisma,
    throttling,
    storage,
    integrityQueue,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    queryRaw.mockImplementation((query: { values?: unknown[] }) => {
      const activeSchema =
        query.values?.find(
          (value): value is string =>
            typeof value === 'string' &&
            ['public', 'politica-sostenible'].includes(value),
        ) ?? 'public';
      return Promise.resolve(
        HEALTH_COLUMNS.map((column) => ({
          ...column,
          active_schema: activeSchema,
        })),
      );
    });
    identityFindUnique.mockResolvedValue({
      fingerprint: 'a'.repeat(64),
      schemaVersion: EXPECTED_SCHEMA_VERSION,
    });
    plansFindMany.mockResolvedValue([
      {
        code: 'FREE',
        isActive: true,
        maxUsers: 3,
        maxVoters: 100,
        maxStorageMb: 50,
        includesExport: false,
        includesImport: false,
        includesMfa: false,
        includesApi: false,
        monthlyPriceCop: 0,
        yearlyPriceCop: 0,
        sortOrder: 1,
      },
      {
        code: 'STARTER',
        isActive: true,
        maxUsers: 10,
        maxVoters: 1000,
        maxStorageMb: 500,
        includesExport: true,
        includesImport: false,
        includesMfa: false,
        includesApi: false,
        monthlyPriceCop: 99000,
        yearlyPriceCop: 1188000,
        sortOrder: 2,
      },
      {
        code: 'PROFESSIONAL',
        isActive: true,
        maxUsers: 50,
        maxVoters: 10000,
        maxStorageMb: 2048,
        includesExport: true,
        includesImport: true,
        includesMfa: true,
        includesApi: false,
        monthlyPriceCop: 299000,
        yearlyPriceCop: 3588000,
        sortOrder: 3,
      },
      {
        code: 'ENTERPRISE',
        isActive: true,
        maxUsers: 999999,
        maxVoters: 999999,
        maxStorageMb: 999999,
        includesExport: true,
        includesImport: true,
        includesMfa: true,
        includesApi: false,
        monthlyPriceCop: 799000,
        yearlyPriceCop: 9588000,
        sortOrder: 4,
      },
    ]);
    throttlingAssertAvailable.mockResolvedValue(undefined);
    storageAssertAvailable.mockResolvedValue(undefined);
    integrityQueueCheckReady.mockResolvedValue(undefined);
  });

  it('reports readiness only after probing the current schema contract', async () => {
    await expect(controller.ready()).resolves.toEqual({ status: 'ok' });
    expect(identityFindUnique).toHaveBeenCalledWith({
      where: { id: 'primary' },
      select: { fingerprint: true, schemaVersion: true },
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(throttlingAssertAvailable).toHaveBeenCalledTimes(1);
    const schemaProbe = queryRaw.mock.calls[0][0] as { strings: string[] };
    expect(schemaProbe.strings.join(' ')).toContain(
      'information_schema.columns',
    );
    expect(schemaProbe.strings.join(' ')).toContain("'authVersion'");
    expect(schemaProbe.strings.join(' ')).toContain("'credentialType'");
  });

  it('probes the configured non-public schema as a bound value', async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL =
      'postgresql://app:secret@database.invalid:5432/politica?schema=politica-sostenible';
    try {
      await expect(controller.ready()).resolves.toEqual({ status: 'ok' });
      const schemaProbe = queryRaw.mock.calls[0][0] as { values: unknown[] };
      expect(schemaProbe.values).toContain('politica-sostenible');
    } finally {
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
    }
  });

  it('reports unavailable when the schema or database cannot be queried', async () => {
    queryRaw.mockRejectedValue(new Error('column does not exist'));

    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('reports unavailable when distributed throttling cannot enforce limits', async () => {
    throttlingAssertAvailable.mockRejectedValueOnce(
      new Error('private redis detail'),
    );

    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('keeps Storage out of core readiness and exposes a separate deep probe', async () => {
    await expect(controller.ready()).resolves.toEqual({ status: 'ok' });
    expect(storageAssertAvailable).not.toHaveBeenCalled();

    await expect(controller.dependencies()).resolves.toEqual({ status: 'ok' });
    expect(storageAssertAvailable).toHaveBeenCalledTimes(1);
    expect(integrityQueueCheckReady).toHaveBeenCalledTimes(1);
  });

  it('reports the deep dependency probe unavailable without exposing Storage details', async () => {
    storageAssertAvailable.mockRejectedValueOnce(
      new Error('private storage detail'),
    );

    await expect(controller.dependencies()).rejects.toMatchObject({
      message: 'Servicio no disponible',
    });
  });

  it('reports the deep dependency probe unavailable when the integrity queue is down', async () => {
    integrityQueueCheckReady.mockRejectedValueOnce(
      new Error('private redis detail'),
    );

    await expect(controller.dependencies()).rejects.toMatchObject({
      message: 'Servicio no disponible',
    });
  });

  it('fails closed when raw SQL resolves in a different schema', async () => {
    queryRaw.mockResolvedValueOnce(
      HEALTH_COLUMNS.map((column) => ({
        ...column,
        active_schema: 'attacker_schema',
      })),
    );

    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('fails closed for a legacy fingerprint or a different schema marker', async () => {
    identityFindUnique.mockResolvedValueOnce({
      fingerprint: 'a'.repeat(32),
      schemaVersion: null,
    });
    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    identityFindUnique.mockResolvedValueOnce({
      fingerprint: 'a'.repeat(64),
      schemaVersion: '20260909309999_previous_candidate',
    });
    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('reports unavailable when the plan catalog is missing or incoherent', async () => {
    plansFindMany.mockResolvedValue([
      {
        code: 'FREE',
        isActive: true,
        maxUsers: 3,
        maxVoters: 100,
        maxStorageMb: 50,
        includesExport: false,
        includesImport: false,
        includesMfa: false,
        includesApi: false,
        monthlyPriceCop: 0,
        yearlyPriceCop: 0,
        sortOrder: 1,
      },
    ]);

    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
