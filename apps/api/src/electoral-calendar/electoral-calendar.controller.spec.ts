import { Reflector } from '@nestjs/core';
import { OPERATION_STAGE_POLICY_KEY } from '../auth/decorators/operation-stage-policy.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ElectoralCalendarController } from './electoral-calendar.controller';

describe('ElectoralCalendarController', () => {
  const service = {
    getOverview: jest.fn(),
    createRelease: jest.fn(),
    validateRelease: jest.fn(),
    activateRelease: jest.fn(),
    recordResult: jest.fn(),
    reviewResult: jest.fn(),
  };
  const controller = new ElectoralCalendarController(service as never);
  const user = { userId: 'actor-a', tenantId: 'tenant-a' } as AuthenticatedUser;

  beforeEach(() => jest.clearAllMocks());

  it('delegates with the JWT identity and never accepts tenantId or mode', async () => {
    service.createRelease.mockResolvedValue({ ok: true });
    const dto = { clientRequestId: 'request-a' } as never;
    await expect(controller.createRelease(user, dto)).resolves.toEqual({
      ok: true,
    });
    expect(service.createRelease).toHaveBeenCalledWith(user, dto);
    expect(ElectoralCalendarController.prototype.createRelease.length).toBe(2);
    expect(ElectoralCalendarController.prototype.activateRelease.length).toBe(
      3,
    );
  });

  it('marks every mutation as CLOSED fail-closed at the controller boundary', () => {
    const reflector = new Reflector();
    for (const method of [
      'createRelease',
      'validateRelease',
      'activateRelease',
      'recordResult',
      'reviewResult',
    ] as const) {
      expect(
        reflector.get(
          OPERATION_STAGE_POLICY_KEY,
          ElectoralCalendarController.prototype[method],
        ),
      ).toEqual({ kind: 'BLOCK_CLOSED' });
    }
  });
});
