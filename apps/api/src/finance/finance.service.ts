import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ColombiaValidator } from '../common/utils/colombia-validator.util';
import { CreateFinancialEntryDto } from './dto/create-financial-entry.dto';
import { buildCsvRow } from '../common/utils/csv.util';
import {
  AuditActorType,
  EntryType,
  FinanceStatus,
  PoliticalOperationMode,
  Prisma,
  Role,
  StorageObjectModule,
} from '../../prisma/generated/prisma';
import {
  assertCampaignTenant,
  CAMPAIGN_TENANT_SELECT,
} from '../common/utils/campaign-mode.util';
import { consumeConfirmedStorageUpload } from '../common/utils/confirmed-storage-upload.util';
import { isOwnedCanonicalStoragePath } from '../common/utils/tenant-storage-path.util';
import { UpsertFinanceSettingsDto } from './dto/upsert-finance-settings.dto';
import { ReviewFinancialEntryDto } from './dto/review-financial-entry.dto';
import { MarkCneReportedDto } from './dto/mark-cne-reported.dto';

const FINANCE_REVIEW_ROLES = new Set<Role>([
  Role.ADMIN,
  Role.FINANCE_MANAGER,
  Role.COMPLIANCE_OFFICER,
]);

const FINANCE_REPORT_EXPORT_ROLES = new Set<Role>([
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.FINANCE_MANAGER,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
]);

