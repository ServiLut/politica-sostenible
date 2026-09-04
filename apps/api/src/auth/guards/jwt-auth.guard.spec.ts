import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../interfaces/authenticated-user.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { createSessionVersion } from '../session-version';
import { ALLOW_REQUIRED_PASSWORD_CHANGE_KEY } from '../decorators/allow-required-password-change.decorator';

const TEST_JWT_SECRET = 'test-only-jwt-secret-at-least-32-bytes-long';
const STORED_PASSWORD_HASH = 'stored-password-hash';

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
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    verifyAsync = jest.fn();
    getAllAndOverride = jest.fn().mockReturnValue(false);
    findFirst = jest.fn().mockResolvedValue({
      email: 'current@example.test',
      role: 'VOLUNTEER',
      password: STORED_PASSWORD_HASH,
      mustChangePassword: false,
      temporaryPasswordExpiresAt: null,
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
      sessionVersion: createSessionVersion(
        'user-from-token',
        STORED_PASSWORD_HASH,
      ),
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
      mustChangePassword: false,
      temporaryPasswordExpiresAt: null,
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'user-from-token',
        tenantId: 'tenant-from-token',
        isActive: true,
      },
      select: {
        email: true,
        role: true,
        password: true,
        mustChangePassword: true,
        temporaryPasswordExpiresAt: true,
      },
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

  it('rejects legacy tokens without a password-bound session version', async () => {
    verifyAsync.mockResolvedValue({
      sub: 'user-from-token',
      tenantId: 'tenant-from-token',
    });
    const request = { headers: { authorization: 'Bearer signed-token' } };

    await expect(
      guard.canActivate(buildContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token immediately after the stored password hash changes', async () => {
    verifyAsync.mockResolvedValue({
      sub: 'user-from-token',
      tenantId: 'tenant-from-token',
      sessionVersion: createSessionVersion(
        'user-from-token',
        'previous-password-hash',
      ),
    });
    const request = { headers: { authorization: 'Bearer signed-token' } };

    await expect(
      guard.canActivate(buildContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it('blocks ordinary endpoints until a valid temporary password is changed', async () => {
    verifyAsync.mockResolvedValue({
      sub: 'user-from-token',
      tenantId: 'tenant-from-token',
      sessionVersion: createSessionVersion(
        'user-from-token',
        STORED_PASSWORD_HASH,
      ),
    });
    findFirst.mockResolvedValue({
      email: 'current@example.test',
      role: 'VOLUNTEER',
      password: STORED_PASSWORD_HASH,
      mustChangePassword: true,
      temporaryPasswordExpiresAt: new Date(Date.now() + 60_000),
    });
    const request = { headers: { authorization: 'Bearer signed-token' } };

    await expect(guard.canActivate(buildContext(request))).rejects.toMatchObject(
      {
        constructor: ForbiddenException,
        response: {
          code: 'PASSWORD_CHANGE_REQUIRED',
        },
      },
    );
  });

  it('allows only an explicitly decorated endpoint during mandatory change', async () => {
    getAllAndOverride.mockImplementation(
      (key: string) => key === ALLOW_REQUIRED_PASSWORD_CHANGE_KEY,
    );
    verifyAsync.mockResolvedValue({
      sub: 'user-from-token',
      tenantId: 'tenant-from-token',
      sessionVersion: createSessionVersion(
        'user-from-token',
        STORED_PASSWORD_HASH,
      ),
    });
    const expiresAt = new Date(Date.now() + 60_000);
    findFirst.mockResolvedValue({
      email: 'current@example.test',
      role: 'VOLUNTEER',
      password: STORED_PASSWORD_HASH,
      mustChangePassword: true,
      temporaryPasswordExpiresAt: expiresAt,
    });
    const request = {
      headers: { authorization: 'Bearer signed-token' },
    } as unknown as AuthenticatedRequest;

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);
    expect(request.user).toEqual(
      expect.objectContaining({
        mustChangePassword: true,
        temporaryPasswordExpiresAt: expiresAt,
      }),
    );
  });

  it('rejects expired temporary access even on a change-allowed endpoint', async () => {
    getAllAndOverride.mockImplementation(
      (key: string) => key === ALLOW_REQUIRED_PASSWORD_CHANGE_KEY,
    );
    verifyAsync.mockResolvedValue({
      sub: 'user-from-token',
      tenantId: 'tenant-from-token',
      sessionVersion: createSessionVersion(
        'user-from-token',
        STORED_PASSWORD_HASH,
      ),
    });
    findFirst.mockResolvedValue({
      email: 'current@example.test',
      role: 'VOLUNTEER',
      password: STORED_PASSWORD_HASH,
      mustChangePassword: true,
      temporaryPasswordExpiresAt: new Date(Date.now() - 1),
    });
    const request = { headers: { authorization: 'Bearer signed-token' } };

    await expect(
      guard.canActivate(buildContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
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
