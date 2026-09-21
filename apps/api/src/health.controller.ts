import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from './auth/decorators/public.decorator';
import { RedisThrottlerStorage } from './common/throttling/redis-throttler-storage';
import { Prisma } from '../prisma/generated/prisma';
import { PrismaService, resolveDatabaseSchema } from './prisma/prisma.service';
import { SupabaseStorageGateway } from './storage/supabase-storage.gateway';
import {
  STORAGE_INTEGRITY_QUEUE_PORT,
  type StorageIntegrityQueuePort,
} from './storage/storage-integrity-queue.constants';

export const EXPECTED_SCHEMA_VERSION = '20260921182000_schema_contract_marker';

const REQUIRED_PLAN_CATALOG = new Map([
  [
    'FREE',
    {
      maxUsers: 3,
      maxVoters: 500,
      maxStorageMb: 50,
      includesExport: false,
      includesImport: false,
      includesMfa: false,
      includesApi: false,
      monthlyPriceCop: 0,
      yearlyPriceCop: 0,
      sortOrder: 1,
    },
  ],
  [
    'STARTER',
    {
      maxUsers: 15,
      maxVoters: 5_000,
      maxStorageMb: 500,
      includesExport: true,
      includesImport: false,
      includesMfa: false,
      includesApi: false,
      monthlyPriceCop: 290_000,
      yearlyPriceCop: 3_480_000,
      sortOrder: 2,
    },
  ],
  [
    'PROFESSIONAL',
    {
      maxUsers: 50,
      maxVoters: 50_000,
      maxStorageMb: 2_048,
      includesExport: true,
      includesImport: true,
      includesMfa: true,
      includesApi: false,
      monthlyPriceCop: 990_000,
      yearlyPriceCop: 11_880_000,
      sortOrder: 3,
    },
  ],
  [
    'ENTERPRISE',
    {
      maxUsers: 999_999,
      maxVoters: 999_999,
      maxStorageMb: 999_999,
      includesExport: true,
      includesImport: true,
      includesMfa: true,
      includesApi: false,
      monthlyPriceCop: 3_500_000,
      yearlyPriceCop: 42_000_000,
      sortOrder: 4,
    },
  ],
]);
const REQUIRED_SCHEMA_COLUMNS = new Set([
  'User.authVersion',
  'User.lastTotpTimeStep',
  'CampaignSettings.officialLimitsUrl',
  'CampaignSettings.reportScope',
  'FinancialEntry.cneReportEvidenceUrl',
  'WitnessReport.credentialType',
  'WitnessReport.e14FormType',
  'WitnessReport.hasWrittenClaim',
  'StoredObject.integrityStatus',
  'StoredObject.calculatedSha256',
  'StoredObject.integrityVerificationLeaseId',
]);

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly throttling: RedisThrottlerStorage,
    private readonly storage: SupabaseStorageGateway,
    @Inject(STORAGE_INTEGRITY_QUEUE_PORT)
    private readonly integrityQueue: StorageIntegrityQueuePort,
  ) {}

  @Get('live')
  @Public()
  @SkipThrottle()
  live() {
    return { status: 'ok' as const };
  }

  @Get('ready')
  @Public()
  async ready() {
    try {
      const schema =
        resolveDatabaseSchema(process.env.DATABASE_URL) ?? 'public';
      const [identity, plans, columns] = await Promise.all([
        this.prisma.systemDatabaseIdentity.findUnique({
          where: { id: 'primary' },
          select: { fingerprint: true, schemaVersion: true },
        }),
        this.prisma.subscriptionPlan.findMany({
          where: {
            code: {
              in: ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'],
            },
          },
          select: {
            code: true,
            isActive: true,
            maxUsers: true,
            maxVoters: true,
            maxStorageMb: true,
            includesExport: true,
            includesImport: true,
            includesMfa: true,
            includesApi: true,
            monthlyPriceCop: true,
            yearlyPriceCop: true,
            sortOrder: true,
          },
        }),
        // The catalog query proves the critical columns exist without reading
        // a single operational row or bypassing tenant isolation. The schema
        // is passed as a SQL value, never interpolated as an identifier. The
        // same query also proves that raw SQL is resolving in that schema.
        this.prisma.$queryRaw<
          Array<{
            table_name: string;
            column_name: string;
            active_schema: string | null;
          }>
        >(
          Prisma.sql`
            SELECT table_name, column_name, current_schema() AS active_schema
            FROM information_schema.columns
            WHERE table_schema = ${schema}
              AND (table_name, column_name) IN (
                ('User', 'authVersion'),
                ('User', 'lastTotpTimeStep'),
                ('CampaignSettings', 'officialLimitsUrl'),
                ('CampaignSettings', 'reportScope'),
                ('FinancialEntry', 'cneReportEvidenceUrl'),
                ('WitnessReport', 'credentialType'),
                ('WitnessReport', 'e14FormType'),
                ('WitnessReport', 'hasWrittenClaim'),
                ('StoredObject', 'integrityStatus'),
                ('StoredObject', 'calculatedSha256'),
                ('StoredObject', 'integrityVerificationLeaseId')
              )
          `,
        ),
        this.throttling.assertAvailable(),
      ]);

      const validIdentity =
        typeof identity?.fingerprint === 'string' &&
        /^[a-f0-9]{64}$/.test(identity.fingerprint) &&
        identity.schemaVersion === EXPECTED_SCHEMA_VERSION;
      const observedColumns = new Set(
        columns.map(
          ({ table_name: tableName, column_name: columnName }) =>
            `${tableName}.${columnName}`,
        ),
      );
      const validColumns =
        observedColumns.size === REQUIRED_SCHEMA_COLUMNS.size &&
        [...REQUIRED_SCHEMA_COLUMNS].every((column) =>
          observedColumns.has(column),
        );
      const observedActiveSchemas = new Set(
        columns.map(({ active_schema: activeSchema }) => activeSchema),
      );
      const validRawSqlSchema =
        observedActiveSchemas.size === 1 && observedActiveSchemas.has(schema);
      const observedCodes = new Set<string>();
      const validPlans =
        plans.length === REQUIRED_PLAN_CATALOG.size &&
        plans.every((plan) => {
          const expected = REQUIRED_PLAN_CATALOG.get(plan.code);
          if (!expected || observedCodes.has(plan.code) || !plan.isActive) {
            return false;
          }
          observedCodes.add(plan.code);
          return (
            plan.maxUsers === expected.maxUsers &&
            plan.maxVoters === expected.maxVoters &&
            plan.maxStorageMb === expected.maxStorageMb &&
            plan.includesExport === expected.includesExport &&
            plan.includesImport === expected.includesImport &&
            plan.includesMfa === expected.includesMfa &&
            plan.includesApi === expected.includesApi &&
            Number(plan.monthlyPriceCop) === expected.monthlyPriceCop &&
            Number(plan.yearlyPriceCop) === expected.yearlyPriceCop &&
            plan.sortOrder === expected.sortOrder
          );
        });

      if (
        !validIdentity ||
        !validPlans ||
        !validColumns ||
        !validRawSqlSchema
      ) {
        throw new Error('invalid application schema contract');
      }
      return { status: 'ok' as const };
    } catch {
      throw new ServiceUnavailableException('Servicio no disponible');
    }
  }

  /**
   * Deep operational probe for external monitoring. Storage is deliberately
   * not a hard dependency of /ready: a Storage outage must disable evidence
   * workflows without taking unrelated API traffic out of service.
   */
  @Get('dependencies')
  @Public()
  async dependencies() {
    try {
      await Promise.all([
        this.ready(),
        this.storage.assertAvailable(),
        this.integrityQueue.checkReady(),
      ]);
      return { status: 'ok' as const };
    } catch {
      throw new ServiceUnavailableException('Servicio no disponible');
    }
  }

  @Get()
  @Public()
  check() {
    return this.ready();
  }
}
