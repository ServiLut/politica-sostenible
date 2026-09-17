jest.mock('otplib', () => ({
  generateSecret: jest.fn(),
  generateURI: jest.fn(),
  verifySync: jest.fn(),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PoliticalOperationStage } from '../../../prisma/generated/prisma';
import { CampaignController } from '../../campaign/campaign.controller';
import { CasesController } from '../../cases/cases.controller';
import { CommitmentsController } from '../../commitments/commitments.controller';
import { CommunicationsController } from '../../communications/communications.controller';
import { EventsController } from '../../events/events.controller';
import { ElectoralCatalogImportController } from '../../electoral-catalog/electoral-catalog-import.controller';
import { ElectoralCatalogController } from '../../electoral-catalog/electoral-catalog.controller';
import { FinanceController } from '../../finance/finance.controller';
import { ImportController } from '../../import/import.controller';
import { InteractionsController } from '../../interactions/interactions.controller';
import { ElectronicSignatureController } from '../../electronic-signature/electronic-signature.controller';
import { LogisticsController } from '../../logistics/logistics.controller';
import { InventoryLogisticsController } from '../../logistics/inventory-logistics.controller';
import { ProposalsController } from '../../proposals/proposals.controller';
import { TasksController } from '../../tasks/tasks.controller';
import { VoterController } from '../../voter/voter.controller';
import { WitnessController } from '../../witness/witness.controller';
import { WitnessAssignmentController } from '../../witness/witness-assignment.controller';
import {
  OPERATION_STAGE_POLICY_KEY,
  type OperationStagePolicy,
} from '../decorators/operation-stage-policy.decorator';
import { OperationStageGuard } from './operation-stage.guard';

const CLOSED_CONTROLLERS = [
  CampaignController,
  CasesController,
  CommitmentsController,
  CommunicationsController,
  ElectronicSignatureController,
  ElectoralCatalogController,
  ElectoralCatalogImportController,
  EventsController,
  FinanceController,
  ImportController,
  InteractionsController,
  InventoryLogisticsController,
  LogisticsController,
  ProposalsController,
  TasksController,
  VoterController,
  WitnessController,
  WitnessAssignmentController,
];

const E14_PERSISTENCE_STAGES = [
  PoliticalOperationStage.SIMULATION,
  PoliticalOperationStage.ELECTION_DAY,
  PoliticalOperationStage.POST_ELECTION,
];

const POLLING_PLACE_CONFIGURATION_STAGES = [
  PoliticalOperationStage.ELECTION_PREPARATION,
  PoliticalOperationStage.SIMULATION,
];

function policy(target: object): OperationStagePolicy | undefined {
  return Reflect.getMetadata(OPERATION_STAGE_POLICY_KEY, target) as
    | OperationStagePolicy
    | undefined;
}

describe('operation stage policy coverage', () => {
  it.each(CLOSED_CONTROLLERS)(
    'marca las solicitudes mutantes de %p para bloquearlas al iniciar tras el cierre',
    (controller) => {
      expect(policy(controller)).toEqual({ kind: 'BLOCK_CLOSED' });
    },
  );

  it.each([
    WitnessController.prototype.create,
    WitnessController.prototype.review,
    LogisticsController.prototype.syncE14,
  ])('persiste E-14 en simulacion aislada y etapas reales', (handler) => {
    expect(policy(handler)).toEqual({
      kind: 'REQUIRE',
      allowedStages: E14_PERSISTENCE_STAGES,
    });
  });

  it('permite preparar mesas durante preparacion y simulacion', () => {
    expect(
      policy(WitnessController.prototype.updatePollingPlaceProfile),
    ).toEqual({
      kind: 'REQUIRE',
      allowedStages: POLLING_PLACE_CONFIGURATION_STAGES,
    });
  });

  it.each([
    VoterController.prototype.search,
    VoterController.prototype.update,
    VoterController.prototype.revokeConsent,
    InteractionsController.prototype.revokeCaseConsent,
  ])('preserva la excepcion legal o de consulta de %p', (handler) => {
    expect(policy(handler)).toEqual({ kind: 'ALLOW_CLOSED' });
  });

  it('registra el guard global despues de autenticacion y roles', () => {
    const source = readFileSync(join(__dirname, '../../app.module.ts'), 'utf8');
    const jwt = source.indexOf('useClass: JwtAuthGuard');
    const roles = source.indexOf('useClass: RolesGuard');
    const stage = source.indexOf('useClass: OperationStageGuard');
    const plan = source.indexOf('useClass: PlanLimitsGuard');

    expect(source).toContain(
      "import { OperationStageGuard } from './auth/guards/operation-stage.guard'",
    );
    expect(jwt).toBeGreaterThan(-1);
    expect(roles).toBeGreaterThan(jwt);
    expect(stage).toBeGreaterThan(roles);
    expect(plan).toBeGreaterThan(stage);
    expect(OperationStageGuard.name).toBe('OperationStageGuard');
  });
});
