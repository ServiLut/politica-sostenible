import { Role } from '../../prisma/generated/prisma';
import {
  OPERATION_STAGE_POLICY_KEY,
  type OperationStagePolicy,
} from '../auth/decorators/operation-stage-policy.decorator';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { RetentionGovernanceController } from './retention-governance.controller';

describe('RetentionGovernanceController authorization', () => {
  it('explicitly preserves governance operations after CLOSED', () => {
    expect(
      Reflect.getMetadata(
        OPERATION_STAGE_POLICY_KEY,
        RetentionGovernanceController,
      ) as OperationStagePolicy,
    ).toEqual({ kind: 'ALLOW_CLOSED' });
  });

  it('limits the module to administration, compliance and audit', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, RetentionGovernanceController) as Role[],
    ).toEqual([Role.ADMIN, Role.COMPLIANCE_OFFICER, Role.AUDITOR]);
  });

  it('does not let auditors originate a disposition or legal hold', () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        RetentionGovernanceController.prototype.requestDisposition,
      ) as Role[],
    ).toEqual([Role.ADMIN, Role.COMPLIANCE_OFFICER]);
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        RetentionGovernanceController.prototype.createLegalHold,
      ) as Role[],
    ).toEqual([Role.ADMIN, Role.COMPLIANCE_OFFICER]);
  });
});
