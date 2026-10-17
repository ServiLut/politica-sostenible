/**
 * RBAC Contract Test — Verifies that every controller endpoint has explicit
 * access-policy decorators (@Roles, @Public, or @AllowAnyAuthenticatedRole).
 *
 * Uses jest.mock to avoid loading heavy ESM dependencies (otplib, supabase, etc.)
 * that break Jest's CommonJS transform pipeline.
 */

import 'reflect-metadata';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Controller, Get, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

// ── Mock heavy service dependencies before any controller import ────────────
jest.mock('../mfa.service', () => ({ MfaService: class {} }));
jest.mock('../../search/search.service', () => ({ SearchService: class {} }));
jest.mock('../../billing/billing.service', () => ({
  BillingService: class {},
}));
jest.mock('../../saas-admin/saas-admin.service', () => ({
  SaasAdminService: class {},
}));
jest.mock('../../campaign/campaign.service', () => ({
  ...jest.requireActual<Record<string, unknown>>(
    '../../campaign/campaign.service',
  ),
  CampaignService: class {},
}));
jest.mock('../../finance/finance.service', () => ({
  FinanceService: class {},
}));
jest.mock('../../finance/finance-closeout.service', () => ({
  FinanceCloseoutService: class {},
}));
jest.mock('../../voter/voter.service', () => ({
  ...jest.requireActual<Record<string, unknown>>('../../voter/voter.service'),
  VoterService: class {},
}));
jest.mock('../../cases/cases.service', () => ({ CasesService: class {} }));
jest.mock('../../cases/offline-incident.service', () => ({
  OfflineIncidentService: class {},
}));
jest.mock('../../pqrsd/pqrsd.service', () => ({ PqrsdService: class {} }));
jest.mock('../../tasks/tasks.service', () => ({ TasksService: class {} }));
jest.mock('../../commitments/commitments.service', () => ({
  CommitmentsService: class {},
}));
jest.mock('../../events/events.service', () => ({ EventsService: class {} }));
jest.mock('../../proposals/proposals.service', () => ({
  ProposalsService: class {},
}));
jest.mock('../../communications/communications.service', () => ({
  CommunicationsService: class {},
}));
jest.mock('../../consent-notices/consent-notices.service', () => ({
  ConsentNoticesService: class {},
}));
jest.mock('../../retention-governance/retention-governance.service', () => ({
  RetentionGovernanceService: class {},
}));
jest.mock('../../audit-events/audit-events.service', () => ({
  AuditEventsService: class {},
}));
jest.mock('../../witness/witness.service', () => ({
  WitnessService: class {},
}));
jest.mock('../../witness/witness-assignment.service', () => ({
  WitnessAssignmentService: class {},
}));
jest.mock('../../election-day/election-day.service', () => ({
  ElectionDayService: class {},
}));
jest.mock('../../scrutiny/scrutiny.service', () => ({
  ScrutinyService: class {},
}));
jest.mock('../../logistics/logistics.service', () => ({
  LogisticsService: class {},
}));
jest.mock('../../logistics/inventory-operations.service', () => ({
  ...jest.requireActual<Record<string, unknown>>(
    '../../logistics/inventory-operations.service',
  ),
  InventoryOperationsService: class {},
}));
jest.mock('../../signature-collection/signature-collection.service', () => ({
  SignatureCollectionService: class {},
}));
jest.mock(
  '../../signature-collection/signature-count-correction.service',
  () => ({ SignatureCountCorrectionService: class {} }),
);
jest.mock('../../electoral-calendar/electoral-calendar.service', () => ({
  ElectoralCalendarService: class {},
}));
jest.mock('../../electoral-catalog/electoral-catalog.service', () => ({
  ElectoralCatalogService: class {},
}));
jest.mock('../../electoral-catalog/electoral-catalog-import.service', () => ({
  ElectoralCatalogImportService: class {},
}));
jest.mock('../../import/import.service', () => ({ ImportService: class {} }));
jest.mock('../../import/person-import.service', () => ({
  PersonImportService: class {},
}));
jest.mock('../../export/export.service', () => ({ ExportService: class {} }));
jest.mock('../../storage/storage.service', () => ({
  StorageService: class {},
}));
jest.mock('../../electronic-signature/electronic-signature.service', () => ({
  ElectronicSignatureService: class {},
}));
jest.mock('../../command-center/command-center.service', () => ({
  CommandCenterService: class {},
}));
jest.mock('../../operational-inbox/operational-inbox.service', () => ({
  OperationalInboxService: class {},
}));
jest.mock('../../operation-profile/operation-profile.service', () => ({
  OperationProfileService: class {},
}));
jest.mock('../../interactions/interactions.service', () => ({
  InteractionsService: class {},
}));
jest.mock('../../transition-handover/transition-handover.service', () => ({
  TransitionHandoverService: class {},
}));
jest.mock('../../team/team.service', () => ({ TeamService: class {} }));
jest.mock('../../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../../common/throttling/redis-throttler-storage', () => ({
  RedisThrottlerStorage: class {},
}));
jest.mock('../auth.service', () => ({ AuthService: class {} }));
jest.mock('../../storage/supabase-storage.gateway', () => ({
  SupabaseStorageGateway: class {},
}));

