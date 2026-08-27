import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotImplementedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ColombiaValidator } from '../common/utils/colombia-validator.util';
import { CreateFinancialEntryDto } from './dto/create-financial-entry.dto';
import { ValidateExpenseDto } from './dto/validate-expense.dto';
import { buildCsvRow } from '../common/utils/csv.util';
import {
  AuditActorType,
  PoliticalOperationMode,
  Prisma,
} from '../../prisma/generated/prisma';
import {
  assertCampaignTenant,
  CAMPAIGN_TENANT_SELECT,
} from '../common/utils/campaign-mode.util';
import { assertConfirmedStorageUpload } from '../common/utils/confirmed-storage-upload.util';
import { UpsertFinanceSettingsDto } from './dto/upsert-finance-settings.dto';

const FINANCIAL_ENTRY_VIEW_SELECT = {
  id: true,
  type: true,
  amount: true,
  date: true,
  cneCode: true,
  description: true,
  vendorName: true,
  vendorTaxId: true,
  status: true,
  createdAt: true,
  evidenceUrl: true,
} satisfies Prisma.FinancialEntrySelect;

type FinancialEntryViewSource = Prisma.FinancialEntryGetPayload<{
  select: typeof FINANCIAL_ENTRY_VIEW_SELECT;
}>;

