import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { PoliticalOperationStage, Role } from '../../prisma/generated/prisma';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import {
  OPERATION_STAGE_POLICY_KEY,
  type OperationStagePolicy,
} from '../auth/decorators/operation-stage-policy.decorator';
import { ScrutinyController } from './scrutiny.controller';

describe('ScrutinyController', () => {
  const service = {
    overview: jest.fn(),
    createCommission: jest.fn(),
    configureRequirement: jest.fn(),
    recordSessionEvent: jest.fn(),
    createCoverage: jest.fn(),
    createDocument: jest.fn(),
    reviewDocument: jest.fn(),
    recordCustodyEvent: jest.fn(),
    createDiscrepancy: jest.fn(),
    resolveDiscrepancy: jest.fn(),
    createAction: jest.fn(),
    addActionVersion: jest.fn(),
    approveAction: jest.fn(),
    fileAction: jest.fn(),
    recordDecision: jest.fn(),
    reviewDecision: jest.fn(),
    createDeclaration: jest.fn(),
    reviewDeclaration: jest.fn(),
  };
  const controller = new ScrutinyController(service as never);
  const user = { userId: 'user-a', tenantId: 'tenant-a' };

  beforeEach(() => jest.clearAllMocks());

  it('never accepts tenantId as a route argument and delegates authenticated context', async () => {
    service.createDocument.mockResolvedValue({ id: 'document-a' });
    const dto = { commissionId: 'commission-a' };
    await expect(
      controller.createDocument(user, dto as never),
    ).resolves.toEqual({ id: 'document-a' });
    expect(service.createDocument).toHaveBeenCalledWith(user, dto);
  });

  it('exposes a real route for every workflow command', () => {
    const prototype = ScrutinyController.prototype as unknown as Record<
      string,
      object
    >;
    for (const method of [
      'overview',
      'createCommission',
      'configureRequirement',
      'recordSessionEvent',
      'createCoverage',
      'createDocument',
      'reviewDocument',
      'recordCustodyEvent',
      'createDiscrepancy',
      'resolveDiscrepancy',
      'createAction',
      'addActionVersion',
      'approveAction',
      'fileAction',
      'recordDecision',
      'reviewDecision',
      'createDeclaration',
      'reviewDeclaration',
    ]) {
      expect(
        Reflect.getMetadata(PATH_METADATA, prototype[method]),
      ).toBeDefined();
      expect(
        Reflect.getMetadata(METHOD_METADATA, prototype[method]),
      ).toBeDefined();
    }
  });

  it('allows reads to specialized roles but limits legal mutations and stages', () => {
    const reflector = new Reflector();
    const readRoles = reflector.get<Role[]>(
      ROLES_KEY,
      ScrutinyController.prototype.overview,
    );
    const mutationRoles = reflector.get<Role[]>(
      ROLES_KEY,
      ScrutinyController.prototype.createDeclaration,
    );
    const policy = reflector.get<OperationStagePolicy>(
      OPERATION_STAGE_POLICY_KEY,
      ScrutinyController.prototype.createDeclaration,
    );
    expect(readRoles).toEqual(
      expect.arrayContaining([Role.AUDITOR, Role.WITNESS]),
    );
    expect(mutationRoles).toEqual([
      Role.ADMIN,
      Role.CAMPAIGN_MANAGER,
      Role.COMPLIANCE_OFFICER,
    ]);
    expect(policy).toEqual({
      kind: 'REQUIRE',
      allowedStages: [
        PoliticalOperationStage.ELECTION_DAY,
        PoliticalOperationStage.POST_ELECTION,
      ],
    });
  });
});
