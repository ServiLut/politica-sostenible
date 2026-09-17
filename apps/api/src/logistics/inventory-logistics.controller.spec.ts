import { Reflector } from '@nestjs/core';
import { PoliticalOperationStage, Role } from '../../prisma/generated/prisma';
import {
  OPERATION_STAGE_POLICY_KEY,
  type OperationStagePolicy,
} from '../auth/decorators/operation-stage-policy.decorator';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { InventoryLogisticsController } from './inventory-logistics.controller';

const reflector = new Reflector();

function roles(method: keyof InventoryLogisticsController): readonly Role[] {
  return (
    reflector.get<Role[]>(
      ROLES_KEY,
      InventoryLogisticsController.prototype[method],
    ) ?? []
  );
}

function policy(
  method: keyof InventoryLogisticsController,
): OperationStagePolicy | undefined {
  return reflector.get<OperationStagePolicy>(
    OPERATION_STAGE_POLICY_KEY,
    InventoryLogisticsController.prototype[method],
  );
}

describe('InventoryLogisticsController authorization contract', () => {
  it('keeps read access limited to operational review roles', () => {
    expect(roles('getOverview')).toEqual([
      Role.ADMIN,
      Role.CAMPAIGN_MANAGER,
      Role.ZONE_COORDINATOR,
      Role.COMPLIANCE_OFFICER,
      Role.AUDITOR,
    ]);
    expect(roles('getTransfer')).toEqual(roles('getOverview'));
    expect(roles('getOverview')).not.toContain(Role.VOLUNTEER);
    expect(roles('getOverview')).not.toContain(Role.WITNESS);
  });

  it('reserves catalog, stock, dispatch and reconciliation for administration', () => {
    for (const method of [
      'createWarehouse',
      'importItems',
      'receiveStock',
      'dispatch',
      'reconcileTransfer',
    ] as const) {
      expect(roles(method)).toEqual([Role.ADMIN, Role.CAMPAIGN_MANAGER]);
    }
  });

  it('allows assigned field coordination to receive, return and report but not reconcile', () => {
    for (const method of [
      'receiveTransfer',
      'returnTransfer',
      'reportIncident',
    ] as const) {
      expect(roles(method)).toContain(Role.ZONE_COORDINATOR);
    }
    expect(roles('reconcileTransfer')).not.toContain(Role.ZONE_COORDINATOR);
  });

  it('exposes simulation exercises and restricts final reconciliation to simulation/post-election', () => {
    const receive = policy('receiveTransfer');
    const reconcile = policy('reconcileTransfer');
    expect(receive?.kind).toBe('REQUIRE');
    expect(reconcile).toEqual({
      kind: 'REQUIRE',
      allowedStages: [
        PoliticalOperationStage.SIMULATION,
        PoliticalOperationStage.POST_ELECTION,
      ],
    });
    if (receive?.kind === 'REQUIRE') {
      expect(receive.allowedStages).toEqual(
        expect.arrayContaining([
          PoliticalOperationStage.SIMULATION,
          PoliticalOperationStage.ELECTION_DAY,
          PoliticalOperationStage.POST_ELECTION,
        ]),
      );
      expect(receive.allowedStages).not.toContain(
        PoliticalOperationStage.CLOSED,
      );
    }
  });

  it('has a controller-level CLOSED freeze while GET remains safe', () => {
    expect(
      reflector.get<OperationStagePolicy>(
        OPERATION_STAGE_POLICY_KEY,
        InventoryLogisticsController,
      ),
    ).toEqual({ kind: 'BLOCK_CLOSED' });
  });
});
