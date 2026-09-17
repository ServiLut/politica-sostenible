import { Role } from '../../prisma/generated/prisma';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { BillingController } from './billing.controller';

describe('BillingController authorization', () => {
  it('expone el snapshot de capacidades a todos los roles autenticados', () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        BillingController.prototype.getCapabilities,
      ),
    ).toEqual(Object.values(Role));
  });

  it.each(['getSubscription', 'getUsage'] as const)(
    'reserva %s para administración del tenant',
    (method) => {
      expect(
        Reflect.getMetadata(ROLES_KEY, BillingController.prototype[method]),
      ).toEqual([Role.ADMIN]);
    },
  );

  it('mantiene el catálogo de planes autenticado pero sin datos privados del tenant', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, BillingController.prototype.getPlans),
    ).toBeUndefined();
  });
});

describe('BillingController capabilities', () => {
  it('entrega al servicio exclusivamente la identidad autenticada', async () => {
    const getCapabilities = jest.fn().mockResolvedValue({
      plan: { code: 'FREE', name: 'Gratis' },
      features: { export: false, import: false, mfa: false },
    });
    const controller = new BillingController({
      getCapabilities,
    } as never);
    const user = {
      userId: 'user-a',
      tenantId: 'tenant-a',
      role: Role.VOLUNTEER,
    };

    await expect(controller.getCapabilities(user)).resolves.toEqual({
      plan: { code: 'FREE', name: 'Gratis' },
      features: { export: false, import: false, mfa: false },
    });
    expect(getCapabilities).toHaveBeenCalledWith(user);
  });
});