const SERIALIZABLE_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
} as const;

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
  reviewedAt: true,
  cneReportedAt: true,
  cneReportReference: true,
  evidenceUrl: true,
  reporterId: true,
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
    const settings = await this.prisma.campaignSettings.findUnique({
      where: { tenantId },
      select: { id: true },
    });
    if (!settings) {
      throw new ForbiddenException(
        'No se puede registrar movimientos financieros sin configurar los topes de campaña.',
      );
    }

    if (data.evidenceUrl) {
      this.assertOwnedFinanceEvidence(tenantId, data.evidenceUrl);
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

    const amount = new Prisma.Decimal(String(data.amount));

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const tenant = await transaction.tenant.findUnique({
          where: { id: tenantId },
          select: CAMPAIGN_TENANT_SELECT,
        });
        assertCampaignTenant(tenant);

        const reporter = await transaction.user.findFirst({
          where: { id: reporterId, tenantId },
          select: { id: true },
        });
        if (!reporter) {
          throw new ForbiddenException(
            'El usuario autenticado no pertenece a esta campaña',
          );
        }

        // Los topes varían por elección. Nunca se usa un valor legal ficticio.
        if (data.type === EntryType.EXPENSE) {
          const settings = await transaction.campaignSettings.findUnique({
            where: { tenantId },
            select: { maxTotalBudget: true, maxPublicityLimit: true },
          });

          if (settings) {
            const current = await transaction.financialEntry.aggregate({
              where: {
                tenantId,
                type: EntryType.EXPENSE,
                status: { not: FinanceStatus.REJECTED },
              },
              _sum: { amount: true },
            });
            const projectedTotal = new Prisma.Decimal(
              current._sum.amount ?? 0,
            ).plus(amount);

            if (projectedTotal.greaterThan(settings.maxTotalBudget)) {
              throw new ForbiddenException(
                'El movimiento supera el tope total configurado para esta elección.',
              );
            }

            if (data.cneCode === 'PUBLICIDAD_VALLAS') {
              const currentPublicity =
                await transaction.financialEntry.aggregate({
                  where: {
                    tenantId,
                    type: EntryType.EXPENSE,
                    cneCode: 'PUBLICIDAD_VALLAS',
                    status: { not: FinanceStatus.REJECTED },
                  },
                  _sum: { amount: true },
                });
              const projectedPublicity = new Prisma.Decimal(
                currentPublicity._sum.amount ?? 0,
              ).plus(amount);
              if (projectedPublicity.greaterThan(settings.maxPublicityLimit)) {
                throw new ForbiddenException(
                  'El movimiento supera el tope de publicidad exterior configurado para esta elección.',
                );
              }
            }
          }
        }

        const entry = await transaction.financialEntry.create({
          data: {
            ...data,
            amount,
            tenantId,
            reporterId,
            date: new Date(data.date),
          },
          select: FINANCIAL_ENTRY_VIEW_SELECT,
        });

        if (data.evidenceUrl) {
          await consumeConfirmedStorageUpload(
            transaction,
            tenantId,
            data.evidenceUrl,
            StorageObjectModule.FINANCE,
            'FinancialEntry',
            entry.id,
            reporterId,
          );
        }

        await transaction.auditEvent.create({
          data: {
            tenantId,
            mode: PoliticalOperationMode.CAMPAIGN,
            actorType: AuditActorType.USER,
            actorUserId: reporterId,
            action: 'CAMPAIGN_FINANCIAL_ENTRY_CREATED',
            resourceType: 'FinancialEntry',
            resourceId: entry.id,
            metadata: {
              type: data.type,
              cneCode: data.cneCode,
              amount: amount.toString(),
              hasEvidence: Boolean(data.evidenceUrl),
            },
          },
        });

        return this.toFinancialEntryView(entry, reporterId);
      }, SERIALIZABLE_OPTIONS);
    } catch (error) {
      this.rethrowSerializableConflict(error);
    }
  }

  async findAll(tenantId: string, viewerId?: string) {
    await this.assertCampaignMode(tenantId);
    const entries = await this.prisma.financialEntry.findMany({
      where: { tenantId },
      select: FINANCIAL_ENTRY_VIEW_SELECT,
      orderBy: { date: 'desc' },
    });
    return entries.map((entry) => this.toFinancialEntryView(entry, viewerId));
  }

  async getSummary(tenantId: string) {
    await this.assertCampaignMode(tenantId);
    const expenses = await this.prisma.financialEntry.aggregate({
      where: {
        tenantId,
        type: EntryType.EXPENSE,
        status: { not: FinanceStatus.REJECTED },
      },
      _sum: { amount: true },
    });
    const income = await this.prisma.financialEntry.aggregate({
      where: {
        tenantId,
        type: EntryType.INCOME,
        status: { not: FinanceStatus.REJECTED },
      },
      _sum: { amount: true },
    });
    const settings = await this.prisma.campaignSettings.findUnique({
      where: { tenantId },
    });
    const totalExpensesDecimal = new Prisma.Decimal(expenses._sum.amount ?? 0);
    const totalIncomeDecimal = new Prisma.Decimal(income._sum.amount ?? 0);
    const totalExpenses = totalExpensesDecimal.toNumber();
    const totalIncome = totalIncomeDecimal.toNumber();
    const remainingBudget = settings
      ? new Prisma.Decimal(settings.maxTotalBudget).minus(totalExpensesDecimal)
      : null;

    return {
      totalExpenses,
      totalIncome,
      balance: totalIncomeDecimal.minus(totalExpensesDecimal).toNumber(),
      limitsConfigured: Boolean(settings),
      maxTotalBudget: settings ? Number(settings.maxTotalBudget) : null,
      maxPublicityLimit: settings ? Number(settings.maxPublicityLimit) : null,
      remainingBudget: remainingBudget
        ? Prisma.Decimal.max(remainingBudget, 0).toNumber()
        : null,
    };
  }

  async updateSettings(
    tenantId: string,
    actorUserId: string,
    dto: UpsertFinanceSettingsDto,
  ) {
    this.assertValidSettings(dto);
    const maxTotalBudget = new Prisma.Decimal(String(dto.maxTotalBudget));
    const maxPublicityLimit = new Prisma.Decimal(String(dto.maxPublicityLimit));

    try {
      return await this.prisma.$transaction(async (transaction) => {
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

        const [currentExpenses, currentPublicity] = await Promise.all([
          transaction.financialEntry.aggregate({
            where: {
              tenantId,
              type: EntryType.EXPENSE,
              status: { not: FinanceStatus.REJECTED },
            },
            _sum: { amount: true },
          }),
          transaction.financialEntry.aggregate({
            where: {
              tenantId,
              type: EntryType.EXPENSE,
              cneCode: 'PUBLICIDAD_VALLAS',
              status: { not: FinanceStatus.REJECTED },
            },
            _sum: { amount: true },
          }),
        ]);

        if (
          new Prisma.Decimal(currentExpenses._sum.amount ?? 0).greaterThan(
            maxTotalBudget,
          ) ||
          new Prisma.Decimal(currentPublicity._sum.amount ?? 0).greaterThan(
            maxPublicityLimit,
          )
        ) {
          throw new BadRequestException(
            'Los topes no pueden quedar por debajo de movimientos no rechazados ya registrados',
          );
        }

        const previous = await transaction.campaignSettings.findUnique({
          where: { tenantId },
          select: FINANCE_SETTINGS_VIEW_SELECT,
        });
        const settings = await transaction.campaignSettings.upsert({
          where: { tenantId },
          update: { maxTotalBudget, maxPublicityLimit },
          create: { tenantId, maxTotalBudget, maxPublicityLimit },
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
      }, SERIALIZABLE_OPTIONS);
    } catch (error) {
      this.rethrowSerializableConflict(error);
    }
  }

  async review(
    tenantId: string,
    reviewerId: string,
    entryId: string,
    dto: ReviewFinancialEntryDto,
  ) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const tenant = await transaction.tenant.findUnique({
          where: { id: tenantId },
          select: CAMPAIGN_TENANT_SELECT,
        });
        assertCampaignTenant(tenant);

        const reviewer = await transaction.user.findFirst({
          where: { id: reviewerId, tenantId },
          select: { id: true, role: true },
        });
        if (!reviewer || !FINANCE_REVIEW_ROLES.has(reviewer.role)) {
          throw new ForbiddenException(
            'El usuario autenticado no puede revisar movimientos financieros',
          );
        }

        const existing = await transaction.financialEntry.findFirst({
          where: { id: entryId, tenantId },
          select: FINANCIAL_ENTRY_VIEW_SELECT,
        });
        if (!existing) {
          throw new NotFoundException('Movimiento financiero no encontrado');
        }
        if (existing.status !== FinanceStatus.PENDING) {
          throw new ConflictException(
            'El movimiento financiero ya fue revisado',
          );
        }
        if (existing.reporterId === reviewerId) {
          throw new ForbiddenException(
            'Quien registra un movimiento no puede revisar su propio registro',
          );
        }
        if (dto.status === FinanceStatus.APPROVED && !existing.evidenceUrl) {
          throw new BadRequestException(
            'No se puede aprobar un movimiento financiero sin soporte',
          );
        }

        const reviewedAt = new Date();
        const transition = await transaction.financialEntry.updateMany({
          where: {
            id: entryId,
            tenantId,
            status: FinanceStatus.PENDING,
            reporterId: { not: reviewerId },
          },
          data: {
            status: dto.status,
            reviewedById: reviewerId,
            reviewedAt,
            reviewReason: dto.reviewReason,
          },
        });
        if (transition.count !== 1) {
          throw new ConflictException(
            'El movimiento fue revisado por otra persona; actualiza la vista',
          );
        }

        const updated = await transaction.financialEntry.findFirst({
          where: { id: entryId, tenantId },
          select: FINANCIAL_ENTRY_VIEW_SELECT,
        });
        if (!updated) {
          throw new ConflictException(
            'No fue posible confirmar la revisión financiera',
          );
        }

        await transaction.auditEvent.create({
          data: {
            tenantId,
            mode: PoliticalOperationMode.CAMPAIGN,
            actorType: AuditActorType.USER,
            actorUserId: reviewerId,
            action: 'CAMPAIGN_FINANCIAL_ENTRY_REVIEWED',
            resourceType: 'FinancialEntry',
            resourceId: entryId,
            before: { status: existing.status },
            after: { status: updated.status },
            metadata: { decision: dto.status },
          },
        });

        return this.toFinancialEntryView(updated, reviewerId);
      }, SERIALIZABLE_OPTIONS);
    } catch (error) {
      this.rethrowSerializableConflict(error);
    }
  }

  async markReportedToCne(
    tenantId: string,
    actorUserId: string,
    entryId: string,
    dto: MarkCneReportedDto,
  ) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const tenant = await transaction.tenant.findUnique({
          where: { id: tenantId },
          select: CAMPAIGN_TENANT_SELECT,
        });
        assertCampaignTenant(tenant);

        const actor = await transaction.user.findFirst({
          where: { id: actorUserId, tenantId, isActive: true },
          select: { id: true, role: true },
        });
        if (!actor || !FINANCE_REVIEW_ROLES.has(actor.role)) {
          throw new ForbiddenException(
            'El usuario autenticado no puede confirmar radicaciones externas',
          );
        }

        const existing = await transaction.financialEntry.findFirst({
          where: { id: entryId, tenantId },
          select: FINANCIAL_ENTRY_VIEW_SELECT,
        });
        if (!existing) {
          throw new NotFoundException('Movimiento financiero no encontrado');
        }
        if (existing.status === FinanceStatus.REPORTED_CNE) {
          throw new ConflictException(
            'El movimiento ya tiene una radicación externa confirmada',
          );
        }
        if (existing.status !== FinanceStatus.APPROVED) {
          throw new BadRequestException(
            'Sólo un movimiento aprobado puede marcarse como radicado externamente',
          );
        }

        const cneReportedAt = new Date();
        const transition = await transaction.financialEntry.updateMany({
          where: {
            id: entryId,
            tenantId,
            status: FinanceStatus.APPROVED,
          },
          data: {
            status: FinanceStatus.REPORTED_CNE,
            cneReportedById: actorUserId,
            cneReportedAt,
            cneReportReference: dto.externalReference,
          },
        });
        if (transition.count !== 1) {
          throw new ConflictException(
            'El movimiento cambió mientras se confirmaba la radicación; actualiza la vista',
          );
        }

        const updated = await transaction.financialEntry.findFirst({
          where: { id: entryId, tenantId },
          select: FINANCIAL_ENTRY_VIEW_SELECT,
        });
        if (!updated) {
          throw new ConflictException(
            'No fue posible confirmar la radicación externa',
          );
        }

        await transaction.auditEvent.create({
          data: {
            tenantId,
            mode: PoliticalOperationMode.CAMPAIGN,
            actorType: AuditActorType.USER,
            actorUserId,
            action: 'CAMPAIGN_FINANCIAL_ENTRY_CNE_REPORTED',
            resourceType: 'FinancialEntry',
            resourceId: entryId,
            before: { status: existing.status },
            after: {
              status: updated.status,
              cneReportedAt: cneReportedAt.toISOString(),
            },
            metadata: { externalReference: dto.externalReference },
          },
        });

        return this.toFinancialEntryView(updated, actorUserId);
      }, SERIALIZABLE_OPTIONS);
    } catch (error) {
      this.rethrowSerializableConflict(error);
    }
  }

  private assertOwnedFinanceEvidence(tenantId: string, path: string): void {
    if (
      !isOwnedCanonicalStoragePath({
        tenantId,
        module: 'finance',
        path,
        allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'csv', 'xlsx'],
      })
    ) {
      throw new BadRequestException(
        'El soporte financiero debe ser una ruta privada confirmada del tenant autenticado.',
      );
    }
  }

  async generateCneReport(
    tenantId: string,
    actorUserId: string,
  ): Promise<string> {
    return this.prisma.$transaction(async (transaction) => {
      const tenant = await transaction.tenant.findUnique({
        where: { id: tenantId },
        select: CAMPAIGN_TENANT_SELECT,
      });
      assertCampaignTenant(tenant);

      const actor = await transaction.user.findFirst({
        where: { id: actorUserId, tenantId, isActive: true },
        select: { role: true },
      });
      if (!actor || !FINANCE_REPORT_EXPORT_ROLES.has(actor.role)) {
        throw new ForbiddenException(
          'El usuario no tiene acceso vigente para exportar finanzas',
        );
      }

      const expenses = await transaction.financialEntry.findMany({
        where: {
          tenantId,
          type: EntryType.EXPENSE,
          status: {
            in: [FinanceStatus.APPROVED, FinanceStatus.REPORTED_CNE],
          },
        },
        select: {
          date: true,
          description: true,
          amount: true,
          vendorName: true,
          vendorTaxId: true,
          cneCode: true,
          reporter: { select: { name: true } },
        },
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
      const csv = rows ? `${header}\n${rows}` : header;

      await transaction.auditEvent.create({
        data: {
          tenantId,
          mode: PoliticalOperationMode.CAMPAIGN,
          actorType: AuditActorType.USER,
          actorUserId,
          action: 'CAMPAIGN_CNE_REVIEW_DRAFT_EXPORTED',
          resourceType: 'CneReviewDraft',
          after: { status: 'GENERATED' },
          metadata: {
            format: 'CSV',
            recordCount: expenses.length,
            includedStatuses: [
              FinanceStatus.APPROVED,
              FinanceStatus.REPORTED_CNE,
            ],
          },
        },
      });

      return csv;
    });
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

  private toFinancialEntryView(
    entry: FinancialEntryViewSource,
    viewerId?: string,
  ) {
    return {
      id: entry.id,
      type: entry.type,
      amount: entry.amount,
      date: entry.date,
      cneCode: entry.cneCode,
      description: entry.description,
      vendorName: entry.vendorName,
      vendorTaxId: entry.vendorTaxId,
      status: entry.status,
      createdAt: entry.createdAt,
      reviewedAt: entry.reviewedAt,
      cneReportedAt: entry.cneReportedAt,
      cneReportReference: entry.cneReportReference,
      hasEvidence: Boolean(entry.evidenceUrl),
      reportedByMe: Boolean(viewerId && entry.reporterId === viewerId),
    };
  }

  private rethrowSerializableConflict(error: unknown): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2034'
    ) {
      throw new ConflictException(
        'La información financiera cambió durante la operación; actualiza e intenta de nuevo',
      );
    }
    throw error;
  }
}
