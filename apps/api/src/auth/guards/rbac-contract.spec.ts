/**
 * RBAC Contract Test — Verifies that every controller endpoint in the system
 * has explicit role annotations (@Roles, @Public, or @AllowAnyAuthenticatedRole).
 *
 * This test uses Reflect.getMetadata to introspect decorators at the class and
 * method level, ensuring "fail-closed" compliance: no endpoint may be silently
 * accessible to all authenticated roles without an explicit decorator.
 */

import 'reflect-metadata';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ALLOW_ANY_AUTHENTICATED_KEY } from '../decorators/allow-any-authenticated.decorator';
import { Role } from '../../../prisma/generated/prisma';

// ── Controller Imports ──────────────────────────────────────────────────────
import { AppController } from '../../app.controller';
import { HealthController } from '../../health.controller';
import { AuthController } from '../auth.controller';
import { TeamController } from '../../team/team.controller';
import { InvitationAcceptanceController } from '../../team/invitation-acceptance.controller';
import { BillingController } from '../../billing/billing.controller';
import { CampaignController } from '../../campaign/campaign.controller';
import { FinanceController } from '../../finance/finance.controller';
import { FinanceCloseoutController } from '../../finance/finance-closeout.controller';
import { VoterController } from '../../voter/voter.controller';
import { CasesController } from '../../cases/cases.controller';
import { OfflineIncidentController } from '../../cases/offline-incident.controller';
import { PqrsdController } from '../../pqrsd/pqrsd.controller';
import { TasksController } from '../../tasks/tasks.controller';
import { CommitmentsController } from '../../commitments/commitments.controller';
import { EventsController } from '../../events/events.controller';
import { ProposalsController } from '../../proposals/proposals.controller';
import { CommunicationsController } from '../../communications/communications.controller';
import { ConsentNoticesController } from '../../consent-notices/consent-notices.controller';
import { RetentionGovernanceController } from '../../retention-governance/retention-governance.controller';
import { AuditEventsController } from '../../audit-events/audit-events.controller';
import { WitnessController } from '../../witness/witness.controller';
import { WitnessAssignmentController } from '../../witness/witness-assignment.controller';
import { ElectionDayController } from '../../election-day/election-day.controller';
import { ScrutinyController } from '../../scrutiny/scrutiny.controller';
import { LogisticsController } from '../../logistics/logistics.controller';
import { InventoryLogisticsController } from '../../logistics/inventory-logistics.controller';
import { SignatureCollectionController } from '../../signature-collection/signature-collection.controller';
import { SignatureCountCorrectionController } from '../../signature-collection/signature-count-correction.controller';
import { ElectoralCalendarController } from '../../electoral-calendar/electoral-calendar.controller';
import { ElectoralCatalogController } from '../../electoral-catalog/electoral-catalog.controller';
import { ElectoralCatalogImportController } from '../../electoral-catalog/electoral-catalog-import.controller';
import { ImportController } from '../../import/import.controller';
import { ExportController } from '../../export/export.controller';
import { StorageController } from '../../storage/storage.controller';
import { ElectronicSignatureController } from '../../electronic-signature/electronic-signature.controller';
import { CommandCenterController } from '../../command-center/command-center.controller';
import { OperationalInboxController } from '../../operational-inbox/operational-inbox.controller';
import { SearchController } from '../../search/search.controller';
import { OperationProfileController } from '../../operation-profile/operation-profile.controller';
import { InteractionsController } from '../../interactions/interactions.controller';
import { TransitionHandoverController } from '../../transition-handover/transition-handover.controller';
import { SaasAdminController } from '../../saas-admin/saas-admin.controller';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Extract all own method names from a controller prototype (excluding constructor). */
function getEndpointMethods(controllerClass: new (...args: any[]) => any): string[] {
  return Object.getOwnPropertyNames(controllerClass.prototype).filter(
    (name) => name !== 'constructor' && typeof controllerClass.prototype[name] === 'function',
  );
}

/** Check if a method or class has any RBAC-related decorator. */
function hasRbacDecoration(
  controllerClass: new (...args: any[]) => any,
  methodName: string,
): { roles: Role[] | undefined; isPublic: boolean; allowAny: boolean } {
  const method = controllerClass.prototype[methodName];

  // Check method-level first, then class-level (mirrors Reflector.getAllAndOverride)
  const roles =
    Reflect.getMetadata(ROLES_KEY, method) ??
    Reflect.getMetadata(ROLES_KEY, controllerClass);

  const isPublic =
    Reflect.getMetadata(IS_PUBLIC_KEY, method) === true ||
    Reflect.getMetadata(IS_PUBLIC_KEY, controllerClass) === true;

  const allowAny =
    Reflect.getMetadata(ALLOW_ANY_AUTHENTICATED_KEY, method) === true ||
    Reflect.getMetadata(ALLOW_ANY_AUTHENTICATED_KEY, controllerClass) === true;

  return { roles, isPublic, allowAny };
}

// ── All Controllers ─────────────────────────────────────────────────────────

