import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../interfaces/authenticated-user.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const buildContext = (request: object) =>
    ({
      getHandler: () => function protectedHandler() {},
      getClass: () => class ProtectedController {},
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as unknown as ExecutionContext;

  let verifyAsync: jest.Mock;
  let getAllAndOverride: jest.Mock;
  let findFirst: jest.Mock;
  let guard: JwtAuthGuard;

  beforeEach(() => {
    verifyAsync = jest.fn();
    getAllAndOverride = jest.fn().mockReturnValue(false);
    findFirst = jest.fn().mockResolvedValue({
      email: 'current@example.test',
      role: 'VOLUNTEER',
    });
    guard = new JwtAuthGuard(
      { verifyAsync } as unknown as JwtService,
      { getAllAndOverride } as unknown as Reflector,
      { user: { findFirst } } as unknown as PrismaService,
    );
  });

  it('derives identity from the token but uses the current database role', async () => {
    const request = {
      headers: {
        authorization: 'Bearer signed-token',
        'x-tenant-id': 'tenant-attacker',
        'x-user-id': 'user-attacker',
      },
      body: {
        tenantId: 'tenant-attacker',
        userId: 'user-attacker',
      },
    } as unknown as AuthenticatedRequest;
    verifyAsync.mockResolvedValue({
      sub: 'user-from-token',
      tenantId: 'tenant-from-token',
      email: 'stale@example.com',
      role: 'ADMIN',
    });

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);

    expect(verifyAsync).toHaveBeenCalledWith('signed-token', {
      algorithms: ['HS256'],
    });
    expect(request.user).toEqual({
      userId: 'user-from-token',
      tenantId: 'tenant-from-token',
      email: 'current@example.test',
      role: 'VOLUNTEER',
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'user-from-token',
        tenantId: 'tenant-from-token',
        isActive: true,
      },
      select: { email: true, role: true },
    });
    expect(Object.isFrozen(request.user)).toBe(true);
  });

  it('rejects a disabled or deleted account immediately', async () => {
    verifyAsync.mockResolvedValue({
      sub: 'disabled-user',
      tenantId: 'tenant-a',
      role: 'ADMIN',
    });
    findFirst.mockResolvedValue(null);
    const request = { headers: { authorization: 'Bearer signed-token' } };

    await expect(
      guard.canActivate(buildContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true }),
      }),
    );
  });

  it.each([
    undefined,
    'Basic credentials',
    'Bearer',
    'Bearer token extra-value',
  ])(
    'rejects a missing or malformed Authorization header: %s',
    async (value) => {
      const request = { headers: { authorization: value } };

      await expect(
        guard.canActivate(buildContext(request)),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(verifyAsync).not.toHaveBeenCalled();
      expect(findFirst).not.toHaveBeenCalled();
    },
  );

  it('rejects a token without tenant identity', async () => {
    verifyAsync.mockResolvedValue({ sub: 'user-from-token' });
    const request = { headers: { authorization: 'Bearer signed-token' } };

    await expect(
      guard.canActivate(buildContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('rejects a token that fails signature or expiry verification', async () => {
    verifyAsync.mockRejectedValue(new Error('invalid signature'));
    const request = { headers: { authorization: 'Bearer invalid-token' } };

    await expect(
      guard.canActivate(buildContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows endpoints explicitly decorated as public', async () => {
    getAllAndOverride.mockReturnValue(true);
    const request = { headers: {} };

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);
    expect(verifyAsync).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
  });
});
