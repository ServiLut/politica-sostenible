/**
 * RBAC Contract Test — Verifies that every controller endpoint has explicit
 * access-policy decorators (@Roles, @Public, or @AllowAnyAuthenticatedRole).
 *
 * Uses jest.mock to avoid loading heavy ESM dependencies (otplib, supabase, etc.)
 * that break Jest's CommonJS transform pipeline.
 */

import 'reflect-metadata';

// ── Mock heavy service dependencies before any controller import ────────────
jest.mock('../mfa.service', () => ({ MfaService: class {} }));
jest.mock('../../search/search.service', () => ({ SearchService: class {} }));
jest.mock('../../billing/billing.service', () => ({ BillingService: class {} }));
jest.mock('../../saas-admin/saas-admin.service', () => ({ SaasAdminService: class {} }));
jest.mock('../../campaign/campaign.service', () => ({ CampaignService: class {} }));
jest.mock('../../finance/finance.service', () => ({ FinanceService: class {} }));
jest.mock('../../finance/finance-closeout.service', () => ({ FinanceCloseoutService: class {} }));
jest.mock('../../voter/voter.service', () => ({ VoterService: class {} }));
jest.mock('../../cases/cases.service', () => ({ CasesService: class {} }));
jest.mock('../../cases/offline-incident.service', () => ({ OfflineIncidentService: class {} }));
jest.mock('../../pqrsd/pqrsd.service', () => ({ PqrsdService: class {} }));
jest.mock('../../tasks/tasks.service', () => ({ TasksService: class {} }));
jest.mock('../../commitments/commitments.service', () => ({ CommitmentsService: class {} }));
jest.mock('../../events/events.service', () => ({ EventsService: class {} }));
jest.mock('../../proposals/proposals.service', () => ({ ProposalsService: class {} }));
jest.mock('../../communications/communications.service', () => ({ CommunicationsService: class {} }));
jest.mock('../../consent-notices/consent-notices.service', () => ({ ConsentNoticesService: class {} }));
jest.mock('../../retention-governance/retention-governance.service', () => ({ RetentionGovernanceService: class {} }));
jest.mock('../../audit-events/audit-events.service', () => ({ AuditEventsService: class {} }));
jest.mock('../../witness/witness.service', () => ({ WitnessService: class {} }));
jest.mock('../../witness/witness-assignment.service', () => ({ WitnessAssignmentService: class {} }));
jest.mock('../../election-day/election-day.service', () => ({ ElectionDayService: class {} }));
jest.mock('../../scrutiny/scrutiny.service', () => ({ ScrutinyService: class {} }));
jest.mock('../../logistics/logistics.service', () => ({ LogisticsService: class {} }));
jest.mock('../../logistics/inventory-operations.service', () => ({ InventoryOperationsService: class {} }));
jest.mock('../../signature-collection/signature-collection.service', () => ({ SignatureCollectionService: class {} }));
jest.mock('../../signature-collection/signature-count-correction.service', () => ({ SignatureCountCorrectionService: class {} }));
jest.mock('../../electoral-calendar/electoral-calendar.service', () => ({ ElectoralCalendarService: class {} }));
jest.mock('../../electoral-catalog/electoral-catalog.service', () => ({ ElectoralCatalogService: class {} }));
jest.mock('../../electoral-catalog/electoral-catalog-import.service', () => ({ ElectoralCatalogImportService: class {} }));
jest.mock('../../import/import.service', () => ({ ImportService: class {} }));
jest.mock('../../export/export.service', () => ({ ExportService: class {} }));
jest.mock('../../storage/storage.service', () => ({ StorageService: class {} }));
jest.mock('../../electronic-signature/electronic-signature.service', () => ({ ElectronicSignatureService: class {} }));
jest.mock('../../command-center/command-center.service', () => ({ CommandCenterService: class {} }));
jest.mock('../../operational-inbox/operational-inbox.service', () => ({ OperationalInboxService: class {} }));
jest.mock('../../operation-profile/operation-profile.service', () => ({ OperationProfileService: class {} }));
jest.mock('../../interactions/interactions.service', () => ({ InteractionsService: class {} }));
jest.mock('../../transition-handover/transition-handover.service', () => ({ TransitionHandoverService: class {} }));
jest.mock('../../team/team.service', () => ({ TeamService: class {} }));
jest.mock('../../team/invitation-acceptance.service', () => ({ InvitationAcceptanceService: class {} }));
jest.mock('../../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../../common/throttling/redis-throttler-storage', () => ({ RedisThrottlerStorage: class {} }));
jest.mock('../auth.service', () => ({ AuthService: class {} }));
jest.mock('../../health.controller', () => ({
  HealthController: class {
    check() {}
    live() {}
    ready() {}
    dependencies() {}
  },
}));

