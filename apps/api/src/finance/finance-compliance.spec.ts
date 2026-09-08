import { FinanceReportScope, Prisma } from '../../prisma/generated/prisma';
import {
  type FinanceComplianceSettings,
  getFinanceComplianceReadiness,
  maskAccountLastFour,
  maskDocument,
} from './finance-compliance';

function completeSettings(
  overrides: Partial<FinanceComplianceSettings> = {},
): FinanceComplianceSettings {
  return {
    id: 'settings-a',
    maxTotalBudget: new Prisma.Decimal('1000000'),
    maxPublicityLimit: new Prisma.Decimal('250000'),
    electionName: 'Elecciones territoriales 2027',
    electionDate: new Date('2027-10-31T00:00:00.000Z'),
    reportScope: FinanceReportScope.CANDIDATE,
    officialLimitsReference: 'Resolución CNE 0001 de 2027',
    officialLimitsUrl: 'https://www.cne.gov.co/resoluciones/0001',
    reportDeadline: new Date('2027-11-30T00:00:00.000Z'),
    financialManagerName: 'Gerencia financiera',
    financialManagerDocument: '1234567890',
    accountantName: 'Contador responsable',
    accountantDocument: '9876543210',
    uniqueAccountBank: 'Banco autorizado',
    uniqueAccountLastFour: '1234',
    cuentasClarasCode: 'CC-CANDIDATO-001',
    createdAt: new Date('2026-09-07T00:00:00.000Z'),
    updatedAt: new Date('2026-09-07T00:00:00.000Z'),
    ...overrides,
  };
}

describe('finance compliance readiness', () => {
  it('is ready only when every election-specific field is present and coherent', () => {
    expect(getFinanceComplianceReadiness(completeSettings())).toEqual({
      ready: true,
      missingFields: [],
      invalidFields: [],
    });
  });

  it('identifies incomplete legacy settings without inventing defaults', () => {
    const readiness = getFinanceComplianceReadiness(
      completeSettings({
        electionName: null,
        accountantDocument: null,
        uniqueAccountLastFour: null,
      }),
    );

    expect(readiness.ready).toBe(false);
    expect(readiness.missingFields).toEqual(
      expect.arrayContaining([
        'electionName',
        'accountantDocument',
        'uniqueAccountLastFour',
      ]),
    );
  });

  it('rejects an insecure source URL and a deadline that is not after election day', () => {
    const readiness = getFinanceComplianceReadiness(
      completeSettings({
        officialLimitsUrl: 'http://example.test/topes',
        reportDeadline: new Date('2027-10-31T00:00:00.000Z'),
      }),
    );

    expect(readiness).toEqual(
      expect.objectContaining({
        ready: false,
        invalidFields: [
          'REPORT_DEADLINE_NOT_AFTER_ELECTION',
          'OFFICIAL_LIMITS_URL_NOT_HTTPS',
        ],
      }),
    );
  });

  it('masks identity and bank suffixes with a fixed disclosure format', () => {
    expect(maskDocument('1234567890')).toBe('•••• 7890');
    expect(maskAccountLastFour('1234')).toBe('•••• 1234');
    expect(maskDocument(null)).toBeNull();
  });
});
