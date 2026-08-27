import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../../prisma/generated/prisma';
import type { AuthenticatedRequest } from '../interfaces/authenticated-user.interface';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const buildContext = (role?: string) =>
    ({
      getHandler: () => function protectedHandler() {},
      getClass: () => class ProtectedController {},
      switchToHttp: () => ({
        getRequest: () =>
          ({ user: role ? { role } : {} }) as unknown as AuthenticatedRequest,
      }),
    }) as unknown as ExecutionContext;

  let getAllAndOverride: jest.Mock;
  let guard: RolesGuard;

  beforeEach(() => {
    getAllAndOverride = jest.fn();
    guard = new RolesGuard({ getAllAndOverride } as unknown as Reflector);
  });

  it('allows authenticated routes without role metadata', () => {
    getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(buildContext(Role.VOLUNTEER))).toBe(true);
  });

  it('allows a role included in the endpoint metadata', () => {
    getAllAndOverride.mockReturnValue([Role.ADMIN, Role.CAMPAIGN_MANAGER]);

    expect(guard.canActivate(buildContext(Role.CAMPAIGN_MANAGER))).toBe(true);
  });

  it('returns 403 when the authenticated role is not allowed', () => {
    getAllAndOverride.mockReturnValue([Role.ADMIN]);

    expect(() => guard.canActivate(buildContext(Role.VOLUNTEER))).toThrow(
      ForbiddenException,
    );
  });

  it('returns 403 when a protected endpoint receives no role', () => {
    getAllAndOverride.mockReturnValue([Role.ADMIN]);

    expect(() => guard.canActivate(buildContext())).toThrow(ForbiddenException);
  });
});
