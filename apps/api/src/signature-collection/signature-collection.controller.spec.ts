import { Reflector } from '@nestjs/core';
import { OPERATION_STAGE_POLICY_KEY } from '../auth/decorators/operation-stage-policy.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { SignatureCollectionController } from './signature-collection.controller';

describe('SignatureCollectionController', () => {
  const service = {
    getOverview: jest.fn(),
    createPlan: jest.fn(),
    createBatch: jest.fn(),
    issueBatch: jest.fn(),
    returnBatch: jest.fn(),
    reviewBatch: jest.fn(),
    advanceBatch: jest.fn(),
    quarantineBatch: jest.fn(),
    releaseBatch: jest.fn(),
    recordAuthorityResult: jest.fn(),
    reviewAuthorityResult: jest.fn(),
  };
  const controller = new SignatureCollectionController(service as never);
  const user = {
    tenantId: 'tenant-a',
    userId: 'user-a',
    role: 'ADMIN',
  } as AuthenticatedUser;

  beforeEach(() => jest.clearAllMocks());

  it('delegates tenant identity exclusively through the authenticated context', async () => {
    const dto = { clientRequestId: 'request-a' } as never;
    service.createBatch.mockResolvedValue({ ok: true });
    await expect(controller.createBatch(user, dto)).resolves.toEqual({
      ok: true,
    });
    expect(service.createBatch).toHaveBeenCalledWith(user, dto);
  });

  it('marks every mutator as blocked after operation closure', () => {
    const reflector = new Reflector();
    for (const method of [
      'createPlan',
      'createBatch',
      'issueBatch',
      'returnBatch',
      'reviewBatch',
      'advanceBatch',
      'quarantineBatch',
      'releaseBatch',
      'recordAuthorityResult',
      'reviewAuthorityResult',
    ] as const) {
      expect(
        reflector.get(
          OPERATION_STAGE_POLICY_KEY,
          SignatureCollectionController.prototype[method],
        ),
      ).toEqual({ kind: 'BLOCK_CLOSED' });
    }
  });

  it('never accepts tenantId as a route or body argument', () => {
    expect(SignatureCollectionController.prototype.createPlan.length).toBe(2);
    expect(SignatureCollectionController.prototype.issueBatch.length).toBe(3);
    expect(
      SignatureCollectionController.prototype.reviewAuthorityResult.length,
    ).toBe(3);
  });
});
