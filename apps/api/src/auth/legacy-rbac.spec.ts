import {
  ExecutionContext,
  ForbiddenException,
  type Type,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../prisma/generated/prisma';
import { CampaignController } from '../campaign/campaign.controller';
import { FinanceController } from '../finance/finance.controller';
import { LogisticsController } from '../logistics/logistics.controller';
import { StorageController } from '../storage/storage.controller';
import { VoterController } from '../voter/voter.controller';
import { WitnessController } from '../witness/witness.controller';
import type { AuthenticatedRequest } from './interfaces/authenticated-user.interface';
import { ROLES_KEY } from './decorators/roles.decorator';
import { RolesGuard } from './guards/roles.guard';

interface RbacCase {
  label: string;
  controller: Type<unknown>;
  method: string;
  allowed: Role;
  denied: Role;
}

const cases: RbacCase[] = [
  {
    label: 'voter create',
    controller: VoterController,
    method: 'create',
    allowed: Role.VOLUNTEER,
    denied: Role.WITNESS,
  },
  {
    label: 'voter list',
    controller: VoterController,
    method: 'findAll',
    allowed: Role.AUDITOR,
    denied: Role.VOLUNTEER,
  },
  {
    label: 'voter stats',
    controller: VoterController,
    method: 'getStats',
    allowed: Role.COMPLIANCE_OFFICER,
    denied: Role.WITNESS,
  },
  {
    label: 'finance create',
    controller: FinanceController,
    method: 'create',
    allowed: Role.FINANCE_MANAGER,
    denied: Role.AUDITOR,
  },
  {
    label: 'finance list',
    controller: FinanceController,
    method: 'findAll',
    allowed: Role.AUDITOR,
    denied: Role.WITNESS,
  },
  {
    label: 'finance summary',
    controller: FinanceController,
    method: 'getSummary',
    allowed: Role.COMPLIANCE_OFFICER,
    denied: Role.VOLUNTEER,
  },
  {
    label: 'finance external validation',
    controller: FinanceController,
    method: 'validateExpense',
    allowed: Role.CAMPAIGN_MANAGER,
    denied: Role.COMPLIANCE_OFFICER,
  },
  {
    label: 'finance settings update',
    controller: FinanceController,
    method: 'updateSettings',
    allowed: Role.FINANCE_MANAGER,
    denied: Role.AUDITOR,
  },
  {
    label: 'finance export',
    controller: FinanceController,
    method: 'getCneReport',
    allowed: Role.AUDITOR,
    denied: Role.ZONE_COORDINATOR,
  },
  {
    label: 'witness create',
    controller: WitnessController,
    method: 'create',
    allowed: Role.WITNESS,
    denied: Role.VOLUNTEER,
  },
  {
    label: 'witness list',
    controller: WitnessController,
    method: 'findAll',
    allowed: Role.AUDITOR,
    denied: Role.VOLUNTEER,
  },
  {
    label: 'logistics E-14 sync',
    controller: LogisticsController,
    method: 'syncE14',
    allowed: Role.ZONE_COORDINATOR,
    denied: Role.VOLUNTEER,
  },
  {
    label: 'logistics voter sync',
    controller: LogisticsController,
    method: 'syncVoter',
    allowed: Role.VOLUNTEER,
    denied: Role.WITNESS,
  },
  {
    label: 'campaign initialization',
    controller: CampaignController,
    method: 'init',
    allowed: Role.ADMIN,
    denied: Role.CAMPAIGN_MANAGER,
  },
  {
    label: 'campaign divisions',
    controller: CampaignController,
    method: 'findDivisions',
    allowed: Role.ZONE_COORDINATOR,
    denied: Role.FINANCE_MANAGER,
  },
  {
    label: 'current campaign',
    controller: CampaignController,
    method: 'findCurrent',
    allowed: Role.FINANCE_MANAGER,
    denied: Role.CASE_WORKER,
  },
];

const VOTER_WRITE = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.ZONE_COORDINATOR,
  Role.VOLUNTEER,
];
const VOTER_READ = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
  Role.ZONE_COORDINATOR,
];
const FINANCE_WRITE = [Role.ADMIN, Role.CAMPAIGN_MANAGER, Role.FINANCE_MANAGER];
const FINANCE_READ = [...FINANCE_WRITE, Role.COMPLIANCE_OFFICER, Role.AUDITOR];
const WITNESS_WRITE = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.ZONE_COORDINATOR,
  Role.WITNESS,
];

