import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  EntryType,
  FinanceApprovalControl,
  FinanceApprovalDecision,
  FinanceBankMatchStatus,
  FinanceCloseoutCommandType,
  FinanceExternalReviewDecision,
  FinanceReportKind,
  FinanceStatus,
  PoliticalOperationMode,
  PoliticalOperationStage,
  Prisma,
  Role,
  StorageObjectModule,
  StoredObjectStatus,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  assertCampaignTenant,
  CAMPAIGN_TENANT_SELECT,
} from '../common/utils/campaign-mode.util';
import { consumeConfirmedStorageUpload } from '../common/utils/confirmed-storage-upload.util';
import { isOwnedCanonicalStoragePath } from '../common/utils/tenant-storage-path.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  ApproveFinanceReportVersionDto,
  CreateFinanceBankStatementDto,
  CreateFinanceDossierDto,
  CreateFinanceInKindDto,
  CreateFinancePayableDto,
  CreateFinanceReportVersionDto,
  RecordFinanceExternalEvidenceDto,
  ReviewFinanceExternalEvidenceDto,
  SettleFinancePayableDto,
  type FinanceCloseoutCommandDto,
} from './dto/finance-closeout.dto';
import {
  computeFinanceCloseoutCommandSha256,
  type FinanceCloseoutCommandName,
} from './finance-closeout.hash';
import { getFinanceCloseoutReadiness } from './finance-closeout-readiness';

type Tx = Prisma.TransactionClient;
interface MutationContext {
  actor: { id: string; role: Role };
  profile: { id: string; stage: PoliticalOperationStage };
  tenant: { type: TenantType };
}
interface CommandResult<T> {
  resourceType: string;
  resourceId: string;
  result: T;
}

const READ_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.FINANCE_MANAGER,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
];
const PREPARER_ROLES: readonly Role[] = [
  Role.CAMPAIGN_MANAGER,
  Role.FINANCE_MANAGER,
];
const ACCOUNTING_ROLES: readonly Role[] = [Role.FINANCE_MANAGER];
const APPROVAL_ROLES: readonly Role[] = [
  Role.CAMPAIGN_MANAGER,
  Role.FINANCE_MANAGER,
  Role.COMPLIANCE_OFFICER,
];
const EVIDENCE_RECORD_ROLES: readonly Role[] = [
  Role.FINANCE_MANAGER,
  Role.COMPLIANCE_OFFICER,
];
const ACTIVE_FINANCE_STAGES: readonly PoliticalOperationStage[] = [
  PoliticalOperationStage.PRE_CAMPAIGN,
  PoliticalOperationStage.SIGNATURE_COLLECTION,
  PoliticalOperationStage.CAMPAIGN,
  PoliticalOperationStage.ELECTION_PREPARATION,
  PoliticalOperationStage.SIMULATION,
  PoliticalOperationStage.ELECTION_DAY,
  PoliticalOperationStage.POST_ELECTION,
];
const SERIALIZABLE_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 30_000,
} as const;

function dateOnly(value: string, field: string): Date {
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException(`${field} no es una fecha calendario valida`);
  }
  return parsed;
}

