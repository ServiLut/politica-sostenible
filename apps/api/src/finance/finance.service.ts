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
  FinanceReportScope,
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
import { lockAndAssertOperationOpen } from '../common/utils/operation-lifecycle-fence.util';
import {
  getFinanceSettingsCoherenceError,
  UpsertFinanceSettingsDto,
} from './dto/upsert-finance-settings.dto';
import { ReviewFinancialEntryDto } from './dto/review-financial-entry.dto';
import { MarkCneReportedDto } from './dto/mark-cne-reported.dto';
import {
  FINANCE_COMPLIANCE_FIELD_LABELS,
  FINANCE_COMPLIANCE_SELECT,
  type FinanceComplianceSettings,
  getFinanceComplianceReadiness,
  maskAccountLastFour,
  maskDocument,
} from './finance-compliance';

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

const FINANCE_SETTINGS_ROLES = new Set<Role>([
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.FINANCE_MANAGER,
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
  cneReportEvidenceUrl: true,
  evidenceUrl: true,
  reporterId: true,
} satisfies Prisma.FinancialEntrySelect;

type FinancialEntryViewSource = Prisma.FinancialEntryGetPayload<{
  select: typeof FINANCIAL_ENTRY_VIEW_SELECT;
}>;

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  async create(
    tenantId: string,
    reporterId: string,
    data: CreateFinancialEntryDto,
  ) {
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
        await lockAndAssertOperationOpen(transaction, tenantId);
        const [tenant, reporter, settings] = await Promise.all([
          transaction.tenant.findUnique({
            where: { id: tenantId },
            select: CAMPAIGN_TENANT_SELECT,
          }),
          transaction.user.findFirst({
            where: { id: reporterId, tenantId, isActive: true },
            select: { id: true },
          }),
          transaction.campaignSettings.findUnique({
            where: { tenantId },
            select: FINANCE_COMPLIANCE_SELECT,
          }),
        ]);
        assertCampaignTenant(tenant);

        if (!reporter) {
          throw new ForbiddenException(
            'El usuario autenticado no pertenece a esta campaña',
          );
        }
        this.assertFinanceComplianceReady(settings);

        // Los topes varían por elección. Nunca se usa un valor legal ficticio.
        if (data.type === EntryType.EXPENSE) {
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
            const currentPublicity = await transaction.financialEntry.aggregate(
              {
                where: {
                  tenantId,
                  type: EntryType.EXPENSE,
                  cneCode: 'PUBLICIDAD_VALLAS',
                  status: { not: FinanceStatus.REJECTED },
                },
                _sum: { amount: true },
              },
            );
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
      select: FINANCE_COMPLIANCE_SELECT,
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
      compliance: this.toFinanceComplianceSummary(settings),
    };
  }

  async getSettings(tenantId: string, actorUserId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const [tenant, actor, settings] = await Promise.all([
        transaction.tenant.findUnique({
          where: { id: tenantId },
          select: CAMPAIGN_TENANT_SELECT,
        }),
        transaction.user.findFirst({
          where: { id: actorUserId, tenantId, isActive: true },
          select: { role: true },
        }),
        transaction.campaignSettings.findUnique({
          where: { tenantId },
          select: FINANCE_COMPLIANCE_SELECT,
        }),
      ]);
      assertCampaignTenant(tenant);
      if (!actor || !FINANCE_SETTINGS_ROLES.has(actor.role)) {
        throw new ForbiddenException(
          'El usuario no tiene acceso vigente al expediente financiero',
        );
      }

      return {
        configured: Boolean(settings),
        readiness: getFinanceComplianceReadiness(settings),
        settings: settings ? this.toFinanceSettingsView(settings) : null,
      };
    });
  }

  async updateSettings(
    tenantId: string,
    actorUserId: string,
    dto: UpsertFinanceSettingsDto,
  ) {
    this.assertValidSettings(dto);
    const maxTotalBudget = new Prisma.Decimal(String(dto.maxTotalBudget));
    const maxPublicityLimit = new Prisma.Decimal(String(dto.maxPublicityLimit));
    const officialLimitsUrl = new URL(dto.officialLimitsUrl.trim()).toString();
    const settingsData = {
      maxTotalBudget,
      maxPublicityLimit,
      electionName: dto.electionName.trim(),
      electionDate: new Date(dto.electionDate),
      reportScope: dto.reportScope,
      officialLimitsReference: dto.officialLimitsReference.trim(),
      officialLimitsUrl,
      reportDeadline: new Date(dto.reportDeadline),
      financialManagerName: dto.financialManagerName.trim(),
      financialManagerDocument: dto.financialManagerDocument.trim(),
      accountantName: dto.accountantName.trim(),
      accountantDocument: dto.accountantDocument.trim(),
      uniqueAccountBank: dto.uniqueAccountBank.trim(),
      uniqueAccountLastFour: dto.uniqueAccountLastFour.trim(),
      cuentasClarasCode: dto.cuentasClarasCode.trim(),
    };

    try {
      return await this.prisma.$transaction(async (transaction) => {
        await lockAndAssertOperationOpen(transaction, tenantId);
        const [tenant, actor] = await Promise.all([
          transaction.tenant.findUnique({
            where: { id: tenantId },
            select: CAMPAIGN_TENANT_SELECT,
          }),
          transaction.user.findFirst({
            where: { id: actorUserId, tenantId, isActive: true },
            select: { id: true, role: true },
          }),
        ]);
        assertCampaignTenant(tenant);

        if (!actor || !FINANCE_SETTINGS_ROLES.has(actor.role)) {
          throw new ForbiddenException(
            'El usuario autenticado no puede configurar el expediente financiero',
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
          select: FINANCE_COMPLIANCE_SELECT,
        });
        const settings = await transaction.campaignSettings.upsert({
          where: { tenantId },
          update: settingsData,
          create: { tenantId, ...settingsData },
          select: FINANCE_COMPLIANCE_SELECT,
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

        return this.toFinanceSettingsView(settings);
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
        await lockAndAssertOperationOpen(transaction, tenantId);
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
        if (dto.status === FinanceStatus.APPROVED) {
          if (!existing.evidenceUrl) {
            throw new BadRequestException(
              'No se puede aprobar un movimiento financiero sin soporte',
            );
          }

          const settings = await transaction.campaignSettings.findUnique({
            where: { tenantId },
            select: FINANCE_COMPLIANCE_SELECT,
          });
          this.assertFinanceComplianceReady(settings);
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
    this.assertOwnedFinanceEvidence(tenantId, dto.cneReportEvidenceUrl);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        await lockAndAssertOperationOpen(transaction, tenantId);
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
            'El usuario autenticado no puede anotar referencias externas',
          );
        }

        const settings = await transaction.campaignSettings.findUnique({
          where: { tenantId },
          select: FINANCE_COMPLIANCE_SELECT,
        });
        this.assertFinanceComplianceReady(settings);

        const existing = await transaction.financialEntry.findFirst({
          where: { id: entryId, tenantId },
          select: FINANCIAL_ENTRY_VIEW_SELECT,
        });
        if (!existing) {
          throw new NotFoundException('Movimiento financiero no encontrado');
        }
        if (existing.status === FinanceStatus.REPORTED_CNE) {
          throw new ConflictException(
            'El movimiento ya tiene una referencia externa declarada',
          );
        }
        if (existing.status !== FinanceStatus.APPROVED) {
          throw new BadRequestException(
            'Solo un movimiento aprobado puede recibir una referencia externa',
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
            cneReportEvidenceUrl: dto.cneReportEvidenceUrl,
          },
        });
        if (transition.count !== 1) {
          throw new ConflictException(
            'El movimiento cambió mientras se guardaba la referencia; actualiza la vista',
          );
        }

        await consumeConfirmedStorageUpload(
          transaction,
          tenantId,
          dto.cneReportEvidenceUrl,
          StorageObjectModule.FINANCE,
          'FinancialEntryCneReportEvidence',
          entryId,
          actorUserId,
        );

        const updated = await transaction.financialEntry.findFirst({
          where: { id: entryId, tenantId },
          select: FINANCIAL_ENTRY_VIEW_SELECT,
        });
        if (!updated) {
          throw new ConflictException(
            'No fue posible guardar la referencia externa',
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
            metadata: {
              externalReference: dto.externalReference,
              evidenceType: 'USER_DECLARED_EXTERNAL_FILING',
              hasCneReportEvidence: true,
              platformVerified: false,
            },
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
      // The export appends an audit record, so it is a mutation even though
      // the HTTP response is a download. Serialize it with the controller's
      // CLOSED policy exactly like the other finance writes.
      await lockAndAssertOperationOpen(transaction, tenantId);
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

      const settings = await transaction.campaignSettings.findUnique({
        where: { tenantId },
        select: FINANCE_COMPLIANCE_SELECT,
      });
      this.assertFinanceComplianceReady(settings);

      const entries = await transaction.financialEntry.findMany({
        where: {
          tenantId,
          status: {
            in: [FinanceStatus.APPROVED, FinanceStatus.REPORTED_CNE],
          },
        },
        select: {
          type: true,
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
        'Tipo',
        'Fecha',
        'Concepto',
        'Monto',
        'Contraparte',
        'Identificación de contraparte',
        'Categoría interna',
        'Responsable',
      ]);
      const rows = entries
        .map((entry) =>
          buildCsvRow([
            entry.type === EntryType.INCOME ? 'Ingreso' : 'Gasto',
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
            recordCount: entries.length,
            includedTypes: [EntryType.INCOME, EntryType.EXPENSE],
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
    const coherenceError = getFinanceSettingsCoherenceError(dto);
    const requiredText = [
      dto.electionName,
      dto.officialLimitsReference,
      dto.officialLimitsUrl,
      dto.financialManagerName,
      dto.financialManagerDocument,
      dto.accountantName,
      dto.accountantDocument,
      dto.uniqueAccountBank,
      dto.uniqueAccountLastFour,
      dto.cuentasClarasCode,
    ];
    let officialUrlIsValid = false;
    try {
      const officialUrl = new URL(dto.officialLimitsUrl);
      officialUrlIsValid =
        officialUrl.protocol === 'https:' && Boolean(officialUrl.hostname);
    } catch {
      officialUrlIsValid = false;
    }

    if (
      !Number.isFinite(dto.maxTotalBudget) ||
      !Number.isFinite(dto.maxPublicityLimit) ||
      dto.maxTotalBudget <= 0 ||
      dto.maxPublicityLimit <= 0 ||
      dto.maxTotalBudget > maximum ||
      Boolean(coherenceError) ||
      !Number.isFinite(Date.parse(dto.electionDate)) ||
      !Number.isFinite(Date.parse(dto.reportDeadline)) ||
      !Object.values(FinanceReportScope).includes(dto.reportScope) ||
      requiredText.some(
        (value) => typeof value !== 'string' || value.trim().length === 0,
      ) ||
      !officialUrlIsValid ||
      !/^\d{4}$/.test(dto.uniqueAccountLastFour)
    ) {
      throw new BadRequestException(
        coherenceError ?? 'El expediente financiero es inválido o incompleto',
      );
    }
  }

  private financeSettingsAuditSnapshot(
    settings: FinanceComplianceSettings,
  ): Prisma.InputJsonObject {
    const readiness = getFinanceComplianceReadiness(settings);
    return {
      maxTotalBudget: settings.maxTotalBudget.toString(),
      maxPublicityLimit: settings.maxPublicityLimit.toString(),
      electionDate: settings.electionDate?.toISOString() ?? null,
      reportScope: settings.reportScope,
      reportDeadline: settings.reportDeadline?.toISOString() ?? null,
      officialLimitsConfigured: Boolean(
        settings.officialLimitsReference && settings.officialLimitsUrl,
      ),
      financialManagerConfigured: Boolean(
        settings.financialManagerName && settings.financialManagerDocument,
      ),
      accountantConfigured: Boolean(
        settings.accountantName && settings.accountantDocument,
      ),
      uniqueAccountConfigured: Boolean(
        settings.uniqueAccountBank && settings.uniqueAccountLastFour,
      ),
      cuentasClarasConfigured: Boolean(settings.cuentasClarasCode),
      ready: readiness.ready,
    };
  }

  private assertFinanceComplianceReady(
    settings: FinanceComplianceSettings | null,
  ): asserts settings is FinanceComplianceSettings {
    const readiness = getFinanceComplianceReadiness(settings);
    if (readiness.ready) return;

    const missing = readiness.missingFields
      .map((field) => FINANCE_COMPLIANCE_FIELD_LABELS[field])
      .join(', ');
    const invalid = readiness.invalidFields.length
      ? ' Hay fechas o enlaces oficiales inconsistentes.'
      : '';
    const missingDetail = missing ? `: ${missing}.` : '.';
    throw new ForbiddenException(
      `No se puede operar finanzas hasta completar el expediente electoral${missingDetail}${invalid}`,
    );
  }

  private toFinanceComplianceSummary(
    settings: FinanceComplianceSettings | null,
  ) {
    const readiness = getFinanceComplianceReadiness(settings);
    return {
      ...readiness,
      electionName: settings?.electionName ?? null,
      electionDate: settings?.electionDate ?? null,
      reportScope: settings?.reportScope ?? null,
      officialLimitsReference: settings?.officialLimitsReference ?? null,
      officialLimitsUrl: settings?.officialLimitsUrl ?? null,
      reportDeadline: settings?.reportDeadline ?? null,
      financialManagerConfigured: Boolean(
        settings?.financialManagerName && settings.financialManagerDocument,
      ),
      accountantConfigured: Boolean(
        settings?.accountantName && settings.accountantDocument,
      ),
      uniqueAccountBank: settings?.uniqueAccountBank ?? null,
      uniqueAccountMasked: maskAccountLastFour(
        settings?.uniqueAccountLastFour ?? null,
      ),
      cuentasClarasConfigured: Boolean(settings?.cuentasClarasCode),
    };
  }

  private toFinanceSettingsView(settings: FinanceComplianceSettings) {
    return {
      id: settings.id,
      maxTotalBudget: settings.maxTotalBudget.toNumber(),
      maxPublicityLimit: settings.maxPublicityLimit.toNumber(),
      electionName: settings.electionName,
      electionDate: settings.electionDate,
      reportScope: settings.reportScope,
      officialLimitsReference: settings.officialLimitsReference,
      officialLimitsUrl: settings.officialLimitsUrl,
      reportDeadline: settings.reportDeadline,
      financialManagerName: settings.financialManagerName,
      financialManagerDocumentMasked: maskDocument(
        settings.financialManagerDocument,
      ),
      accountantName: settings.accountantName,
      accountantDocumentMasked: maskDocument(settings.accountantDocument),
      uniqueAccountBank: settings.uniqueAccountBank,
      uniqueAccountLastFour: settings.uniqueAccountLastFour,
      cuentasClarasCode: settings.cuentasClarasCode,
      readiness: getFinanceComplianceReadiness(settings),
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
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
      hasCneReportEvidence: Boolean(entry.cneReportEvidenceUrl),
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