const exactCases: Array<[string, Type<unknown>, string, readonly Role[]]> = [
  ['voter create', VoterController, 'create', VOTER_WRITE],
  ['voter list', VoterController, 'findAll', VOTER_READ],
  ['voter stats', VoterController, 'getStats', VOTER_READ],
  [
    'voter consent revoke',
    VoterController,
    'revokeConsent',
    [Role.ADMIN, Role.CAMPAIGN_MANAGER, Role.COMPLIANCE_OFFICER],
  ],
  ['finance create', FinanceController, 'create', FINANCE_WRITE],
  ['finance list', FinanceController, 'findAll', FINANCE_READ],
  ['finance summary', FinanceController, 'getSummary', FINANCE_READ],
  ['finance validation', FinanceController, 'validateExpense', FINANCE_WRITE],
  ['finance settings', FinanceController, 'updateSettings', FINANCE_WRITE],
  ['finance export', FinanceController, 'getCneReport', FINANCE_READ],
  ['witness create', WitnessController, 'create', WITNESS_WRITE],
  [
    'witness list',
    WitnessController,
    'findAll',
    [...WITNESS_WRITE, Role.AUDITOR],
  ],
  ['logistics E-14', LogisticsController, 'syncE14', WITNESS_WRITE],
  ['logistics voter', LogisticsController, 'syncVoter', VOTER_WRITE],
  ['campaign init', CampaignController, 'init', [Role.ADMIN]],
  [
    'campaign divisions',
    CampaignController,
    'findDivisions',
    [
      Role.ADMIN,
      Role.CAMPAIGN_MANAGER,
      Role.COMPLIANCE_OFFICER,
      Role.AUDITOR,
      Role.ZONE_COORDINATOR,
      Role.WITNESS,
      Role.VOLUNTEER,
    ],
  ],
  [
    'campaign context',
    CampaignController,
    'findCurrent',
    [
      Role.ADMIN,
      Role.CAMPAIGN_MANAGER,
      Role.COMPLIANCE_OFFICER,
      Role.AUDITOR,
      Role.ZONE_COORDINATOR,
      Role.WITNESS,
      Role.VOLUNTEER,
      Role.FINANCE_MANAGER,
      Role.COMMUNICATIONS_MANAGER,
    ],
  ],
  [
    'storage upload URL',
    StorageController,
    'createUploadUrl',
    Object.values(Role),
  ],
  [
    'storage completion',
    StorageController,
    'completeUpload',
    Object.values(Role),
  ],
];

describe('legacy campaign RBAC metadata', () => {
  const guard = new RolesGuard(new Reflector());

  it.each(cases)(
    '$label allows its role',
    ({ controller, method, allowed }) => {
      expect(guard.canActivate(buildContext(controller, method, allowed))).toBe(
        true,
      );
    },
  );

  it.each(cases)(
    '$label returns 403 to an unauthorized role',
    ({ controller, method, denied }) => {
      expect(() =>
        guard.canActivate(buildContext(controller, method, denied)),
      ).toThrow(ForbiddenException);
    },
  );

  it('requires a recognized role for every storage endpoint', () => {
    expect(() =>
      guard.canActivate(
        buildContext(StorageController, 'createUploadUrl', 'UNKNOWN' as Role),
      ),
    ).toThrow(ForbiddenException);
    expect(
      guard.canActivate(
        buildContext(StorageController, 'completeUpload', Role.VOLUNTEER),
      ),
    ).toBe(true);
  });

  it.each(exactCases)(
    '%s exposes exactly the intended role matrix',
    (_label, controller, method, expected) => {
      const prototype = controller.prototype as Record<string, unknown>;
      const handler = prototype[method];
      if (typeof handler !== 'function') {
        throw new Error(`No existe el handler ${controller.name}.${method}`);
      }

      const actual =
        new Reflector().getAllAndOverride<Role[]>(ROLES_KEY, [
          handler,
          controller,
        ]) ?? [];
      expect([...actual].sort()).toEqual([...expected].sort());
    },
  );
});

function buildContext(
  controller: Type<unknown>,
  method: string,
  role: Role,
): ExecutionContext {
  const prototype = controller.prototype as Record<string, unknown>;
  const handler = prototype[method];
  if (typeof handler !== 'function') {
    throw new Error(`No existe el handler ${controller.name}.${method}`);
  }

  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => ({ user: { role } }) as unknown as AuthenticatedRequest,
    }),
  } as unknown as ExecutionContext;
}