// ── Imports (after mocks) ───────────────────────────────────────────────────
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ALLOW_ANY_AUTHENTICATED_KEY } from '../decorators/allow-any-authenticated.decorator';
import { Role } from '../../../prisma/generated/prisma';

import { AuthController } from '../auth.controller';
import { TeamController } from '../../team/team.controller';
import { BillingController } from '../../billing/billing.controller';
import { FinanceController } from '../../finance/finance.controller';
import { FinanceCloseoutController } from '../../finance/finance-closeout.controller';
import { AuditEventsController } from '../../audit-events/audit-events.controller';
import { SearchController } from '../../search/search.controller';
import { SaasAdminController } from '../../saas-admin/saas-admin.controller';
import { VoterController } from '../../voter/voter.controller';
import { StorageController } from '../../storage/storage.controller';
import { TasksController } from '../../tasks/tasks.controller';
import { CasesController } from '../../cases/cases.controller';
import { PqrsdController } from '../../pqrsd/pqrsd.controller';
import { EventsController } from '../../events/events.controller';
import { ProposalsController } from '../../proposals/proposals.controller';
import { CommunicationsController } from '../../communications/communications.controller';
import { ConsentNoticesController } from '../../consent-notices/consent-notices.controller';
import { RetentionGovernanceController } from '../../retention-governance/retention-governance.controller';
import { WitnessController } from '../../witness/witness.controller';
import { WitnessAssignmentController } from '../../witness/witness-assignment.controller';
import { ScrutinyController } from '../../scrutiny/scrutiny.controller';
import { ElectoralCalendarController } from '../../electoral-calendar/electoral-calendar.controller';
import { SignatureCollectionController } from '../../signature-collection/signature-collection.controller';
import { SignatureCountCorrectionController } from '../../signature-collection/signature-count-correction.controller';
import { CampaignController } from '../../campaign/campaign.controller';
import { OperationProfileController } from '../../operation-profile/operation-profile.controller';
import { ElectionDayController } from '../../election-day/election-day.controller';
import { CommandCenterController } from '../../command-center/command-center.controller';
import { OperationalInboxController } from '../../operational-inbox/operational-inbox.controller';
import { InteractionsController } from '../../interactions/interactions.controller';
import { TransitionHandoverController } from '../../transition-handover/transition-handover.controller';
import { CommitmentsController } from '../../commitments/commitments.controller';
import { ImportController } from '../../import/import.controller';
import { ExportController } from '../../export/export.controller';
import { ElectronicSignatureController } from '../../electronic-signature/electronic-signature.controller';
import { LogisticsController } from '../../logistics/logistics.controller';
import { InventoryLogisticsController } from '../../logistics/inventory-logistics.controller';
import { ElectoralCatalogController } from '../../electoral-catalog/electoral-catalog.controller';
import { ElectoralCatalogImportController } from '../../electoral-catalog/electoral-catalog-import.controller';

// ── Helpers ─────────────────────────────────────────────────────────────────

function getEndpointMethods(ctrl: new (...a: any[]) => any): string[] {
  return Object.getOwnPropertyNames(ctrl.prototype).filter(
    (n) => n !== 'constructor' && typeof ctrl.prototype[n] === 'function',
  );
}

function hasRbac(ctrl: new (...a: any[]) => any, method: string) {
  const m = ctrl.prototype[method];
  const roles =
    Reflect.getMetadata(ROLES_KEY, m) ?? Reflect.getMetadata(ROLES_KEY, ctrl);
  const isPublic =
    Reflect.getMetadata(IS_PUBLIC_KEY, m) === true ||
    Reflect.getMetadata(IS_PUBLIC_KEY, ctrl) === true;
  const allowAny =
    Reflect.getMetadata(ALLOW_ANY_AUTHENTICATED_KEY, m) === true ||
    Reflect.getMetadata(ALLOW_ANY_AUTHENTICATED_KEY, ctrl) === true;
  return { roles, isPublic, allowAny };
}

// ── Controllers to audit ────────────────────────────────────────────────────

