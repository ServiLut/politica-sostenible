import { Reflector } from '@nestjs/core';
import { OPERATION_STAGE_POLICY_KEY } from '../auth/decorators/operation-stage-policy.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { SignatureCountCorrectionController } from './signature-count-correction.controller';

describe('SignatureCountCorrectionController', () => {
  const service = {
    getOverview: jest.fn(),
    propose: jest.fn(),
    decide: jest.fn(),
  };
  const controller = new SignatureCountCorrectionController(service as never);
  const user = {
    tenantId: 'tenant-a',
    userId: 'manager-a',
    role: 'CAMPAIGN_MANAGER',
  } as AuthenticatedUser;

  beforeEach(() => jest.clearAllMocks());

  it('takes tenant identity only from the authenticated user', async () => {
    const params = { id: 'batch-a' };
    const dto = { clientRequestId: 'request-a' } as never;
    service.propose.mockResolvedValue({ ok: true });

    await expect(controller.propose(user, params, dto)).resolves.toEqual({
      ok: true,
    });
    expect(service.propose).toHaveBeenCalledWith(user, params.id, dto);
    expect(SignatureCountCorrectionController.prototype.propose.length).toBe(3);
    expect(SignatureCountCorrectionController.prototype.decide.length).toBe(3);
  });

  it.each(['propose', 'decide'] as const)(
    'fences %s when the operation is CLOSED',
    (method) => {
      expect(
        new Reflector().get(
          OPERATION_STAGE_POLICY_KEY,
          SignatureCountCorrectionController.prototype[method],
        ),
      ).toEqual({ kind: 'BLOCK_CLOSED' });
    },
  );
});
