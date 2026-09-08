import { Prisma } from '../../prisma/generated/prisma';

export const FINANCE_COMPLIANCE_SELECT = {
  id: true,
  maxTotalBudget: true,
  maxPublicityLimit: true,
  electionName: true,
  electionDate: true,
  reportScope: true,
  officialLimitsReference: true,
  officialLimitsUrl: true,
  reportDeadline: true,
  financialManagerName: true,
  financialManagerDocument: true,
  accountantName: true,
  accountantDocument: true,
  uniqueAccountBank: true,
  uniqueAccountLastFour: true,
  cuentasClarasCode: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CampaignSettingsSelect;

export type FinanceComplianceSettings = Prisma.CampaignSettingsGetPayload<{
  select: typeof FINANCE_COMPLIANCE_SELECT;
}>;

export const FINANCE_COMPLIANCE_FIELD_LABELS = {
  settings: 'expediente financiero',
  maxTotalBudget: 'tope total',
  maxPublicityLimit: 'tope de publicidad exterior',
  electionName: 'nombre de la elección',
  electionDate: 'fecha de la elección',
  reportScope: 'alcance del informe',
  officialLimitsReference: 'referencia oficial de topes',
  officialLimitsUrl: 'enlace oficial de topes',
  reportDeadline: 'fecha límite del informe',
  financialManagerName: 'nombre del responsable financiero',
  financialManagerDocument: 'documento del responsable financiero',
  accountantName: 'nombre del contador',
  accountantDocument: 'documento del contador',
  uniqueAccountBank: 'entidad de la cuenta única',
  uniqueAccountLastFour: 'últimos cuatro dígitos de la cuenta única',
  cuentasClarasCode: 'código de Cuentas Claras',
} as const;

export type FinanceComplianceField =
  keyof typeof FINANCE_COMPLIANCE_FIELD_LABELS;

export type FinanceComplianceIssue =
  | 'REPORT_DEADLINE_NOT_AFTER_ELECTION'
  | 'OFFICIAL_LIMITS_URL_NOT_HTTPS';

export interface FinanceComplianceReadiness {
  ready: boolean;
  missingFields: FinanceComplianceField[];
  invalidFields: FinanceComplianceIssue[];
}

const REQUIRED_TEXT_FIELDS = [
  'electionName',
  'officialLimitsReference',
  'officialLimitsUrl',
  'financialManagerName',
  'financialManagerDocument',
  'accountantName',
  'accountantDocument',
  'uniqueAccountBank',
  'uniqueAccountLastFour',
  'cuentasClarasCode',
] as const satisfies readonly (keyof FinanceComplianceSettings)[];

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isHttpsUrl(value: string | null): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

export function getFinanceComplianceReadiness(
  settings: FinanceComplianceSettings | null,
): FinanceComplianceReadiness {
  if (!settings) {
    return {
      ready: false,
      missingFields: Object.keys(
        FINANCE_COMPLIANCE_FIELD_LABELS,
      ) as FinanceComplianceField[],
      invalidFields: [],
    };
  }

  const missingFields: FinanceComplianceField[] = [];
  for (const field of REQUIRED_TEXT_FIELDS) {
    if (!isNonEmptyText(settings[field])) missingFields.push(field);
  }
  if (!settings.electionDate) missingFields.push('electionDate');
  if (!settings.reportScope) missingFields.push('reportScope');
  if (!settings.reportDeadline) missingFields.push('reportDeadline');

  const invalidFields: FinanceComplianceIssue[] = [];
  if (
    settings.electionDate &&
    settings.reportDeadline &&
    settings.reportDeadline.getTime() <= settings.electionDate.getTime()
  ) {
    invalidFields.push('REPORT_DEADLINE_NOT_AFTER_ELECTION');
  }
  if (
    isNonEmptyText(settings.officialLimitsUrl) &&
    !isHttpsUrl(settings.officialLimitsUrl)
  ) {
    invalidFields.push('OFFICIAL_LIMITS_URL_NOT_HTTPS');
  }

  return {
    ready: missingFields.length === 0 && invalidFields.length === 0,
    missingFields,
    invalidFields,
  };
}

export function maskDocument(value: string | null): string | null {
  if (!isNonEmptyText(value)) return null;
  return `•••• ${value.trim().slice(-4)}`;
}

export function maskAccountLastFour(value: string | null): string | null {
  if (!isNonEmptyText(value)) return null;
  return `•••• ${value.trim().slice(-4)}`;
}