function dateTime(value: string, field: string): Date {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new BadRequestException(`${field} no es una fecha valida`);
  }
  return parsed;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function jsonSnapshot(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function decimal(value: number | string | Prisma.Decimal): Prisma.Decimal {
  return new Prisma.Decimal(String(value));
}

@Injectable()
export class FinanceCloseoutService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(user: AuthenticatedUser) {
    return this.prisma.$transaction(
      async (transaction) => {
        const context = await this.requireReadContext(transaction, user);
        const evaluatedAt = new Date();
        const [dossiers, statements, inKind, payables, closeoutReadiness] =
          await Promise.all([
            transaction.financeReportDossier.findMany({
              where: {
                tenantId: user.tenantId,
                operationProfileId: context.profile.id,
              },
              orderBy: [{ kind: 'asc' }, { subjectName: 'asc' }],
              include: {
                versions: {
                  orderBy: { versionNumber: 'desc' },
                  include: {
                    ledgerCut: true,
                    approvals: { orderBy: { createdAt: 'asc' } },
                    externalEvidence: { include: { review: true } },
                  },
                },
              },
              take: 100,
            }),
            transaction.financeBankStatement.findMany({
              where: {
                tenantId: user.tenantId,
                operationProfileId: context.profile.id,
              },
              orderBy: { periodStartsAt: 'asc' },
              include: { lines: { orderBy: { lineNumber: 'asc' }, take: 500 } },
              take: 100,
            }),
            transaction.financeInKindContribution.findMany({
              where: {
                tenantId: user.tenantId,
                operationProfileId: context.profile.id,
              },
              orderBy: { contributionDate: 'desc' },
              take: 100,
            }),
            transaction.financePayable.findMany({
              where: {
                tenantId: user.tenantId,
                operationProfileId: context.profile.id,
              },
              include: { settlements: { orderBy: { paidAt: 'asc' } } },
              orderBy: { dueAt: 'asc' },
              take: 100,
            }),
            getFinanceCloseoutReadiness(
              transaction,
              user.tenantId,
              context.profile.id,
              evaluatedAt,
            ),
          ]);

        const safeDossiers = dossiers.map((dossier) => ({
          id: dossier.id,
          kind: dossier.kind,
          subjectCode: dossier.subjectCode,
          subjectName: dossier.subjectName,
          createdAt: dossier.createdAt,
          versions: dossier.versions.map((version) =>
            this.toVersionView(version),
          ),
        }));
        const safeStatements = statements.map((statement) => ({
          id: statement.id,
          bankName: statement.bankName,
          accountMasked: `**** ${statement.accountLastFour}`,
          periodStartsAt: statement.periodStartsAt,
          periodEndsAt: statement.periodEndsAt,
          openingBalance: statement.openingBalance,
          closingBalance: statement.closingBalance,
          totalDebit: statement.totalDebit,
          totalCredit: statement.totalCredit,
          lineCount: statement.lineCount,
          unmatchedLineCount: statement.lines.filter(
            (line) => line.matchStatus === FinanceBankMatchStatus.UNMATCHED,
          ).length,
          excludedLineCount: statement.lines.filter(
            (line) => line.matchStatus === FinanceBankMatchStatus.EXCLUDED,
          ).length,
          lines: statement.lines.map((line) => ({
            id: line.id,
            lineNumber: line.lineNumber,
            occurredAt: line.occurredAt,
            bankReference: line.bankReference,
            description: line.description,
            debit: line.debit,
            credit: line.credit,
            matchStatus: line.matchStatus,
            matchedEntryId: line.matchedEntryId,
            exclusionReason: line.exclusionReason,
          })),
          statementSha256: statement.statementSha256,
          hasPrivateFile: true,
          createdAt: statement.createdAt,
        }));
        const safePayables = payables.map((payable) => {
          const settled = payable.settlements.reduce(
            (sum, item) => sum.plus(item.amount),
            decimal(0),
          );
          const outstanding = Prisma.Decimal.max(
            payable.originalAmount.minus(settled),
            0,
          );
          return {
            id: payable.id,
            creditorName: payable.creditorName,
            creditorTaxIdMasked: this.maskDocument(payable.creditorTaxId),
            description: payable.description,
            incurredAt: payable.incurredAt,
            dueAt: payable.dueAt,
            originalAmount: payable.originalAmount,
            settledAmount: settled,
            outstandingAmount: outstanding,
            status: outstanding.isZero()
              ? ('PAID' as const)
              : settled.isZero()
                ? ('OPEN' as const)
                : ('PARTIALLY_PAID' as const),
            hasPrivateFile: true,
          };
        });
        return {
          operationStage: context.profile.stage,
          readOnly: context.profile.stage === PoliticalOperationStage.CLOSED,
          legalStateNotice:
            'Este modulo prepara y controla expedientes internos. No se conecta, no transmite y no radica automaticamente ante el CNE ni Cuentas Claras.',
          readiness: {
            readyForCloseout: closeoutReadiness.readyForCloseout,
            evaluatedAt: closeoutReadiness.evaluatedAt,
            basis: closeoutReadiness.basis,
            blockers: closeoutReadiness.blockers,
          },
          summary: {
            dossierCount: closeoutReadiness.summary.dossierCount,
            dossierWithoutVersionCount:
              closeoutReadiness.summary.dossierWithoutVersionCount,
            bankStatementCount: closeoutReadiness.summary.bankStatementCount,
            inKindContributionCount: inKind.length,
            payableCount: safePayables.length,
            pendingEntryCount: closeoutReadiness.summary.pendingEntryCount,
            approvedUnreportedEntryCount:
              closeoutReadiness.summary.approvedUnreportedEntryCount,
            unreportedEntryCount:
              closeoutReadiness.summary.unreportedEntryCount,
            unmatchedBankLineCount:
              closeoutReadiness.summary.unmatchedBankLineCount,
            outstandingPayables: closeoutReadiness.summary.outstandingPayables,
          },
          dossiers: safeDossiers,
          bankStatements: safeStatements,
          inKindContributions: inKind.map((item) => ({
            id: item.id,
            contributorName: item.contributorName,
            contributorDocumentMasked: this.maskDocument(
              item.contributorDocument,
            ),
            contributionDate: item.contributionDate,
            description: item.description,
            value: item.value,
            valuationMethod: item.valuationMethod,
            valuationSourceReference: item.valuationSourceReference,
            valuationSha256: item.valuationSha256,
            hasPrivateFile: true,
          })),
          payables: safePayables,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async createDossier(user: AuthenticatedUser, dto: CreateFinanceDossierDto) {
    if (
      (dto.kind === FinanceReportKind.CONSOLIDATED &&
        dto.subjectCode !== 'CONSOLIDATED') ||
      (dto.kind === FinanceReportKind.CANDIDATE &&
        dto.subjectCode === 'CONSOLIDATED')
    ) {
      throw new BadRequestException(
        'El codigo de sujeto no corresponde al tipo de expediente',
      );
    }
    return this.executeCommand(
      user,
      FinanceCloseoutCommandType.DOSSIER_CREATE,
      dto,
      PREPARER_ROLES,
      `dossier:${dto.kind}:${dto.subjectCode}`,
      async (transaction, context) => {
        if (
          dto.kind === FinanceReportKind.CANDIDATE &&
          context.tenant.type !== TenantType.CANDIDACY
        ) {
          throw new ConflictException(
            'Un informe individual de candidatura exige un tenant de candidatura',
          );
        }
        const id = randomUUID();
        const dossier = await transaction.financeReportDossier.create({
          data: {
            id,
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
            kind: dto.kind,
            subjectCode: dto.subjectCode,
            subjectName: dto.subjectName,
            createdById: context.actor.id,
          },
        });
        return {
          resourceType: 'FinanceReportDossier',
          resourceId: id,
          result: {
            id: dossier.id,
            kind: dossier.kind,
            subjectCode: dossier.subjectCode,
            subjectName: dossier.subjectName,
            createdAt: dossier.createdAt,
          },
        };
      },
    );
  }

  async createBankStatement(
    user: AuthenticatedUser,
    dto: CreateFinanceBankStatementDto,
  ) {
    const periodStartsAt = dateOnly(dto.periodStartsAt, 'periodStartsAt');
    const periodEndsAt = dateOnly(dto.periodEndsAt, 'periodEndsAt');
    if (periodEndsAt < periodStartsAt)
      throw new BadRequestException('El periodo del extracto esta invertido');
    if (
      new Set(dto.lines.map((line) => line.lineNumber)).size !==
      dto.lines.length
    )
      throw new BadRequestException(
        'Los numeros de linea del extracto se repiten',
      );
    const totalDebit = dto.lines.reduce(
      (sum, line) => sum.plus(decimal(line.debit)),
      decimal(0),
    );
    const totalCredit = dto.lines.reduce(
      (sum, line) => sum.plus(decimal(line.credit)),
      decimal(0),
    );
    const expectedClosing = decimal(dto.openingBalance)
      .plus(totalCredit)
      .minus(totalDebit);
    if (!expectedClosing.equals(decimal(dto.closingBalance))) {
      throw new BadRequestException(
        'El saldo final no coincide con saldo inicial mas creditos menos debitos',
      );
    }
    for (const line of dto.lines) this.assertBankLineShape(line, dto);
    this.assertFinancePath(user.tenantId, dto.storagePath);

    return this.executeCommand(
      user,
      FinanceCloseoutCommandType.BANK_STATEMENT_CREATE,
      dto,
      ACCOUNTING_ROLES,
      `bank:${dto.accountLastFour}:${dto.periodStartsAt}:${dto.periodEndsAt}`,
      async (transaction, context) => {
        const storage = await this.requireConfirmedStorage(
          transaction,
          user,
          dto.storagePath,
          dto.statementSha256,
        );
        const id = randomUUID();
        const statement = await transaction.financeBankStatement.create({
          data: {
            id,
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
            storageObjectId: storage.id,
            bankName: dto.bankName,
            accountLastFour: dto.accountLastFour,
            periodStartsAt,
            periodEndsAt,
            openingBalance: decimal(dto.openingBalance),
            closingBalance: decimal(dto.closingBalance),
            totalDebit,
            totalCredit,
            lineCount: dto.lines.length,
            statementSha256: dto.statementSha256,
            createdById: context.actor.id,
          },
        });
        await transaction.financeBankStatementLine.createMany({
          data: dto.lines.map((line) => ({
            id: randomUUID(),
            tenantId: user.tenantId,
            bankStatementId: id,
            lineNumber: line.lineNumber,
            occurredAt: dateOnly(line.occurredAt, 'occurredAt'),
            bankReference: line.bankReference,
            description: line.description,
            debit: decimal(line.debit),
            credit: decimal(line.credit),
            matchStatus: line.matchStatus,
            matchedEntryId: line.matchedEntryId,
            exclusionReason: line.exclusionReason,
          })),
        });
        await consumeConfirmedStorageUpload(
          transaction,
          user.tenantId,
          dto.storagePath,
          StorageObjectModule.FINANCE,
          'FinanceBankStatement',
          id,
          user.userId,
          { expectedSha256: dto.statementSha256 },
        );
        return {
          resourceType: 'FinanceBankStatement',
          resourceId: id,
          result: {
            id: statement.id,
            bankName: statement.bankName,
            accountMasked: `**** ${statement.accountLastFour}`,
            periodStartsAt: statement.periodStartsAt,
            periodEndsAt: statement.periodEndsAt,
            lineCount: statement.lineCount,
            unmatchedLineCount: dto.lines.filter(
              (line) => line.matchStatus === FinanceBankMatchStatus.UNMATCHED,
            ).length,
            statementSha256: statement.statementSha256,
            hasPrivateFile: true,
          },
        };
      },
    );
  }

  async createInKind(user: AuthenticatedUser, dto: CreateFinanceInKindDto) {
    this.assertFinancePath(user.tenantId, dto.storagePath);
    return this.executeCommand(
      user,
      FinanceCloseoutCommandType.IN_KIND_CREATE,
      dto,
      ACCOUNTING_ROLES,
      `in-kind:${dto.incomeEntryId}:${dto.expenseEntryId}`,
      async (transaction, context) => {
        const storage = await this.requireConfirmedStorage(
          transaction,
          user,
          dto.storagePath,
          dto.valuationSha256,
        );
        const id = randomUUID();
        const item = await transaction.financeInKindContribution.create({
          data: {
            id,
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
            incomeEntryId: dto.incomeEntryId,
            expenseEntryId: dto.expenseEntryId,
            storageObjectId: storage.id,
            contributorName: dto.contributorName,
            contributorDocument: dto.contributorDocument,
            contributionDate: dateOnly(
              dto.contributionDate,
              'contributionDate',
            ),
            description: dto.description,
            value: decimal(dto.value),
            valuationMethod: dto.valuationMethod,
            valuationSourceReference: dto.valuationSourceReference,
            valuationSha256: dto.valuationSha256,
            createdById: context.actor.id,
          },
        });
        await consumeConfirmedStorageUpload(
          transaction,
          user.tenantId,
          dto.storagePath,
          StorageObjectModule.FINANCE,
          'FinanceInKindContribution',
          id,
          user.userId,
          { expectedSha256: dto.valuationSha256 },
        );
        return {
          resourceType: 'FinanceInKindContribution',
          resourceId: id,
          result: {
            id: item.id,
            contributorName: item.contributorName,
            contributorDocumentMasked: this.maskDocument(
              item.contributorDocument,
            ),
            contributionDate: item.contributionDate,
            value: item.value,
            valuationSha256: item.valuationSha256,
            hasPrivateFile: true,
          },
        };
      },
    );
  }

  async createPayable(user: AuthenticatedUser, dto: CreateFinancePayableDto) {
    const incurredAt = dateOnly(dto.incurredAt, 'incurredAt');
    const dueAt = dateOnly(dto.dueAt, 'dueAt');
    if (dueAt < incurredAt)
      throw new BadRequestException(
        'El vencimiento no puede preceder al gasto',
      );
    this.assertFinancePath(user.tenantId, dto.storagePath);
    return this.executeCommand(
      user,
      FinanceCloseoutCommandType.PAYABLE_CREATE,
      dto,
      ACCOUNTING_ROLES,
      `payable:${dto.expenseEntryId}`,
      async (transaction, context) => {
        const storage = await this.requireConfirmedStorage(
          transaction,
          user,
          dto.storagePath,
          dto.supportSha256,
        );
        const id = randomUUID();
        const payable = await transaction.financePayable.create({
          data: {
            id,
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
            expenseEntryId: dto.expenseEntryId,
            storageObjectId: storage.id,
            creditorName: dto.creditorName,
            creditorTaxId: dto.creditorTaxId,
            description: dto.description,
            incurredAt,
            dueAt,
            originalAmount: decimal(dto.originalAmount),
            createdById: context.actor.id,
          },
        });
        await consumeConfirmedStorageUpload(
          transaction,
          user.tenantId,
          dto.storagePath,
          StorageObjectModule.FINANCE,
          'FinancePayable',
          id,
          user.userId,
          { expectedSha256: dto.supportSha256 },
        );
        return {
          resourceType: 'FinancePayable',
          resourceId: id,
          result: {
            id: payable.id,
            creditorName: payable.creditorName,
            creditorTaxIdMasked: this.maskDocument(payable.creditorTaxId),
            originalAmount: payable.originalAmount,
            outstandingAmount: payable.originalAmount,
            dueAt: payable.dueAt,
            status: 'OPEN' as const,
            hasPrivateFile: true,
          },
        };
      },
    );
  }

  async settlePayable(
    user: AuthenticatedUser,
    payableId: string,
    dto: SettleFinancePayableDto,
  ) {
    this.assertFinancePath(user.tenantId, dto.storagePath);
    return this.executeCommand(
      user,
      FinanceCloseoutCommandType.PAYABLE_SETTLE,
      { ...dto, payableId },
      ACCOUNTING_ROLES,
      `payable:${payableId}`,
      async (transaction, context) => {
        const payable = await transaction.financePayable.findFirst({
          where: {
            id: payableId,
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
          },
          include: { settlements: { select: { amount: true } } },
        });
        if (!payable)
          throw new NotFoundException('Cuenta por pagar no encontrada');
        const paid = payable.settlements.reduce(
          (sum, item) => sum.plus(item.amount),
          decimal(0),
        );
        const outstanding = payable.originalAmount.minus(paid);
        if (decimal(dto.amount).greaterThan(outstanding))
          throw new ConflictException('El abono supera el saldo pendiente');
        const storage = await this.requireConfirmedStorage(
          transaction,
          user,
          dto.storagePath,
          dto.supportSha256,
        );
        const id = randomUUID();
        const settlement = await transaction.financePayableSettlement.create({
          data: {
            id,
            tenantId: user.tenantId,
            payableId,
            bankStatementLineId: dto.bankStatementLineId,
            storageObjectId: storage.id,
            amount: decimal(dto.amount),
            paidAt: dateOnly(dto.paidAt, 'paidAt'),
            paymentReference: dto.paymentReference,
            createdById: context.actor.id,
          },
        });
        await consumeConfirmedStorageUpload(
          transaction,
          user.tenantId,
          dto.storagePath,
          StorageObjectModule.FINANCE,
          'FinancePayableSettlement',
          id,
          user.userId,
          { expectedSha256: dto.supportSha256 },
        );
        const remaining = outstanding.minus(settlement.amount);
        return {
          resourceType: 'FinancePayableSettlement',
          resourceId: id,
          result: {
            id: settlement.id,
            payableId,
            amount: settlement.amount,
            paidAt: settlement.paidAt,
            paymentReference: settlement.paymentReference,
            outstandingAmount: remaining,
            status: remaining.isZero() ? 'PAID' : 'PARTIALLY_PAID',
            hasPrivateFile: true,
          },
        };
      },
    );
  }

  async createReportVersion(
    user: AuthenticatedUser,
    dossierId: string,
    dto: CreateFinanceReportVersionDto,
  ) {
    const periodStartsAt = dateOnly(dto.periodStartsAt, 'periodStartsAt');
    const periodEndsAt = dateOnly(dto.periodEndsAt, 'periodEndsAt');
    if (periodEndsAt < periodStartsAt)
      throw new BadRequestException('El periodo del informe esta invertido');

    return this.executeCommand(
      user,
      FinanceCloseoutCommandType.REPORT_VERSION_CREATE,
      { ...dto, dossierId },
      PREPARER_ROLES,
      `dossier:${dossierId}`,
      async (transaction, context) => {
        const dossier = await transaction.financeReportDossier.findFirst({
          where: {
            id: dossierId,
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
          },
        });
        if (!dossier)
          throw new NotFoundException('Expediente financiero no encontrado');
        const previous = await transaction.financeReportVersion.findFirst({
          where: { tenantId: user.tenantId, dossierId },
          orderBy: { versionNumber: 'desc' },
          select: { id: true, versionNumber: true },
        });
        if (
          (!previous && (dto.basedOnVersionId || dto.correctionReason)) ||
          (previous &&
            (dto.basedOnVersionId !== previous.id || !dto.correctionReason))
        ) {
          throw new ConflictException(
            previous
              ? 'La correccion debe basarse en la version vigente e indicar motivo'
              : 'La primera version no puede declararse como correccion',
          );
        }
        const cutoffAt = new Date();
        const pendingCount = await transaction.financialEntry.count({
          where: {
            tenantId: user.tenantId,
            date: { gte: periodStartsAt, lte: periodEndsAt },
            createdAt: { lte: cutoffAt },
            status: FinanceStatus.PENDING,
          },
        });
        if (pendingCount > 0)
          throw new ConflictException(
            `No se puede cortar el libro con ${pendingCount} movimientos pendientes`,
          );
        const entries = await transaction.financialEntry.findMany({
          where: {
            tenantId: user.tenantId,
            date: { gte: periodStartsAt, lte: periodEndsAt },
            createdAt: { lte: cutoffAt },
            status: {
              in: [FinanceStatus.APPROVED, FinanceStatus.REPORTED_CNE],
            },
          },
          orderBy: [{ date: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            type: true,
            status: true,
            amount: true,
            date: true,
            cneCode: true,
            description: true,
            vendorName: true,
            vendorTaxId: true,
            evidenceUrl: true,
          },
        });
        if (entries.length === 0)
          throw new ConflictException(
            'No hay movimientos aprobados dentro del periodo del informe',
          );
        const cutLines = entries.map((entry) => ({
          financialEntryId: entry.id,
          entryType: entry.type,
          entryStatus: entry.status,
          amount: entry.amount.toFixed(2),
          entryDate: entry.date.toISOString().slice(0, 10),
          cneCode: entry.cneCode,
          descriptionSha256: sha256(entry.description.trim()),
          counterpartySha256: sha256(
            `${entry.vendorName.trim()}|${entry.vendorTaxId.trim()}`,
          ),
          evidencePresent: Boolean(entry.evidenceUrl),
        }));
        const totalIncome = entries
          .filter((entry) => entry.type === EntryType.INCOME)
          .reduce((sum, entry) => sum.plus(entry.amount), decimal(0));
        const totalExpense = entries
          .filter((entry) => entry.type === EntryType.EXPENSE)
          .reduce((sum, entry) => sum.plus(entry.amount), decimal(0));
        const ledgerSha256 = sha256(JSON.stringify(cutLines));
        const cutId = randomUUID();
        await transaction.financeLedgerCut.create({
          data: {
            id: cutId,
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
            dossierId,
            periodStartsAt,
            periodEndsAt,
            cutoffAt,
            entryCount: entries.length,
            totalIncome,
            totalExpense,
            balance: totalIncome.minus(totalExpense),
            ledgerSha256,
            createdById: context.actor.id,
          },
        });
        await transaction.financeLedgerCutLine.createMany({
          data: entries.map((entry, index) => ({
            id: randomUUID(),
            tenantId: user.tenantId,
            ledgerCutId: cutId,
            financialEntryId: entry.id,
            entryType: entry.type,
            entryStatus: entry.status,
            amount: entry.amount,
            entryDate: entry.date,
            cneCode: entry.cneCode,
            descriptionSha256: cutLines[index].descriptionSha256,
            counterpartySha256: cutLines[index].counterpartySha256,
            evidencePresent: Boolean(entry.evidenceUrl),
          })),
        });
        const versionId = randomUUID();
        const version = await transaction.financeReportVersion.create({
          data: {
            id: versionId,
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
            dossierId,
            ledgerCutId: cutId,
            basedOnVersionId: dto.basedOnVersionId,
            versionNumber: (previous?.versionNumber ?? 0) + 1,
            correctionReason: dto.correctionReason,
            preparationNote: dto.preparationNote,
            createdById: context.actor.id,
          },
          include: {
            ledgerCut: true,
            approvals: true,
            externalEvidence: { include: { review: true } },
          },
        });
        return {
          resourceType: 'FinanceReportVersion',
          resourceId: versionId,
          result: this.toVersionView(version),
        };
      },
    );
  }

  async approveReportVersion(
    user: AuthenticatedUser,
    versionId: string,
    dto: ApproveFinanceReportVersionDto,
  ) {
    return this.executeCommand(
      user,
      FinanceCloseoutCommandType.REPORT_APPROVAL_RECORD,
      { ...dto, versionId },
      APPROVAL_ROLES,
      `version:${versionId}`,
      async (transaction, context) => {
        const version = await transaction.financeReportVersion.findFirst({
          where: {
            id: versionId,
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
          },
          include: { ledgerCut: true, approvals: true },
        });
        if (!version)
          throw new NotFoundException('Version financiera no encontrada');
        const latest = await transaction.financeReportVersion.findFirst({
          where: { tenantId: user.tenantId, dossierId: version.dossierId },
          orderBy: { versionNumber: 'desc' },
          select: { id: true },
        });
        if (latest?.id !== version.id)
          throw new ConflictException(
            'Solo puede revisarse la version vigente',
          );
        if (version.createdById === context.actor.id)
          throw new ForbiddenException(
            'Quien preparo la version no puede aprobar su propio corte',
          );
        const control = this.controlForRole(context.actor.role);
        if (version.approvals.some((approval) => approval.control === control))
          throw new ConflictException('Este control ya fue registrado');
        if (
          version.approvals.some(
            (approval) =>
              approval.decision ===
              FinanceApprovalDecision.RETURN_FOR_CORRECTION,
          )
        )
          throw new ConflictException(
            'La version fue devuelta y esta sellada; cree una correccion',
          );
        if (dto.decision === FinanceApprovalDecision.APPROVE) {
          const blockers = await this.versionReadinessBlockers(
            transaction,
            user.tenantId,
            context.profile.id,
            version.ledgerCut,
          );
          if (blockers.length > 0)
            throw new ConflictException({
              code: 'FINANCE_REPORT_NOT_READY',
              message:
                'La version no supera la conciliacion previa a aprobacion',
              blockers,
            });
        }
        const approval = await transaction.financeReportApproval.create({
          data: {
            id: randomUUID(),
            tenantId: user.tenantId,
            reportVersionId: version.id,
            control,
            decision: dto.decision,
            rationale: dto.rationale,
            actorUserId: context.actor.id,
          },
        });
        return {
          resourceType: 'FinanceReportApproval',
          resourceId: approval.id,
          result: {
            id: approval.id,
            reportVersionId: approval.reportVersionId,
            control: approval.control,
            decision: approval.decision,
            rationale: approval.rationale,
            createdAt: approval.createdAt,
          },
        };
      },
    );
  }

  async recordExternalEvidence(
    user: AuthenticatedUser,
    versionId: string,
    dto: RecordFinanceExternalEvidenceDto,
  ) {
    this.assertFinancePath(user.tenantId, dto.storagePath);
    return this.executeCommand(
      user,
      FinanceCloseoutCommandType.EXTERNAL_EVIDENCE_RECORD,
      { ...dto, versionId },
      EVIDENCE_RECORD_ROLES,
      `version:${versionId}`,
      async (transaction, context) => {
        if (context.profile.stage !== PoliticalOperationStage.POST_ELECTION)
          throw new ConflictException(
            'La evidencia externa solo se registra durante la etapa poselectoral',
          );
        const version = await transaction.financeReportVersion.findFirst({
          where: {
            id: versionId,
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
          },
          include: { approvals: true, ledgerCut: true },
        });
        if (!version)
          throw new NotFoundException('Version financiera no encontrada');
        if (
          version.approvals.length !== 3 ||
          version.approvals.some(
            (approval) => approval.decision !== FinanceApprovalDecision.APPROVE,
          )
        )
          throw new ConflictException(
            'Faltan aprobaciones independientes de gerencia, contador y cumplimiento',
          );
        const blockers = await this.versionReadinessBlockers(
          transaction,
          user.tenantId,
          context.profile.id,
          version.ledgerCut,
        );
        if (blockers.length > 0)
          throw new ConflictException({
            code: 'FINANCE_REPORT_NOT_READY',
            message: 'La version dejo de estar conciliada',
            blockers,
          });
        const storage = await this.requireConfirmedStorage(
          transaction,
          user,
          dto.storagePath,
          dto.evidenceSha256,
        );
        const id = randomUUID();
        const evidence = await transaction.financeExternalFilingEvidence.create(
          {
            data: {
              id,
              tenantId: user.tenantId,
              operationProfileId: context.profile.id,
              reportVersionId: version.id,
              storageObjectId: storage.id,
              authorityName: dto.authorityName,
              channel: dto.channel,
              externalReference: dto.externalReference,
              submittedAt: dateTime(dto.submittedAt, 'submittedAt'),
              evidenceSha256: dto.evidenceSha256,
              recordedById: context.actor.id,
            },
          },
        );
        await consumeConfirmedStorageUpload(
          transaction,
          user.tenantId,
          dto.storagePath,
          StorageObjectModule.FINANCE,
          'FinanceExternalFilingEvidence',
          id,
          user.userId,
          { expectedSha256: dto.evidenceSha256 },
        );
        return {
          resourceType: 'FinanceExternalFilingEvidence',
          resourceId: id,
          result: {
            id: evidence.id,
            reportVersionId: evidence.reportVersionId,
            authorityName: evidence.authorityName,
            channel: evidence.channel,
            externalReference: evidence.externalReference,
            submittedAt: evidence.submittedAt,
            evidenceSha256: evidence.evidenceSha256,
            reviewStatus: 'PENDING' as const,
            hasPrivateFile: true,
            officialPlatformVerified: false,
          },
        };
      },
    );
  }

  async reviewExternalEvidence(
    user: AuthenticatedUser,
    evidenceId: string,
    dto: ReviewFinanceExternalEvidenceDto,
  ) {
    return this.executeCommand(
      user,
      FinanceCloseoutCommandType.EXTERNAL_EVIDENCE_REVIEW,
      { ...dto, evidenceId },
      [Role.AUDITOR],
      `external-evidence:${evidenceId}`,
      async (transaction, context) => {
        const evidence =
          await transaction.financeExternalFilingEvidence.findFirst({
            where: {
              id: evidenceId,
              tenantId: user.tenantId,
              operationProfileId: context.profile.id,
            },
            include: {
              review: true,
              reportVersion: {
                include: { ledgerCut: { include: { lines: true } } },
              },
            },
          });
        if (!evidence)
          throw new NotFoundException('Evidencia externa no encontrada');
        if (evidence.review)
          throw new ConflictException('La evidencia externa ya fue revisada');
        if (evidence.recordedById === context.actor.id)
          throw new ForbiddenException(
            'Quien registro la evidencia no puede revisarla',
          );
        const review =
          await transaction.financeExternalFilingEvidenceReview.create({
            data: {
              id: randomUUID(),
              tenantId: user.tenantId,
              evidenceId,
              decision: dto.decision,
              reviewNote: dto.reviewNote,
              reviewedById: context.actor.id,
            },
          });
        let coveredEntryCount = 0;
        if (dto.decision === FinanceExternalReviewDecision.APPROVE) {
          const entryIds = evidence.reportVersion.ledgerCut.lines.map(
            (line) => line.financialEntryId,
          );
          const transition = await transaction.financialEntry.updateMany({
            where: {
              tenantId: user.tenantId,
              id: { in: entryIds },
              status: FinanceStatus.APPROVED,
            },
            data: {
              status: FinanceStatus.REPORTED_CNE,
              cneReportedById: context.actor.id,
              cneReportedAt: review.createdAt,
              cneReportReference: evidence.externalReference,
            },
          });
          coveredEntryCount = transition.count;
        }
        return {
          resourceType: 'FinanceExternalFilingEvidenceReview',
          resourceId: review.id,
          result: {
            id: review.id,
            evidenceId: review.evidenceId,
            decision: review.decision,
            reviewNote: review.reviewNote,
            reviewedAt: review.createdAt,
            coveredEntryCount,
            officialPlatformVerified: false,
          },
        };
      },
    );
  }

  private async executeCommand<I extends FinanceCloseoutCommandDto & object, T>(
    user: AuthenticatedUser,
    type: FinanceCloseoutCommandType,
    input: I,
    roles: readonly Role[],
    resourceLock: string,
    operation: (
      transaction: Tx,
      context: MutationContext,
    ) => Promise<CommandResult<T>>,
  ): Promise<T> {
    const expectedHash = computeFinanceCloseoutCommandSha256(
      type as FinanceCloseoutCommandName,
      input,
    );
    if (input.payloadSha256 !== expectedHash)
      throw new BadRequestException({
        code: 'FINANCE_CLOSEOUT_PAYLOAD_HASH_MISMATCH',
        message: 'La huella canonica del comando no coincide',
        expectedPayloadSha256: expectedHash,
      });

    const execute = () =>
      this.prisma.$transaction(async (transaction) => {
        const context = await this.requireMutationContext(
          transaction,
          user,
          roles,
        );
        await transaction.$queryRaw<Array<{ locked: boolean }>>(
          Prisma.sql`
            WITH finance_resource_lock AS MATERIALIZED (
              SELECT pg_advisory_xact_lock(
                hashtextextended(${`finance-closeout:${user.tenantId}:${resourceLock}`}, 0)
              )
            )
            SELECT TRUE AS "locked" FROM finance_resource_lock
          `,
        );
        const replay = await transaction.financeCloseoutCommand.findUnique({
          where: {
            tenantId_clientRequestId: {
              tenantId: user.tenantId,
              clientRequestId: input.clientRequestId,
            },
          },
        });
        if (replay) {
          if (
            replay.type !== type ||
            replay.payloadSha256 !== input.payloadSha256 ||
            replay.actorUserId !== context.actor.id
          )
            throw new ConflictException(
              'El UUID del comando ya fue usado con otro contenido, tipo o actor',
            );
          return replay.resultSnapshot as T;
        }
        const result = await operation(transaction, context);
        await transaction.financeCloseoutCommand.create({
          data: {
            id: randomUUID(),
            tenantId: user.tenantId,
            clientRequestId: input.clientRequestId,
            payloadSha256: input.payloadSha256,
            type,
            actorUserId: context.actor.id,
            resourceType: result.resourceType,
            resourceId: result.resourceId,
            resultSnapshot: jsonSnapshot(result.result),
          },
        });
        await transaction.auditEvent.create({
          data: {
            tenantId: user.tenantId,
            mode: PoliticalOperationMode.CAMPAIGN,
            actorType: AuditActorType.USER,
            actorUserId: context.actor.id,
            action: `FINANCE_CLOSEOUT_${type}`,
            resourceType: result.resourceType,
            resourceId: result.resourceId,
            metadata: {
              clientRequestId: input.clientRequestId,
              payloadSha256: input.payloadSha256,
              operationStage: context.profile.stage,
              officialPlatformIntegration: false,
            },
          },
        });
        return result.result;
      }, SERIALIZABLE_OPTIONS);

    try {
      return await execute();
    } catch (error) {
      if (this.isPrismaError(error, 'P2002')) {
        try {
          return await execute();
        } catch (replayError) {
          this.rethrowConcurrency(replayError);
        }
      }
      this.rethrowConcurrency(error);
    }
  }

  private async requireMutationContext(
    transaction: Tx,
    user: AuthenticatedUser,
    roles: readonly Role[],
  ): Promise<MutationContext> {
    await transaction.$queryRaw<Array<{ locked: boolean }>>(
      Prisma.sql`
        WITH finance_lifecycle_lock AS MATERIALIZED (
          SELECT pg_advisory_xact_lock(
            hashtextextended(${`operation-profile-lifecycle:${user.tenantId}`}, 0)
          )
        )
        SELECT TRUE AS "locked" FROM finance_lifecycle_lock
      `,
    );
    await transaction.$queryRaw(
      Prisma.sql`SELECT "id" FROM "OperationProfile" WHERE "tenantId" = ${user.tenantId} FOR UPDATE`,
    );
    const [tenant, actor, profile] = await Promise.all([
      transaction.tenant.findUnique({
        where: { id: user.tenantId },
        select: CAMPAIGN_TENANT_SELECT,
      }),
      transaction.user.findFirst({
        where: {
          id: user.userId,
          tenantId: user.tenantId,
          isActive: true,
          role: { in: [...roles] },
        },
        select: { id: true, role: true },
      }),
      transaction.operationProfile.findUnique({
        where: { tenantId: user.tenantId },
        select: { id: true, stage: true },
      }),
    ]);
    assertCampaignTenant(tenant);
    if (!actor)
      throw new ForbiddenException(
        'El usuario vigente no tiene el rol financiero requerido',
      );
    if (!profile)
      throw new ConflictException(
        'Configure el perfil operativo antes de gestionar el cierre financiero',
      );
    if (profile.stage === PoliticalOperationStage.CLOSED)
      throw new ConflictException({
        code: 'OPERATION_CLOSED',
        message: 'La operacion cerrada conserva finanzas en solo lectura',
      });
    if (!ACTIVE_FINANCE_STAGES.includes(profile.stage))
      throw new ConflictException({
        code: 'FINANCE_STAGE_BLOCKED',
        message: `El cierre financiero no admite mutaciones durante ${profile.stage}`,
      });
    return { actor, profile, tenant: { type: tenant.type } };
  }

  private async requireReadContext(transaction: Tx, user: AuthenticatedUser) {
    const [tenant, actor, profile] = await Promise.all([
      transaction.tenant.findUnique({
        where: { id: user.tenantId },
        select: CAMPAIGN_TENANT_SELECT,
      }),
      transaction.user.findFirst({
        where: {
          id: user.userId,
          tenantId: user.tenantId,
          isActive: true,
          role: { in: [...READ_ROLES] },
        },
        select: { id: true, role: true },
      }),
      transaction.operationProfile.findUnique({
        where: { tenantId: user.tenantId },
        select: { id: true, stage: true },
      }),
    ]);
    assertCampaignTenant(tenant);
    if (!actor)
      throw new ForbiddenException(
        'El usuario vigente no puede consultar el cierre financiero',
      );
    if (!profile)
      throw new ConflictException(
        'Configure el perfil operativo antes de consultar el cierre financiero',
      );
    return { actor, profile };
  }

  private async requireConfirmedStorage(
    transaction: Tx,
    user: AuthenticatedUser,
    path: string,
    expectedSha256?: string,
  ) {
    const storage = await transaction.storedObject.findFirst({
      where: {
        tenantId: user.tenantId,
        uploaderId: user.userId,
        path,
        module: StorageObjectModule.FINANCE,
        status: StoredObjectStatus.CONFIRMED,
        consumedAt: null,
        ...(expectedSha256
          ? {
              expectedSha256,
              reportedSha256: expectedSha256,
            }
          : {}),
      },
      select: { id: true },
    });
    if (!storage)
      throw new BadRequestException(
        'El archivo financiero debe estar confirmado, sin usar, haber sido subido por el actor y conservar el SHA declarado cuando aplique',
      );
    return storage;
  }

  private assertFinancePath(tenantId: string, path: string) {
    if (
      !isOwnedCanonicalStoragePath({
        tenantId,
        module: 'finance',
        path,
        allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'csv', 'xlsx'],
      })
    )
      throw new BadRequestException(
        'La ruta debe pertenecer al modulo financiero del tenant autenticado',
      );
  }

  private assertBankLineShape(
    line: CreateFinanceBankStatementDto['lines'][number],
    statement: CreateFinanceBankStatementDto,
  ) {
    const debit = decimal(line.debit);
    const credit = decimal(line.credit);
    if (
      !(
        (debit.greaterThan(0) && credit.isZero()) ||
        (credit.greaterThan(0) && debit.isZero())
      )
    )
      throw new BadRequestException(
        `La linea ${line.lineNumber} debe tener debito o credito, pero no ambos`,
      );
    const occurredAt = dateOnly(line.occurredAt, 'occurredAt');
    if (
      occurredAt < dateOnly(statement.periodStartsAt, 'periodStartsAt') ||
      occurredAt > dateOnly(statement.periodEndsAt, 'periodEndsAt')
    )
      throw new BadRequestException(
        `La linea ${line.lineNumber} esta fuera del periodo`,
      );
    if (
      (line.matchStatus === FinanceBankMatchStatus.MATCHED &&
        (!line.matchedEntryId || line.exclusionReason)) ||
      (line.matchStatus === FinanceBankMatchStatus.UNMATCHED &&
        (line.matchedEntryId || line.exclusionReason)) ||
      (line.matchStatus === FinanceBankMatchStatus.EXCLUDED &&
        (line.matchedEntryId || !line.exclusionReason))
    )
      throw new BadRequestException(
        `La conciliacion de la linea ${line.lineNumber} es incoherente`,
      );
  }

  private async versionReadinessBlockers(
    transaction: Tx,
    tenantId: string,
    operationProfileId: string,
    cut: {
      id: string;
      periodStartsAt: Date;
      periodEndsAt: Date;
      cutoffAt: Date;
      entryCount: number;
    },
  ) {
    const [linesWithoutEvidence, statements, payables, currentEntries] =
      await Promise.all([
        transaction.financeLedgerCutLine.count({
          where: {
            tenantId,
            ledgerCutId: cut.id,
            evidencePresent: false,
          },
        }),
        transaction.financeBankStatement.findMany({
          where: {
            tenantId,
            operationProfileId,
            periodEndsAt: { gte: cut.periodStartsAt },
            periodStartsAt: { lte: cut.periodEndsAt },
          },
          orderBy: { periodStartsAt: 'asc' },
          include: { lines: { select: { matchStatus: true } } },
        }),
        transaction.financePayable.findMany({
          where: {
            tenantId,
            operationProfileId,
            incurredAt: { lte: cut.periodEndsAt },
          },
          select: {
            originalAmount: true,
            settlements: { select: { amount: true } },
          },
        }),
        transaction.financialEntry.count({
          where: {
            tenantId,
            date: { gte: cut.periodStartsAt, lte: cut.periodEndsAt },
            createdAt: { lte: cut.cutoffAt },
            status: {
              in: [FinanceStatus.APPROVED, FinanceStatus.REPORTED_CNE],
            },
          },
        }),
      ]);
    const blockers: Array<{ code: string; detail: string }> = [];
    if (currentEntries !== cut.entryCount)
      blockers.push({
        code: 'LEDGER_CUT_SOURCE_CHANGED',
        detail:
          'El conjunto de movimientos aprobados ya no coincide con el corte.',
      });
    if (linesWithoutEvidence > 0)
      blockers.push({
        code: 'LEDGER_LINES_WITHOUT_EVIDENCE',
        detail: `${linesWithoutEvidence} lineas del corte no tienen soporte privado.`,
      });
    if (statements.length === 0)
      blockers.push({
        code: 'BANK_PERIOD_NOT_COVERED',
        detail: 'No existe cobertura bancaria para el periodo del corte.',
      });
    else {
      let coveredThrough = cut.periodStartsAt;
      for (const statement of statements) {
        if (
          statement.periodStartsAt.getTime() >
          coveredThrough.getTime() + 86_400_000
        )
          break;
        if (statement.periodEndsAt > coveredThrough)
          coveredThrough = statement.periodEndsAt;
      }
      if (
        statements[0].periodStartsAt > cut.periodStartsAt ||
        coveredThrough < cut.periodEndsAt
      )
        blockers.push({
          code: 'BANK_PERIOD_GAP',
          detail: 'Los extractos no cubren el periodo completo sin vacios.',
        });
      const unmatched = statements
        .flatMap((statement) => statement.lines)
        .filter(
          (line) => line.matchStatus === FinanceBankMatchStatus.UNMATCHED,
        ).length;
      if (unmatched > 0)
        blockers.push({
          code: 'UNMATCHED_BANK_LINES',
          detail: `${unmatched} lineas bancarias siguen sin conciliar.`,
        });
    }
    const outstanding = payables.reduce(
      (total, payable) =>
        total.plus(
          payable.originalAmount.minus(
            payable.settlements.reduce(
              (paid, settlement) => paid.plus(settlement.amount),
              decimal(0),
            ),
          ),
        ),
      decimal(0),
    );
    if (outstanding.greaterThan(0))
      blockers.push({
        code: 'OPEN_PAYABLES',
        detail: `Hay ${outstanding.toFixed(2)} COP pendientes en cuentas por pagar.`,
      });
    return blockers;
  }

  private controlForRole(role: Role): FinanceApprovalControl {
    if (role === Role.CAMPAIGN_MANAGER)
      return FinanceApprovalControl.CAMPAIGN_MANAGER;
    if (role === Role.FINANCE_MANAGER) return FinanceApprovalControl.ACCOUNTANT;
    if (role === Role.COMPLIANCE_OFFICER)
      return FinanceApprovalControl.COMPLIANCE;
    throw new ForbiddenException(
      'El rol no corresponde a un control aprobador',
    );
  }

  private toVersionView(version: {
    id: string;
    versionNumber: number;
    basedOnVersionId: string | null;
    correctionReason: string | null;
    preparationNote: string;
    createdAt: Date;
    ledgerCut: {
      periodStartsAt: Date;
      periodEndsAt: Date;
      cutoffAt: Date;
      entryCount: number;
      totalIncome: Prisma.Decimal;
      totalExpense: Prisma.Decimal;
      balance: Prisma.Decimal;
      ledgerSha256: string;
    };
    approvals: Array<{
      control: FinanceApprovalControl;
      decision: FinanceApprovalDecision;
      rationale: string;
      createdAt: Date;
    }>;
    externalEvidence: null | {
      id: string;
      authorityName: string;
      channel: string;
      externalReference: string;
      submittedAt: Date;
      evidenceSha256: string;
      review: null | {
        decision: FinanceExternalReviewDecision;
        createdAt: Date;
      };
    };
  }) {
    const hasReturn = version.approvals.some(
      (approval) =>
        approval.decision === FinanceApprovalDecision.RETURN_FOR_CORRECTION,
    );
    const approvedControls = version.approvals.filter(
      (approval) => approval.decision === FinanceApprovalDecision.APPROVE,
    );
    return {
      id: version.id,
      versionNumber: version.versionNumber,
      basedOnVersionId: version.basedOnVersionId,
      correctionReason: version.correctionReason,
      preparationNote: version.preparationNote,
      createdAt: version.createdAt,
      internalStatus: hasReturn
        ? ('RETURNED_FOR_CORRECTION' as const)
        : approvedControls.length === 3
          ? ('APPROVED_INTERNAL' as const)
          : approvedControls.length > 0
            ? ('IN_REVIEW' as const)
            : ('DRAFT' as const),
      approvals: version.approvals.map((approval) => ({
        control: approval.control,
        decision: approval.decision,
        rationale: approval.rationale,
        createdAt: approval.createdAt,
      })),
      ledgerCut: version.ledgerCut,
      externalEvidenceStatus: version.externalEvidence?.review
        ? version.externalEvidence.review.decision ===
          FinanceExternalReviewDecision.APPROVE
          ? ('APPROVED' as const)
          : ('REJECTED' as const)
        : version.externalEvidence
          ? ('PENDING_REVIEW' as const)
          : ('NOT_RECORDED' as const),
      externalEvidence: version.externalEvidence
        ? {
            id: version.externalEvidence.id,
            authorityName: version.externalEvidence.authorityName,
            channel: version.externalEvidence.channel,
            externalReference: version.externalEvidence.externalReference,
            submittedAt: version.externalEvidence.submittedAt,
            evidenceSha256: version.externalEvidence.evidenceSha256,
            hasPrivateFile: true,
            officialPlatformVerified: false,
          }
        : null,
    };
  }

  private maskDocument(value: string): string {
    const lastFour = value.replace(/\s/gu, '').slice(-4);
    return `**** ${lastFour}`;
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === code
    );
  }

  private rethrowConcurrency(error: unknown): never {
    if (this.isPrismaError(error, 'P2034'))
      throw new ConflictException(
        'El expediente financiero cambio al mismo tiempo; recargue e intente de nuevo',
      );
    if (this.isPrismaError(error, 'P2002'))
      throw new ConflictException(
        'El comando o control ya existe; recargue para reconciliar el resultado',
      );
    throw error;
  }
}