// Imports used by focused policy assertions. The full inventory is discovered below.
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY, Public } from '../decorators/public.decorator';
import { ALLOW_ANY_AUTHENTICATED_KEY } from '../decorators/allow-any-authenticated.decorator';
import { Role } from '../../../prisma/generated/prisma';
import { AuthController } from '../auth.controller';
import { TeamController } from '../../team/team.controller';
import { FinanceController } from '../../finance/finance.controller';
import { FinanceCloseoutController } from '../../finance/finance-closeout.controller';
import { AuditEventsController } from '../../audit-events/audit-events.controller';

// ── Helpers ─────────────────────────────────────────────────────────────────

type AuditedController = { prototype: object; name: string };

function getEndpointMethods(ctrl: AuditedController): string[] {
  const names = new Set<string>();
  let prototype: object | null = ctrl.prototype;
  while (prototype && prototype !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(prototype)) names.add(name);
    prototype = Reflect.getPrototypeOf(prototype);
  }
  // Nest also discovers inherited route methods. Read metadata from the most
  // derived implementation so an override cannot inherit a stale permission.
  return [...names].filter((name) => {
    const member: unknown = Reflect.get(ctrl.prototype, name);
    return (
      name !== 'constructor' &&
      typeof member === 'function' &&
      Reflect.hasMetadata(METHOD_METADATA, member)
    );
  });
}

function getEndpointTarget(ctrl: AuditedController, method: string): object {
  const member: unknown = Reflect.get(ctrl.prototype, method);
  if (typeof member !== 'function') {
    throw new Error(`${ctrl.name}.${method} must be a controller method`);
  }
  return member;
}

function hasRbac(ctrl: AuditedController, method: string) {
  const m = getEndpointTarget(ctrl, method);
  const roles =
    Reflect.getMetadata(ROLES_KEY, m) ?? Reflect.getMetadata(ROLES_KEY, ctrl);
  // Match Reflector.getAllAndOverride used by the production guards.
  const isPublic =
    (Reflect.getMetadata(IS_PUBLIC_KEY, m) ??
      Reflect.getMetadata(IS_PUBLIC_KEY, ctrl)) === true;
  const allowAny =
    (Reflect.getMetadata(ALLOW_ANY_AUTHENTICATED_KEY, m) ??
      Reflect.getMetadata(ALLOW_ANY_AUTHENTICATED_KEY, ctrl)) === true;
  return { roles, isPublic, allowAny };
}

function listControllerFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return listControllerFiles(path);
      return entry.name.endsWith('.controller.ts') ? [path] : [];
    })
    .sort();
}

function isController(value: unknown): value is AuditedController {
  return (
    typeof value === 'function' &&
    typeof Reflect.get(value, 'prototype') === 'object' &&
    Reflect.hasMetadata(PATH_METADATA, value)
  );
}

// Discover actual decorated classes, not a manually maintained import list.
// A new controller is audited automatically; an unsupported dependency fails
// this suite until mocked, rather than silently excluding its endpoints.
const CONTROLLERS = listControllerFiles(join(__dirname, '..', '..')).flatMap(
  (file) => {
    const exports = jest.requireActual<Record<string, unknown>>(file);
    const controllers = Object.values(exports).filter(isController);
    if (controllers.length === 0) {
      throw new Error(
        `Controller file exports no decorated controller: ${file}`,
      );
    }
    return controllers.map((ctrl) => ({ name: ctrl.name, ctrl }));
  },
);

function routePaths(ctrl: AuditedController, method: string): string[] {
  const target = getEndpointTarget(ctrl, method);
  const verb = Reflect.getMetadata(METHOD_METADATA, target) as RequestMethod;
  const prefixes = Reflect.getMetadata(PATH_METADATA, ctrl) as
    string | string[];
  const suffixes = Reflect.getMetadata(PATH_METADATA, target) as
    string | string[];
  return [prefixes].flat().flatMap((prefix) =>
    [suffixes].flat().map((suffix) => {
      const path = `/${[prefix, suffix].join('/').split('/').filter(Boolean).join('/')}`;
      return `${RequestMethod[verb]} ${path}`;
    }),
  );
}

const PUBLIC_ENDPOINT_ALLOWLIST = [
  'GET /',
  'GET /favicon.ico',
  'POST /auth/login',
  'GET /auth/registration-policy',
  'POST /auth/register',
  'POST /auth/invitations/accept',
  'GET /health',
  'GET /health/live',
  'GET /health/ready',
  'GET /health/dependencies',
] as const;

