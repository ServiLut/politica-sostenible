import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from './auth/decorators/public.decorator';
import { Prisma } from '../prisma/generated/prisma';
import { PrismaService, resolveDatabaseSchema } from './prisma/prisma.service';

const REQUIRED_PLAN_CATALOG = new Map([
  [
    'FREE',
    {
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
  ],
  [
    'STARTER',
    {
      maxUsers: 10,
      maxVoters: 1_000,
      maxStorageMb: 500,
      includesExport: true,
      includesImport: false,
      includesMfa: false,
      includesApi: false,
      monthlyPriceCop: 99_000,
      yearlyPriceCop: 1_188_000,
      sortOrder: 2,
    },
  ],
  [
    'PROFESSIONAL',
    {
      maxUsers: 50,
      maxVoters: 10_000,
      maxStorageMb: 2_048,
      includesExport: true,
      includesImport: true,
      includesMfa: true,
      includesApi: false,
      monthlyPriceCop: 299_000,
      yearlyPriceCop: 3_588_000,
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
      monthlyPriceCop: 799_000,
      yearlyPriceCop: 9_588_000,
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
]);

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  @Public()
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
          select: { fingerprint: true },
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
        // is passed as a SQL value, never interpolated as an identifier.
        this.prisma.$queryRaw<
          Array<{ table_name: string; column_name: string }>
        >(
          Prisma.sql`
            SELECT table_name, column_name
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
                ('WitnessReport', 'hasWrittenClaim')
              )
          `,
        ),
      ]);

      const validIdentity =
        typeof identity?.fingerprint === 'string' &&
        /^[a-f0-9]{32}$/.test(identity.fingerprint);
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

      if (!validIdentity || !validPlans || !validColumns) {
        throw new Error('invalid application schema contract');
      }
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
