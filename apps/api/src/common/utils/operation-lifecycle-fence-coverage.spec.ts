import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type ServiceFenceContract = Readonly<{
  file: string;
  firstFencedTransactions: number;
}>;

const SERVICE_FENCE_CONTRACTS: readonly ServiceFenceContract[] = [
  { file: 'campaign/campaign.service.ts', firstFencedTransactions: 2 },
  { file: 'cases/cases.service.ts', firstFencedTransactions: 2 },
  { file: 'commitments/commitments.service.ts', firstFencedTransactions: 2 },
  {
    file: 'communications/communications.service.ts',
    firstFencedTransactions: 2,
  },
  {
    file: 'electoral-catalog/electoral-catalog.service.ts',
    firstFencedTransactions: 3,
  },
  {
    file: 'electoral-catalog/electoral-catalog-import.service.ts',
    firstFencedTransactions: 3,
  },
  { file: 'events/events.service.ts', firstFencedTransactions: 4 },
  { file: 'finance/finance.service.ts', firstFencedTransactions: 5 },
  { file: 'import/import.service.ts', firstFencedTransactions: 1 },
  { file: 'interactions/interactions.service.ts', firstFencedTransactions: 2 },
  { file: 'logistics/logistics.service.ts', firstFencedTransactions: 1 },
  { file: 'proposals/proposals.service.ts', firstFencedTransactions: 3 },
  { file: 'tasks/tasks.service.ts', firstFencedTransactions: 2 },
  { file: 'voter/voter.service.ts', firstFencedTransactions: 2 },
];

const FIRST_TRANSACTION_OPERATION_FENCE =
  /\$transaction\(\s*async \((?:transaction|tx)\) => \{\s*await lockAndAssert(?:Campaign)?OperationOpen/gu;

function source(file: string): string {
  return readFileSync(resolve('src', file), 'utf8');
}

function withoutLineComments(value: string): string {
  return value.replace(/^\s*\/\/.*$/gmu, '');
}

describe('operation lifecycle fence coverage', () => {
  it.each(SERVICE_FENCE_CONTRACTS)(
    '$file starts all $firstFencedTransactions inventoried mutation transactions with the lifecycle fence',
    ({ file, firstFencedTransactions }) => {
      const matches = withoutLineComments(source(file)).match(
        FIRST_TRANSACTION_OPERATION_FENCE,
      );

      expect(matches).toHaveLength(firstFencedTransactions);
    },
  );

  it('revalidates the catalog worker when claiming and again in the transaction that stages entries', () => {
    const worker = withoutLineComments(
      source('electoral-catalog/electoral-catalog-import.service.ts'),
    );
    const catalog = withoutLineComments(
      source('electoral-catalog/electoral-catalog.service.ts'),
    );

    expect(worker).toMatch(
      /const claim = await this\.prisma\.\$transaction\(async \(transaction\) => \{\s*await lockAndAssertOperationOpen\(transaction, tenantId\);\s*const current/gu,
    );
    expect(catalog).toMatch(
      /stageRnecTreeContent[\s\S]*?return this\.prisma\.\$transaction\(async \(transaction\) => \{\s*await lockAndAssertOperationOpen\(transaction, user\.tenantId\);\s*const actor/gu,
    );
  });

  it('keeps consent revocation outside the campaign closure fence', () => {
    const voter = source('voter/voter.service.ts');
    const interactions = source('interactions/interactions.service.ts');
    const voterRevocation = voter.slice(
      voter.indexOf('async revokeConsent('),
      voter.indexOf('async grantConsent('),
    );
    const caseRevocation = interactions.slice(
      interactions.indexOf('async revokeCaseConsent('),
      interactions.indexOf('private async assertReadTargets('),
    );

    expect(voterRevocation).not.toContain('lockAndAssertOperationOpen(');
    expect(caseRevocation).not.toContain('lockAndAssertCampaignOperationOpen(');
  });
});