function inspectAccessPolicies(
  controllers: ReadonlyArray<{ name: string; ctrl: AuditedController }>,
) {
  const missingPolicies: string[] = [];
  const publicEndpoints: string[] = [];
  for (const { name, ctrl } of controllers) {
    for (const method of getEndpointMethods(ctrl)) {
      const { roles, isPublic, allowAny } = hasRbac(ctrl, method);
      if (
        !(Array.isArray(roles) && roles.length > 0) &&
        !isPublic &&
        !allowAny
      ) {
        missingPolicies.push(`${name}.${method}`);
      }
      if (isPublic) publicEndpoints.push(...routePaths(ctrl, method));
    }
  }
  return {
    missingPolicies: missingPolicies.sort(),
    publicEndpoints: publicEndpoints.sort(),
    unexpectedPublicEndpoints: publicEndpoints
      .filter(
        (endpoint) =>
          !PUBLIC_ENDPOINT_ALLOWLIST.some((allowed) => allowed === endpoint),
      )
      .sort(),
    missingPublicEndpoints: PUBLIC_ENDPOINT_ALLOWLIST.filter(
      (endpoint) => !publicEndpoints.includes(endpoint),
    ).sort(),
  };
}

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

describe('RBAC Contract — closed controller inventory and public allowlist', () => {
  it('discovers all 44 current controllers and 255 current endpoints, including App, Health and PersonImport', () => {
    expect(CONTROLLERS).toHaveLength(44);
    expect(
      CONTROLLERS.reduce(
        (count, { ctrl }) => count + getEndpointMethods(ctrl).length,
        0,
      ),
    ).toBe(255);
    expect(CONTROLLERS.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'AppController',
        'HealthController',
        'PersonImportController',
      ]),
    );
  });

  it('allows exactly the ten reviewed public HTTP endpoints, with no omissions or duplicates', () => {
    const audit = inspectAccessPolicies(CONTROLLERS);
    expect(audit.missingPolicies).toEqual([]);
    expect(audit.unexpectedPublicEndpoints).toEqual([]);
    expect(audit.missingPublicEndpoints).toEqual([]);
    expect(audit.publicEndpoints).toEqual(
      [...PUBLIC_ENDPOINT_ALLOWLIST].sort(),
    );
  });

  it('detects an added endpoint without a method-level or class-level access policy', () => {
    @Controller('security-contract-fixture')
    class MissingPolicyController {
      @Get('unprotected')
      unprotected() {}
    }
    const audit = inspectAccessPolicies([
      ...CONTROLLERS,
      { name: MissingPolicyController.name, ctrl: MissingPolicyController },
    ]);
    expect(audit.missingPolicies).toEqual([
      'MissingPolicyController.unprotected',
    ]);
  });

  it('rejects a newly public method even though it has an explicit policy', () => {
    @Controller('security-contract-fixture')
    class UnexpectedPublicController {
      @Public()
      @Get('debug')
      debug() {}
    }
    const audit = inspectAccessPolicies([
      ...CONTROLLERS,
      {
        name: UnexpectedPublicController.name,
        ctrl: UnexpectedPublicController,
      },
    ]);
    expect(audit.missingPolicies).toEqual([]);
    expect(audit.unexpectedPublicEndpoints).toEqual([
      'GET /security-contract-fixture/debug',
    ]);
  });

  it('rejects class-wide public access and checks every path alias', () => {
    @Public()
    @Controller(['security-contract-fixture', 'security-contract-alias'])
    class UnexpectedPublicClassController {
      @Get(['export', 'backup'])
      export() {}
    }
    const audit = inspectAccessPolicies([
      ...CONTROLLERS,
      {
        name: UnexpectedPublicClassController.name,
        ctrl: UnexpectedPublicClassController,
      },
    ]);
    expect(audit.unexpectedPublicEndpoints).toEqual([
      'GET /security-contract-alias/backup',
      'GET /security-contract-alias/export',
      'GET /security-contract-fixture/backup',
      'GET /security-contract-fixture/export',
    ]);
  });

  it('detects removal of a reviewed public contract instead of checking only newly added publics', () => {
    const audit = inspectAccessPolicies(
      CONTROLLERS.filter(({ name }) => name !== 'AuthController'),
    );
    expect(audit.missingPublicEndpoints).toEqual([
      'GET /auth/registration-policy',
      'POST /auth/login',
      'POST /auth/register',
    ]);
  });

  it('detects public methods inherited by a newly discovered controller', () => {
    class BaseController {
      @Public()
      @Get('inherited-export')
      export() {}
    }
    @Controller('security-contract-fixture')
    class DerivedController extends BaseController {}

    const audit = inspectAccessPolicies([
      ...CONTROLLERS,
      { name: DerivedController.name, ctrl: DerivedController },
    ]);

    expect(audit.unexpectedPublicEndpoints).toEqual([
      'GET /security-contract-fixture/inherited-export',
    ]);
  });
});

describe('RBAC Contract — ADMIN-only endpoints', () => {
  it('TeamController class-level is ADMIN only', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, TeamController);
    expect(roles).toEqual([Role.ADMIN]);
  });

  it('AuthController.updateOrganization is ADMIN only', () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      AuthController.prototype.updateOrganization,
    );
    expect(roles).toEqual([Role.ADMIN]);
  });
});
