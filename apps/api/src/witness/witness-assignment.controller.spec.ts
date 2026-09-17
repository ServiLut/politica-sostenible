import {
  PoliticalOperationStage,
  Role,
  WitnessAssignmentType,
  WitnessCaptureContext,
} from '../../prisma/generated/prisma';
import {
  OPERATION_STAGE_POLICY_KEY,
  type OperationStagePolicy,
} from '../auth/decorators/operation-stage-policy.decorator';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { WitnessAssignmentController } from './witness-assignment.controller';
import type { WitnessAssignmentService } from './witness-assignment.service';

const user: AuthenticatedUser = {
  userId: 'actor-from-jwt',
  tenantId: 'tenant-from-jwt',
  role: Role.ADMIN,
};

describe('WitnessAssignmentController', () => {
  it('passes the authenticated context and never accepts a client tenant', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'assignment-a' });
    const controller = new WitnessAssignmentController({
      create,
    } as unknown as WitnessAssignmentService);
    const dto = {
      clientRequestId: '11111111-1111-4111-8111-111111111111',
      coverageWindowId: 'window-a',
      witnessId: 'witness-a',
      puestoId: 'place-a',
      tableStart: 1,
      tableEnd: 3,
      shiftStartsAt: '2027-10-31T13:00:00.000Z',
      shiftEndsAt: '2027-10-31T21:00:00.000Z',
      captureContext: WitnessCaptureContext.REAL,
      assignmentType: WitnessAssignmentType.PRIMARY,
    };

    await controller.create(user, dto);

    expect(create).toHaveBeenCalledWith(user, dto);
    expect(create.mock.calls[0]).not.toContain(user.tenantId);
  });

  it('keeps POST/CLOSED read-only while declaring every mutable stage', () => {
    const classPolicy = Reflect.getMetadata(
      OPERATION_STAGE_POLICY_KEY,
      WitnessAssignmentController,
    ) as OperationStagePolicy;
    const createPolicy = Reflect.getMetadata(
      OPERATION_STAGE_POLICY_KEY,
      WitnessAssignmentController.prototype.create,
    ) as OperationStagePolicy;

    expect(classPolicy).toEqual({ kind: 'BLOCK_CLOSED' });
    expect(createPolicy).toEqual({
      kind: 'REQUIRE',
      allowedStages: [
        PoliticalOperationStage.PRE_CAMPAIGN,
        PoliticalOperationStage.CAMPAIGN,
        PoliticalOperationStage.ELECTION_PREPARATION,
        PoliticalOperationStage.SIMULATION,
        PoliticalOperationStage.ELECTION_DAY,
      ],
    });
  });

  it('lets auditors read but only planners reassign', () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        WitnessAssignmentController.prototype.coverage,
      ) as Role[],
    ).toContain(Role.AUDITOR);
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        WitnessAssignmentController.prototype.reassign,
      ) as Role[],
    ).toEqual([Role.ADMIN, Role.CAMPAIGN_MANAGER, Role.ZONE_COORDINATOR]);
  });
});
