import { Reflector } from '@nestjs/core';
import { Role } from '../../prisma/generated/prisma';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { OperationProfileController } from './operation-profile.controller';
import { OperationProfileService } from './operation-profile.service';

describe('OperationProfileController', () => {
  const user: AuthenticatedUser = {
    userId: 'admin-a',
    tenantId: 'tenant-a',
    role: Role.ADMIN,
  };
  const service = {
    getCurrent: jest.fn(),
    upsert: jest.fn(),
  };
  const controller = new OperationProfileController(
    service as unknown as OperationProfileService,
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

  it('delegates writes without accepting a tenant parameter', async () => {
    const dto = { operationType: 'SINGLE_CANDIDACY' };
    service.upsert.mockResolvedValue({ configured: true });

    await expect(controller.upsert(user, dto as never)).resolves.toEqual({
      configured: true,
    });
    expect(service.upsert).toHaveBeenCalledWith(user, dto);
  });

  it('allows every authenticated role to read but only ADMIN to write', () => {
    const reflector = new Reflector();
    const readRoles = reflector.get<Role[]>(
      ROLES_KEY,
      OperationProfileController.prototype.getCurrent,
    );
    const writeRoles = reflector.get<Role[]>(
      ROLES_KEY,
      OperationProfileController.prototype.upsert,
    );

    expect([...(readRoles ?? [])].sort()).toEqual(Object.values(Role).sort());
    expect(writeRoles).toEqual([Role.ADMIN]);
  });
});