const ALL_CONTROLLERS: Array<{ name: string; controller: new (...args: any[]) => any }> = [
  { name: 'AppController', controller: AppController },
  { name: 'HealthController', controller: HealthController },
  { name: 'AuthController', controller: AuthController },
  { name: 'TeamController', controller: TeamController },
  { name: 'InvitationAcceptanceController', controller: InvitationAcceptanceController },
  { name: 'BillingController', controller: BillingController },
  { name: 'CampaignController', controller: CampaignController },
  { name: 'FinanceController', controller: FinanceController },
  { name: 'FinanceCloseoutController', controller: FinanceCloseoutController },
  { name: 'VoterController', controller: VoterController },
  { name: 'CasesController', controller: CasesController },
  { name: 'OfflineIncidentController', controller: OfflineIncidentController },
  { name: 'PqrsdController', controller: PqrsdController },
  { name: 'TasksController', controller: TasksController },
  { name: 'CommitmentsController', controller: CommitmentsController },
  { name: 'EventsController', controller: EventsController },
  { name: 'ProposalsController', controller: ProposalsController },
  { name: 'CommunicationsController', controller: CommunicationsController },
  { name: 'ConsentNoticesController', controller: ConsentNoticesController },
  { name: 'RetentionGovernanceController', controller: RetentionGovernanceController },
  { name: 'AuditEventsController', controller: AuditEventsController },
  { name: 'WitnessController', controller: WitnessController },
  { name: 'WitnessAssignmentController', controller: WitnessAssignmentController },
  { name: 'ElectionDayController', controller: ElectionDayController },
  { name: 'ScrutinyController', controller: ScrutinyController },
  { name: 'LogisticsController', controller: LogisticsController },
  { name: 'InventoryLogisticsController', controller: InventoryLogisticsController },
  { name: 'SignatureCollectionController', controller: SignatureCollectionController },
  { name: 'SignatureCountCorrectionController', controller: SignatureCountCorrectionController },
  { name: 'ElectoralCalendarController', controller: ElectoralCalendarController },
  { name: 'ElectoralCatalogController', controller: ElectoralCatalogController },
  { name: 'ElectoralCatalogImportController', controller: ElectoralCatalogImportController },
  { name: 'ImportController', controller: ImportController },
  { name: 'ExportController', controller: ExportController },
  { name: 'StorageController', controller: StorageController },
  { name: 'ElectronicSignatureController', controller: ElectronicSignatureController },
  { name: 'CommandCenterController', controller: CommandCenterController },
  { name: 'OperationalInboxController', controller: OperationalInboxController },
  { name: 'SearchController', controller: SearchController },
  { name: 'OperationProfileController', controller: OperationProfileController },
  { name: 'InteractionsController', controller: InteractionsController },
  { name: 'TransitionHandoverController', controller: TransitionHandoverController },
  { name: 'SaasAdminController', controller: SaasAdminController },
];

// ── Tests ───────────────────────────────────────────────────────────────────

describe('RBAC Contract — Every endpoint must have an explicit access policy', () => {
  for (const { name, controller } of ALL_CONTROLLERS) {
    const methods = getEndpointMethods(controller);

    for (const method of methods) {
      it(`${name}.${method}() has @Roles, @Public, or @AllowAnyAuthenticatedRole`, () => {
        const { roles, isPublic, allowAny } = hasRbacDecoration(controller, method);
        const hasDecoration = (roles && roles.length > 0) || isPublic || allowAny;

        expect(hasDecoration).toBe(true);
      });
    }
  }
});

describe('RBAC Contract — Sensitive endpoints block low-privilege roles', () => {
  const LOW_PRIV_ROLES = [Role.VOLUNTEER, Role.WITNESS] as const;

  const SENSITIVE_CONTROLLERS: Array<{
    name: string;
    controller: new (...args: any[]) => any;
    methods: string[];
  }> = [
    {
      name: 'FinanceController',
      controller: FinanceController,
      methods: ['findAll', 'findSummary', 'create', 'getCneReviewDraft'],
    },
    {
      name: 'FinanceCloseoutController',
      controller: FinanceCloseoutController,
      methods: ['getOverview'],
    },
    {
      name: 'AuditEventsController',
      controller: AuditEventsController,
      methods: ['findAll'],
    },
    {
      name: 'TeamController',
      controller: TeamController,
      methods: ['findMembers'],
    },
  ];

  for (const { name, controller, methods } of SENSITIVE_CONTROLLERS) {
    for (const method of methods) {
      for (const lowRole of LOW_PRIV_ROLES) {
        it(`${name}.${method}() blocks ${lowRole}`, () => {
          const { roles, isPublic } = hasRbacDecoration(controller, method);

          // Public endpoints are not subject to role checks
          if (isPublic) return;

          expect(roles).toBeDefined();
          expect(roles).not.toContain(lowRole);
        });
      }
    }
  }
});

describe('RBAC Contract — Public endpoints are intentionally public', () => {
  const EXPECTED_PUBLIC = [
    { controller: AppController, methods: ['getHello', 'getFavicon'] },
    { controller: HealthController, methods: ['check', 'live', 'ready', 'dependencies'] },
    { controller: AuthController, methods: ['login', 'register', 'registrationPolicy'] },
    { controller: InvitationAcceptanceController, methods: ['accept'] },
  ];

  for (const { controller, methods } of EXPECTED_PUBLIC) {
    for (const method of methods) {
      it(`${controller.name}.${method}() is @Public`, () => {
        const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, controller.prototype[method]);
        expect(isPublic).toBe(true);
      });
    }
  }
});

describe('RBAC Contract — ADMIN-only endpoints are strictly restricted', () => {
  const ADMIN_ONLY: Array<{
    controller: new (...args: any[]) => any;
    method: string;
  }> = [
    { controller: TeamController, method: 'findMembers' },
    { controller: AuthController, method: 'updateOrganization' },
  ];

  for (const { controller, method } of ADMIN_ONLY) {
    it(`${controller.name}.${method}() is restricted to ADMIN only`, () => {
      const roles =
        Reflect.getMetadata(ROLES_KEY, controller.prototype[method]) ??
        Reflect.getMetadata(ROLES_KEY, controller);

      expect(roles).toBeDefined();
      expect(roles).toEqual([Role.ADMIN]);
    });
  }
});
