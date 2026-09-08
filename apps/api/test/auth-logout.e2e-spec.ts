import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Role } from '../prisma/generated/prisma';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { MfaService } from '../src/auth/mfa.service';
import type { AuthenticatedRequest } from '../src/auth/interfaces/authenticated-user.interface';

jest.mock('../src/auth/mfa.service', () => ({
  MfaService: class MfaService {},
}));

class BearerIdentityGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (req.headers.authorization !== 'Bearer valid-session') {
      throw new UnauthorizedException('Token invalido o expirado');
    }
    req.user = Object.freeze({
      userId: 'user-a',
      tenantId: 'tenant-a',
      role: Role.VOLUNTEER,
      mustChangePassword: true,
    });
    return true;
  }
}

describe('POST /auth/logout (e2e)', () => {
  let app: INestApplication<App>;
  const logout = jest.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { logout } },
        { provide: MfaService, useValue: {} },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalGuards(new BearerIdentityGuard());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    logout.mockReset();
    logout.mockResolvedValue({
      message: 'Sesiones cerradas en todos los dispositivos',
    });
  });

  it('rejects an unauthenticated revocation request', async () => {
    await request(app.getHttpServer()).post('/auth/logout').expect(401);

    expect(logout).not.toHaveBeenCalled();
  });

  it('accepts logout during mandatory password change and forwards only guard identity', async () => {
    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', 'Bearer valid-session')
      .send({ tenantId: 'tenant-attacker', userId: 'user-attacker' })
      .expect(201)
      .expect({ message: 'Sesiones cerradas en todos los dispositivos' });

    expect(logout).toHaveBeenCalledWith({
      userId: 'user-a',
      tenantId: 'tenant-a',
      role: Role.VOLUNTEER,
      mustChangePassword: true,
    });
  });
});