const CONTROLLERS: Array<{ name: string; ctrl: new (...a: any[]) => any }> = [
  { name: 'AuthController', ctrl: AuthController },
  { name: 'TeamController', ctrl: TeamController },
  { name: 'BillingController', ctrl: BillingController },
  { name: 'FinanceController', ctrl: FinanceController },
  { name: 'FinanceCloseoutController', ctrl: FinanceCloseoutController },
  { name: 'AuditEventsController', ctrl: AuditEventsController },
  { name: 'SearchController', ctrl: SearchController },
  { name: 'SaasAdminController', ctrl: SaasAdminController },
  { name: 'VoterController', ctrl: VoterController },
  { name: 'StorageController', ctrl: StorageController },
  { name: 'TasksController', ctrl: TasksController },
  { name: 'CasesController', ctrl: CasesController },
  { name: 'PqrsdController', ctrl: PqrsdController },
  { name: 'EventsController', ctrl: EventsController },
  { name: 'ProposalsController', ctrl: ProposalsController },
  { name: 'CommunicationsController', ctrl: CommunicationsController },
  { name: 'ConsentNoticesController', ctrl: ConsentNoticesController },
  { name: 'RetentionGovernanceController', ctrl: RetentionGovernanceController },
  { name: 'WitnessController', ctrl: WitnessController },
  { name: 'WitnessAssignmentController', ctrl: WitnessAssignmentController },
  { name: 'ScrutinyController', ctrl: ScrutinyController },
  { name: 'ElectoralCalendarController', ctrl: ElectoralCalendarController },
  { name: 'SignatureCollectionController', ctrl: SignatureCollectionController },
  { name: 'SignatureCountCorrectionController', ctrl: SignatureCountCorrectionController },
  { name: 'CampaignController', ctrl: CampaignController },
  { name: 'OperationProfileController', ctrl: OperationProfileController },
  { name: 'ElectionDayController', ctrl: ElectionDayController },
  { name: 'CommandCenterController', ctrl: CommandCenterController },
  { name: 'OperationalInboxController', ctrl: OperationalInboxController },
  { name: 'InteractionsController', ctrl: InteractionsController },
  { name: 'TransitionHandoverController', ctrl: TransitionHandoverController },
  { name: 'CommitmentsController', ctrl: CommitmentsController },
  { name: 'ImportController', ctrl: ImportController },
  { name: 'ExportController', ctrl: ExportController },
  { name: 'ElectronicSignatureController', ctrl: ElectronicSignatureController },
  { name: 'LogisticsController', ctrl: LogisticsController },
  { name: 'InventoryLogisticsController', ctrl: InventoryLogisticsController },
  { name: 'ElectoralCatalogController', ctrl: ElectoralCatalogController },
  { name: 'ElectoralCatalogImportController', ctrl: ElectoralCatalogImportController },
];

// ── Tests ───────────────────────────────────────────────────────────────────

describe('RBAC Contract — every endpoint must have an explicit access policy', () => {
  for (const { name, ctrl } of CONTROLLERS) {
    for (const method of getEndpointMethods(ctrl)) {
      it(`${name}.${method}() has @Roles, @Public, or @AllowAnyAuthenticatedRole`, () => {
        const { roles, isPublic, allowAny } = hasRbac(ctrl, method);
        expect((roles && roles.length > 0) || isPublic || allowAny).toBe(true);
      });
    }
  }
});

describe('RBAC Contract — sensitive endpoints block VOLUNTEER and WITNESS', () => {
  const LOW = [Role.VOLUNTEER, Role.WITNESS] as const;
  const SENSITIVE = [
    { name: 'FinanceController', ctrl: FinanceController },
    { name: 'FinanceCloseoutController', ctrl: FinanceCloseoutController },
    { name: 'AuditEventsController', ctrl: AuditEventsController },
    { name: 'TeamController', ctrl: TeamController },
  ];

  for (const { name, ctrl } of SENSITIVE) {
    for (const method of getEndpointMethods(ctrl)) {
      for (const role of LOW) {
        it(`${name}.${method}() blocks ${role}`, () => {
          const { roles, isPublic } = hasRbac(ctrl, method);
          if (isPublic) return;
          expect(roles).toBeDefined();
          expect(roles).not.toContain(role);
        });
      }
    }
  }
});

describe('RBAC Contract — public endpoints are intentional', () => {
  const EXPECTED_PUBLIC = [
    { ctrl: AuthController, methods: ['login', 'register', 'registrationPolicy'] },
  ];

  for (const { ctrl, methods } of EXPECTED_PUBLIC) {
    for (const method of methods) {
      it(`${ctrl.name}.${method}() is @Public`, () => {
        expect(Reflect.getMetadata(IS_PUBLIC_KEY, ctrl.prototype[method])).toBe(true);
      });
    }
  }
});

describe('RBAC Contract — ADMIN-only endpoints', () => {
  it('TeamController class-level is ADMIN only', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, TeamController);
    expect(roles).toEqual([Role.ADMIN]);
  });

  it('AuthController.updateOrganization is ADMIN only', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, AuthController.prototype.updateOrganization);
    expect(roles).toEqual([Role.ADMIN]);
  });
});
