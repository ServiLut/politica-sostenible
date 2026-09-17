import { Reflector } from '@nestjs/core';
import { OPERATION_STAGE_POLICY_KEY } from '../auth/decorators/operation-stage-policy.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { OfflineIncidentController } from './offline-incident.controller';

describe('OfflineIncidentController', () => {
  const service = {
    getCaptureContext: jest.fn(),
    sync: jest.fn(),
  };
  const controller = new OfflineIncidentController(service as never);
  const user = { userId: 'actor-a', tenantId: 'tenant-a' } as AuthenticatedUser;

  beforeEach(() => jest.clearAllMocks());

  it('delega identidad JWT y DTO sin aceptar tenantId ni mode por parámetros', async () => {
    service.sync.mockResolvedValue({ status: 'APPLIED' });
    const dto = { clientOperationId: 'request-a' } as never;
    await expect(controller.sync(user, dto)).resolves.toEqual({
      status: 'APPLIED',
    });
    expect(service.sync).toHaveBeenCalledWith(user, dto);
    expect(OfflineIncidentController.prototype.sync.length).toBe(2);
    expect(OfflineIncidentController.prototype.getContext.length).toBe(1);
  });

  it('bloquea CLOSED en el límite HTTP además de la revalidación transaccional', () => {
    expect(
      new Reflector().get(
        OPERATION_STAGE_POLICY_KEY,
        OfflineIncidentController,
      ),
    ).toEqual({ kind: 'BLOCK_CLOSED' });
  });
});
