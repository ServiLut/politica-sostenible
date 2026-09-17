import { Reflector } from '@nestjs/core';
import { Role } from '../../prisma/generated/prisma';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import {
  OPERATION_STAGE_POLICY_KEY,
  type OperationStagePolicy,
} from '../auth/decorators/operation-stage-policy.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { OperationProfileController } from './operation-profile.controller';
import { OperationProfileService } from './operation-profile.service';
import { OperationStageAdoptionService } from './operation-stage-adoption.service';
import { OperationTerminationService } from './operation-termination.service';

describe('OperationProfileController', () => {
  const user: AuthenticatedUser = {
    userId: 'admin-a',
    tenantId: 'tenant-a',
    role: Role.ADMIN,
  };
  const service = {
    getCurrent: jest.fn(),
    getReadiness: jest.fn(),
    upsert: jest.fn(),
  };
  const adoption = {
    getStatus: jest.fn(),
    requestAdoption: jest.fn(),
    reviewAdoption: jest.fn(),
  };
  const termination = {
    getStatus: jest.fn(),
    requestTermination: jest.fn(),
    reviewTermination: jest.fn(),
    cancelTermination: jest.fn(),
  };
  const controller = new OperationProfileController(
    service as unknown as OperationProfileService,
    adoption as unknown as OperationStageAdoptionService,
    termination as unknown as OperationTerminationService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('delegates reads using only the authenticated user context', async () => {
    service.getCurrent.mockResolvedValue({ configured: false, profile: null });

    await expect(controller.getCurrent(user)).resolves.toEqual({
      configured: false,
      profile: null,
    });
    expect(service.getCurrent).toHaveBeenCalledWith(user);
  });

  it('delegates readiness using only the revalidated authenticated context', async () => {
    service.getReadiness.mockResolvedValue({
      stage: null,
      electionDate: null,
      generatedAt: '2026-09-09T15:00:00.000Z',
      overall: 'BLOCKED',
      sections: {
        BEFORE_CAMPAIGN: [],
        CAMPAIGN: [],
        ELECTION_DAY: [],
        POST_ELECTION: [],
      },
    });

    await expect(controller.getReadiness(user)).resolves.toMatchObject({
      stage: null,
      overall: 'BLOCKED',
    });
    expect(service.getReadiness).toHaveBeenCalledWith(user);
  });

  it('delegates writes without accepting a tenant parameter', async () => {
    const dto = { operationType: 'SINGLE_CANDIDACY' };
    service.upsert.mockResolvedValue({ configured: true });

    await expect(controller.upsert(user, dto as never)).resolves.toEqual({
      configured: true,
    });
    expect(service.upsert).toHaveBeenCalledWith(user, dto);
  });

  it('delegates adoption request, status and independent review using JWT context', async () => {
    const request = { clientRequestId: 'request-client-a' };
    const review = { decision: 'APPROVE' };
    adoption.getStatus.mockResolvedValue({ request: null });
    adoption.requestAdoption.mockResolvedValue({ created: true });
    adoption.reviewAdoption.mockResolvedValue({ approved: true });

    await expect(controller.getAdoptionStatus(user)).resolves.toEqual({
      request: null,
    });
    await expect(
      controller.requestAdoption(user, request as never),
    ).resolves.toEqual({ created: true });
    await expect(
      controller.reviewAdoption(
        { ...user, role: Role.AUDITOR },
        { id: 'adoption-a' },
        review as never,
      ),
    ).resolves.toEqual({ approved: true });
    expect(adoption.getStatus).toHaveBeenCalledWith(user);
    expect(adoption.requestAdoption).toHaveBeenCalledWith(user, request);
    expect(adoption.reviewAdoption).toHaveBeenCalledWith(
      { ...user, role: Role.AUDITOR },
      'adoption-a',
      review,
    );
  });

  it('delegates termination status, request, four-eyes review and cancellation using only JWT tenant context', async () => {
    const request = { clientRequestId: 'termination-client-a' };
    const review = { decision: 'APPROVE' };
    const cancellation = { reason: 'Causal corregida en el expediente formal' };
    termination.getStatus.mockResolvedValue({ request: null });
    termination.requestTermination.mockResolvedValue({ created: true });
    termination.reviewTermination.mockResolvedValue({ approved: true });
    termination.cancelTermination.mockResolvedValue({ cancelled: true });

    await expect(controller.getTerminationStatus(user)).resolves.toEqual({
      request: null,
    });
    await expect(
      controller.requestTermination(user, request as never),
    ).resolves.toEqual({ created: true });
    await expect(
      controller.reviewTermination(
        { ...user, role: Role.AUDITOR },
        { id: 'termination-a' },
        review as never,
      ),
    ).resolves.toEqual({ approved: true });
    await expect(
      controller.cancelTermination(
        user,
        { id: 'termination-a' },
        cancellation as never,
      ),
    ).resolves.toEqual({ cancelled: true });

    expect(termination.getStatus).toHaveBeenCalledWith(user);
    expect(termination.requestTermination).toHaveBeenCalledWith(user, request);
    expect(termination.reviewTermination).toHaveBeenCalledWith(
      { ...user, role: Role.AUDITOR },
      'termination-a',
      review,
    );
    expect(termination.cancelTermination).toHaveBeenCalledWith(
      user,
      'termination-a',
      cancellation,
    );
  });

  it('allows the same authenticated roles to read profile/readiness but only ADMIN to write', () => {
    const reflector = new Reflector();
    const readRoles = reflector.get<Role[]>(
      ROLES_KEY,
      OperationProfileController.prototype.getCurrent,
    );
    const readinessRoles = reflector.get<Role[]>(
      ROLES_KEY,
      OperationProfileController.prototype.getReadiness,
    );
    const writeRoles = reflector.get<Role[]>(
      ROLES_KEY,
      OperationProfileController.prototype.upsert,
    );
    const adoptionReadRoles = reflector.get<Role[]>(
      ROLES_KEY,
      OperationProfileController.prototype.getAdoptionStatus,
    );
    const adoptionRequestRoles = reflector.get<Role[]>(
      ROLES_KEY,
      OperationProfileController.prototype.requestAdoption,
    );
    const adoptionReviewRoles = reflector.get<Role[]>(
      ROLES_KEY,
      OperationProfileController.prototype.reviewAdoption,
    );
    const terminationReadRoles = reflector.get<Role[]>(
      ROLES_KEY,
      OperationProfileController.prototype.getTerminationStatus,
    );
    const terminationRequestRoles = reflector.get<Role[]>(
      ROLES_KEY,
      OperationProfileController.prototype.requestTermination,
    );
    const terminationReviewRoles = reflector.get<Role[]>(
      ROLES_KEY,
      OperationProfileController.prototype.reviewTermination,
    );
    const terminationCancelRoles = reflector.get<Role[]>(
      ROLES_KEY,
      OperationProfileController.prototype.cancelTermination,
    );
    const upsertPolicy = reflector.get<OperationStagePolicy>(
      OPERATION_STAGE_POLICY_KEY,
      OperationProfileController.prototype.upsert,
    );

    expect([...(readRoles ?? [])].sort()).toEqual(Object.values(Role).sort());
    expect([...(readinessRoles ?? [])].sort()).toEqual(
      Object.values(Role).sort(),
    );
    expect(writeRoles).toEqual([Role.ADMIN]);
    expect(adoptionReadRoles).toEqual([
      Role.ADMIN,
      Role.COMPLIANCE_OFFICER,
      Role.AUDITOR,
    ]);
    expect(adoptionRequestRoles).toEqual([Role.ADMIN]);
    expect(adoptionReviewRoles).toEqual([
      Role.COMPLIANCE_OFFICER,
      Role.AUDITOR,
    ]);
    expect(terminationReadRoles).toEqual([
      Role.ADMIN,
      Role.COMPLIANCE_OFFICER,
      Role.AUDITOR,
    ]);
    expect(terminationRequestRoles).toEqual([Role.ADMIN]);
    expect(terminationReviewRoles).toEqual([
      Role.COMPLIANCE_OFFICER,
      Role.AUDITOR,
    ]);
    expect(terminationCancelRoles).toEqual([Role.ADMIN]);
    expect(upsertPolicy).toEqual({ kind: 'BLOCK_CLOSED' });
  });
});