const FINANCE_SETTINGS_VIEW_SELECT = {
  id: true,
  maxTotalBudget: true,
  maxPublicityLimit: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CampaignSettingsSelect;

type FinanceSettingsView = Prisma.CampaignSettingsGetPayload<{
  select: typeof FINANCE_SETTINGS_VIEW_SELECT;
}>;

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  async create(
    tenantId: string,
    reporterId: string,
    data: CreateFinancialEntryDto,
  ) {
    await this.assertCampaignMode(tenantId);

    if (data.evidenceUrl) {
      this.assertOwnedFinanceEvidence(tenantId, data.evidenceUrl);
      await assertConfirmedStorageUpload(
        this.prisma,
        tenantId,
        data.evidenceUrl,
      );
    }

    // 1. Validar NIT del proveedor (Sección 6.2)
    if (data.type === 'EXPENSE' && data.vendorTaxId) {
      // Si el NIT incluye guion, validamos el DV
      if (data.vendorTaxId.includes('-')) {
        const isValid = ColombiaValidator.isValidNIT(data.vendorTaxId);
        if (!isValid)
          throw new BadRequestException(
            'NIT o Dígito de Verificación inválido',
          );
      }
    }

    // Los topes varían por elección. Nunca se usa un valor legal ficticio.
    if (data.type === 'EXPENSE') {
      const settings = await this.prisma.campaignSettings.findUnique({
        where: { tenantId },
      });

      if (settings) {
        const current = await this.prisma.financialEntry.aggregate({
          where: { tenantId, type: 'EXPENSE', status: { not: 'REJECTED' } },
          _sum: { amount: true },
        });
        const projectedTotal =
          Number(current._sum.amount ?? 0) + Number(data.amount);

        if (projectedTotal > Number(settings.maxTotalBudget)) {
          throw new ForbiddenException(
            'El movimiento supera el tope total configurado para esta elección.',
          );
        }

        if (data.cneCode === 'PUBLICIDAD_VALLAS') {
          const currentPublicity = await this.prisma.financialEntry.aggregate({
            where: {
              tenantId,
              type: 'EXPENSE',
              cneCode: 'PUBLICIDAD_VALLAS',
              status: { not: 'REJECTED' },
            },
            _sum: { amount: true },
          });
          const projectedPublicity =
            Number(currentPublicity._sum.amount ?? 0) + Number(data.amount);
          if (projectedPublicity > Number(settings.maxPublicityLimit)) {
            throw new ForbiddenException(
              'El movimiento supera el tope de publicidad exterior configurado para esta elección.',
            );
          }
        }
      }
    }

    const entry = await this.prisma.financialEntry.create({
      data: {
        ...data,
        tenantId,
        reporterId,
        date: new Date(data.date),
      },
      select: FINANCIAL_ENTRY_VIEW_SELECT,
    });
    return this.toFinancialEntryView(entry);
  }

  async findAll(tenantId: string) {
    await this.assertCampaignMode(tenantId);
    try {
      const entries = await this.prisma.financialEntry.findMany({
        where: { tenantId },
        select: FINANCIAL_ENTRY_VIEW_SELECT,
        orderBy: { date: 'desc' },
      });
      return entries.map((entry) => this.toFinancialEntryView(entry));
    } catch (error) {
      console.error('❌ Error in FinanceService.findAll:', error);
      throw error;
    }
  }

  async getSummary(tenantId: string) {
    await this.assertCampaignMode(tenantId);
    try {
      const expenses = await this.prisma.financialEntry.aggregate({
        where: { tenantId, type: 'EXPENSE' },
        _sum: { amount: true },
      });
      const income = await this.prisma.financialEntry.aggregate({
        where: { tenantId, type: 'INCOME' },
        _sum: { amount: true },
      });
      const settings = await this.prisma.campaignSettings.findUnique({
        where: { tenantId },
      });
      const totalExpenses = expenses._sum.amount
        ? Number(expenses._sum.amount)
        : 0;

      return {
        totalExpenses,
        totalIncome: income._sum.amount ? Number(income._sum.amount) : 0,
        balance:
          (Number(income._sum.amount) || 0) -
          (Number(expenses._sum.amount) || 0),
        limitsConfigured: Boolean(settings),
        maxTotalBudget: settings ? Number(settings.maxTotalBudget) : null,
        maxPublicityLimit: settings ? Number(settings.maxPublicityLimit) : null,
        remainingBudget: settings
          ? Math.max(0, Number(settings.maxTotalBudget) - totalExpenses)
          : null,
      };
    } catch (error) {
      console.error('❌ Error in FinanceService.getSummary:', error);
      throw error;
    }
  }

  async validateExpense(
    tenantId: string,
    data: ValidateExpenseDto,
  ): Promise<never> {
    await this.assertCampaignMode(tenantId);
    throw new NotImplementedException({
      code: 'EXTERNAL_PROVIDER_VALIDATION_NOT_CONFIGURED',
      message:
        'La validación contra fuentes externas no está configurada. El nombre del proveedor no se usará para inventar un resultado.',
      vendorNameReceived: Boolean(data.vendorName?.trim()),
    });
  }

  async updateSettings(
    tenantId: string,
    actorUserId: string,
    dto: UpsertFinanceSettingsDto,
  ) {
    this.assertValidSettings(dto);

    return this.prisma.$transaction(async (transaction) => {
      const tenant = await transaction.tenant.findUnique({
        where: { id: tenantId },
        select: CAMPAIGN_TENANT_SELECT,
      });
      assertCampaignTenant(tenant);

      const actor = await transaction.user.findFirst({
        where: { id: actorUserId, tenantId },
        select: { id: true },
      });
      if (!actor) {
        throw new ForbiddenException(
          'El usuario autenticado no pertenece a esta campaña',
        );
      }

      const previous = await transaction.campaignSettings.findUnique({
        where: { tenantId },
        select: FINANCE_SETTINGS_VIEW_SELECT,
      });
      const settings = await transaction.campaignSettings.upsert({
        where: { tenantId },
        update: {
          maxTotalBudget: dto.maxTotalBudget,
          maxPublicityLimit: dto.maxPublicityLimit,
        },
        create: {
          tenantId,
          maxTotalBudget: dto.maxTotalBudget,
          maxPublicityLimit: dto.maxPublicityLimit,
        },
        select: FINANCE_SETTINGS_VIEW_SELECT,
      });

      await transaction.auditEvent.create({
        data: {
          tenantId,
          mode: PoliticalOperationMode.CAMPAIGN,
          actorType: AuditActorType.USER,
          actorUserId,
          action: 'CAMPAIGN_FINANCE_SETTINGS_UPSERTED',
          resourceType: 'CampaignSettings',
          resourceId: settings.id,
          ...(previous
            ? { before: this.financeSettingsAuditSnapshot(previous) }
            : {}),
          after: this.financeSettingsAuditSnapshot(settings),
        },
      });

      return settings;
    });
  }

  private assertOwnedFinanceEvidence(tenantId: string, path: string): void {
    const expectedPrefix = `${tenantId}/finance/`;
    const objectName = path.startsWith(expectedPrefix)
      ? path.slice(expectedPrefix.length)
      : '';
    const canonicalName =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[a-z0-9][a-z0-9-]*\.(pdf|jpe?g|png|webp|csv|xlsx)$/i;

    if (
      !objectName ||
      objectName.includes('/') ||
      !canonicalName.test(objectName)
    ) {
      throw new BadRequestException(
        'El soporte financiero debe ser una ruta privada confirmada del tenant autenticado.',
      );
    }
  }

  async generateCneReport(tenantId: string): Promise<string> {
    await this.assertCampaignMode(tenantId);
    const expenses = await this.prisma.financialEntry.findMany({
      where: { tenantId, type: 'EXPENSE' },
      include: { reporter: { select: { name: true } } },
      orderBy: { date: 'asc' },
    });

    const header = buildCsvRow([
      'Fecha',
      'Concepto',
      'Monto',
      'Proveedor',
      'NIT',
      'Código CNE',
      'Responsable',
    ]);
    const rows = expenses
      .map((entry) =>
        buildCsvRow([
          entry.date.toISOString().split('T')[0],
          entry.description,
          String(entry.amount),
          entry.vendorName,
          entry.vendorTaxId,
          entry.cneCode,
          entry.reporter.name,
        ]),
      )
      .join('\n');

    return rows ? `${header}\n${rows}` : header;
  }

  private async assertCampaignMode(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: CAMPAIGN_TENANT_SELECT,
    });
    assertCampaignTenant(tenant);
  }

  private assertValidSettings(dto: UpsertFinanceSettingsDto): void {
    const maximum = 9_999_999_999_999.99;
    if (
      !Number.isFinite(dto.maxTotalBudget) ||
      !Number.isFinite(dto.maxPublicityLimit) ||
      dto.maxTotalBudget <= 0 ||
      dto.maxPublicityLimit <= 0 ||
      dto.maxTotalBudget > maximum ||
      dto.maxPublicityLimit > dto.maxTotalBudget
    ) {
      throw new BadRequestException(
        'Los topes financieros son inválidos o inconsistentes',
      );
    }
  }

  private financeSettingsAuditSnapshot(
    settings: FinanceSettingsView,
  ): Prisma.InputJsonObject {
    return {
      maxTotalBudget: settings.maxTotalBudget.toString(),
      maxPublicityLimit: settings.maxPublicityLimit.toString(),
    };
  }

  private toFinancialEntryView(entry: FinancialEntryViewSource) {
    const { evidenceUrl, ...view } = entry;
    return {
      ...view,
      hasEvidence: Boolean(evidenceUrl),
    };
  }
}
