import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('finance closeout schema and PostgreSQL controls', () => {
  const schema = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(
    resolve(
      'prisma/migrations/20260909260000_finance_report_closeout/migration.sql',
    ),
    'utf8',
  );
  const service = readFileSync(
    resolve('src/finance/finance-closeout.service.ts'),
    'utf8',
  );

  function model(name: string): string {
    const found = schema.match(
      new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`),
    )?.[0];
    if (!found) throw new Error(`Modelo financiero ausente: ${name}`);
    return found;
  }

  it.each([
    'FinanceReportDossier',
    'FinanceLedgerCut',
    'FinanceLedgerCutLine',
    'FinanceReportVersion',
    'FinanceReportApproval',
    'FinanceBankStatement',
    'FinanceBankStatementLine',
    'FinanceInKindContribution',
    'FinancePayable',
    'FinancePayableSettlement',
    'FinanceExternalFilingEvidence',
    'FinanceExternalFilingEvidenceReview',
    'FinanceCloseoutCommand',
  ])('%s is tenant-scoped with a composite identity', (name) => {
    expect(model(name)).toContain('tenantId');
    expect(model(name)).toContain('@@unique([id, tenantId])');
  });

  it('uses composite foreign keys for every operational relationship', () => {
    for (const name of [
      'FinanceReportDossier',
      'FinanceLedgerCut',
      'FinanceLedgerCutLine',
      'FinanceReportVersion',
      'FinanceReportApproval',
      'FinanceBankStatement',
      'FinanceBankStatementLine',
      'FinanceInKindContribution',
      'FinancePayable',
      'FinancePayableSettlement',
      'FinanceExternalFilingEvidence',
      'FinanceExternalFilingEvidenceReview',
      'FinanceCloseoutCommand',
    ]) {
      for (const line of model(name)
        .split('\n')
        .filter(
          (value) => value.includes('@relation(') && value.includes('fields:'),
        )) {
        if (/^\s*tenant\s/u.test(line)) continue;
        expect(line).toContain('tenantId]');
        expect(line).toContain('references: [id, tenantId]');
      }
    }
  });

  it('is additive, atomic and does not cascade-delete evidence', () => {
    expect(migration.trimStart()).toMatch(/^BEGIN;/u);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/u);
    expect(migration).not.toMatch(
      /DROP TABLE|DROP TYPE|DELETE FROM|TRUNCATE TABLE/iu,
    );
    expect(migration).not.toMatch(/ON DELETE CASCADE/iu);
  });

  it('physically seals all finance closeout records and rejects CLOSED inserts', () => {
    expect(migration).toContain('finance_closeout_reject_mutation');
    expect(migration).toContain('BEFORE UPDATE OR DELETE');
    expect(migration).toContain('BEFORE TRUNCATE');
    expect(migration).toContain('finance_closeout_assert_open_operation');
    expect(migration).toContain("current_stage = 'CLOSED'");
    expect(service).toContain('FOR UPDATE');
    expect(service).toContain('Prisma.TransactionIsolationLevel.Serializable');
  });

  it('enforces accounting direction, paired in-kind entries and payable ceiling', () => {
    expect(migration).toContain('FinanceBankStatementLine_amount_check');
    expect(migration).toContain('finance_bank_line_validate');
    expect(migration).toContain('finance_in_kind_validate');
    expect(migration).toContain('approved equal-value income and expense pair');
    expect(migration).toContain('finance_payable_settlement_validate');
    expect(migration).toContain('settled_total + NEW."amount"');
  });

  it('requires three incompatible roles and independent external review', () => {
    expect(migration).toContain('finance_report_approval_validate');
    expect(migration).toContain("actor_role <> 'CAMPAIGN_MANAGER'");
    expect(migration).toContain("actor_role <> 'FINANCE_MANAGER'");
    expect(migration).toContain("actor_role <> 'COMPLIANCE_OFFICER'");
    expect(migration).toContain('One person cannot occupy two report controls');
    expect(migration).toContain('approval_count <> 3');
    expect(migration).toContain("reviewer_role <> 'AUDITOR'");
  });

  it('stores only a reviewed external claim and never declares an API filing integration', () => {
    expect(service).toContain('officialPlatformVerified: false');
    expect(service).toContain('officialPlatformIntegration: false');
    expect(service).not.toMatch(/radicacionAutomatica|automaticFiling/iu);
  });
});
