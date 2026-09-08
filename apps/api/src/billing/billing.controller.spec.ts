import { Role } from '../../prisma/generated/prisma';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { BillingController } from './billing.controller';

describe('BillingController authorization', () => {
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
