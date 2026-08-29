import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  AuditActorType,
  PoliticalOperationMode,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('AuthService organization onboarding', () => {
  it('creates a public-office tenant and versioned terms audit atomically', async () => {
    const tenantCreate = jest.fn().mockResolvedValue({ id: 'tenant-created' });
    const userCreate = jest.fn().mockResolvedValue({ id: 'user-created' });
    const auditCreate = jest.fn().mockResolvedValue({ id: 'audit-created' });
    const transactionClient = {
      tenant: { create: tenantCreate },
      user: { create: userCreate },
      auditEvent: { create: auditCreate },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(
        async (
          callback: (client: typeof transactionClient) => Promise<unknown>,
        ) => callback(transactionClient),
      ),
    } as unknown as PrismaService;
    const jwt = { signAsync: jest.fn() } as unknown as JwtService;
    const service = new AuthService(prisma, jwt);
    jest.mocked(bcrypt.hash).mockResolvedValue('hashed-password' as never);

    await service.register({
      email: 'admin@example.test',
      password: 'clave-segura-2026',
      name: 'Ana Pérez',
      documentId: '1012345678',
      organizationName: 'Concejo abierto',
      organizationType: TenantType.PUBLIC_OFFICE,
      termsAccepted: true,
      termsVersion: '2026.1',
    });

    expect(tenantCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Concejo abierto',
        slug: expect.stringMatching(/^concejo-abierto-[0-9a-f]{8}$/),
        type: TenantType.PUBLIC_OFFICE,
        defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
      }),
    });
    expect(userCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-created',
        role: Role.ADMIN,
        password: 'hashed-password',
      }),
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-created',
        mode: PoliticalOperationMode.PUBLIC_OFFICE,
        actorType: AuditActorType.USER,
        actorUserId: 'user-created',
        action: 'ACCOUNT_TERMS_ACCEPTED',
        metadata: {
          termsVersion: '2026.1',
          organizationType: TenantType.PUBLIC_OFFICE,
        },
      }),
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('uses a generic registration conflict after paying the password-hash cost', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'existing' }) },
      $transaction: jest.fn(),
    } as unknown as PrismaService;
    jest.mocked(bcrypt.hash).mockResolvedValue('unused-hash' as never);
    const service = new AuthService(prisma, {
      signAsync: jest.fn(),
    } as unknown as JwtService);

    await expect(
      service.register({
        email: 'existing@example.test',
        password: 'clave-segura-2026',
        name: 'Persona',
        documentId: '1012345678',
        organizationName: 'Organización',
        organizationType: TenantType.CANDIDACY,
        termsAccepted: true,
        termsVersion: '2026.1',
      }),
    ).rejects.toMatchObject({
      constructor: ConflictException,
      message: 'No fue posible crear la cuenta con esos identificadores',
    });
    expect(bcrypt.hash).toHaveBeenCalledWith('clave-segura-2026', 12);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('AuthService login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ejecuta bcrypt aun cuando el correo no existe', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const jwt = { signAsync: jest.fn() } as unknown as JwtService;
    const service = new AuthService(prisma, jwt);
    jest.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(
      service.login({
        email: 'inexistente@example.test',
        password: 'clave-segura-2026',
      }),
    ).rejects.toEqual(new UnauthorizedException('Credenciales inválidas'));

    expect(bcrypt.compare).toHaveBeenCalledWith(
      'clave-segura-2026',
      expect.stringMatching(/^\$2b\$12\$/),
    );
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('firma un token tenant-scoped solo tras validar la contraseña', async () => {
    const user = {
      id: 'user-a',
      email: 'admin@example.test',
      password: 'stored-password-hash',
      name: 'Administradora',
      role: Role.ADMIN,
      isActive: true,
      tenantId: 'tenant-a',
      tenant: {
        id: 'tenant-a',
        name: 'Campaña A',
        slug: 'campana-a',
        type: TenantType.CANDIDACY,
        defaultMode: PoliticalOperationMode.CAMPAIGN,
      },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
    } as unknown as PrismaService;
    const jwt = {
      signAsync: jest.fn().mockResolvedValue('signed-jwt'),
    } as unknown as JwtService;
    const service = new AuthService(prisma, jwt);
    jest.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const result = await service.login({
      email: user.email,
      password: 'clave-segura-2026',
    });

    expect(jwt.signAsync).toHaveBeenCalledWith({
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    });
    expect(result).not.toHaveProperty('password');
    expect(result.user).not.toHaveProperty('password');
  });

  it('rechaza cuentas desactivadas con el mismo error generico', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'disabled-user',
          email: 'disabled@example.test',
          password: 'stored-password-hash',
          name: 'Cuenta desactivada',
          role: Role.VOLUNTEER,
          isActive: false,
          tenantId: 'tenant-a',
          tenant: {
            id: 'tenant-a',
            name: 'Tenant A',
            slug: 'tenant-a',
            type: TenantType.CANDIDACY,
            defaultMode: PoliticalOperationMode.CAMPAIGN,
          },
        }),
      },
    } as unknown as PrismaService;
    const jwt = { signAsync: jest.fn() } as unknown as JwtService;
    const service = new AuthService(prisma, jwt);
    jest.mocked(bcrypt.compare).mockResolvedValue(true as never);

    await expect(
      service.login({
        email: 'disabled@example.test',
        password: 'clave-segura-2026',
      }),
    ).rejects.toEqual(new UnauthorizedException('Credenciales inválidas'));

    expect(bcrypt.compare).toHaveBeenCalledWith(
      'clave-segura-2026',
      'stored-password-hash',
    );
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});

describe('AuthService current session', () => {
  it('returns only the current active user and safe tenant projection', async () => {
    const current = {
      id: 'user-a',
      email: 'admin@example.test',
      name: 'Administracion',
      role: Role.ADMIN,
      tenant: {
        id: 'tenant-a',
        name: 'Tenant A',
        slug: 'tenant-a',
        type: TenantType.CANDIDACY,
        defaultMode: PoliticalOperationMode.CAMPAIGN,
      },
    };
    const findFirst = jest.fn().mockResolvedValue(current);
    const prisma = { user: { findFirst } } as unknown as PrismaService;
    const service = new AuthService(prisma, {
      signAsync: jest.fn(),
    } as unknown as JwtService);

    await expect(
      service.currentSession({
        userId: 'user-a',
        tenantId: 'tenant-a',
        role: Role.ADMIN,
      }),
    ).resolves.toEqual({ user: current });

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'user-a',
        tenantId: 'tenant-a',
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            type: true,
            defaultMode: true,
          },
        },
      },
    });
    const serializedProjection = JSON.stringify(findFirst.mock.calls[0][0]);
    expect(serializedProjection).not.toContain('password');
    expect(serializedProjection).not.toContain('documentId');
    expect(serializedProjection).not.toContain('phone');
  });

  it('fails closed if the account disappeared or became inactive', async () => {
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new AuthService(prisma, {
      signAsync: jest.fn(),
    } as unknown as JwtService);

    await expect(
      service.currentSession({
        userId: 'disabled-user',
        tenantId: 'tenant-a',
        role: Role.VOLUNTEER,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('AuthService password change', () => {
  beforeEach(() => jest.clearAllMocks());

  it('updates only the active tenant-scoped user and writes an audit event', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const auditCreate = jest.fn().mockResolvedValue({ id: 'audit-a' });
    const transactionClient = {
      user: { updateMany },
      auditEvent: { create: auditCreate },
    };
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-a',
          password: 'stored-password-hash',
          tenant: { defaultMode: PoliticalOperationMode.CAMPAIGN },
        }),
      },
      $transaction: jest.fn(
        async (
          callback: (client: typeof transactionClient) => Promise<unknown>,
        ) => callback(transactionClient),
      ),
    } as unknown as PrismaService;
    const service = new AuthService(prisma, {
      signAsync: jest.fn(),
    } as unknown as JwtService);
    jest.mocked(bcrypt.compare).mockResolvedValue(true as never);
    jest.mocked(bcrypt.hash).mockResolvedValue('new-password-hash' as never);

    await expect(
      service.changePassword(
        { userId: 'user-a', tenantId: 'tenant-a', role: Role.VOLUNTEER },
        {
          currentPassword: 'clave-segura-2026',
          newPassword: 'otra-clave-segura-2026',
        },
      ),
    ).resolves.toEqual({ message: 'Contraseña actualizada correctamente' });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'user-a', tenantId: 'tenant-a', isActive: true },
      data: { password: 'new-password-hash' },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        actorUserId: 'user-a',
        action: 'ACCOUNT_PASSWORD_CHANGED',
        resourceId: 'user-a',
      }),
    });
  });

  it('does not update when the current password is incorrect', async () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-a',
          password: 'stored-password-hash',
          tenant: { defaultMode: PoliticalOperationMode.CAMPAIGN },
        }),
      },
      $transaction: jest.fn(),
    } as unknown as PrismaService;
    const service = new AuthService(prisma, {
      signAsync: jest.fn(),
    } as unknown as JwtService);
    jest.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(
      service.changePassword(
        { userId: 'user-a', tenantId: 'tenant-a', role: Role.ADMIN },
        {
          currentPassword: 'clave-equivocada',
          newPassword: 'otra-clave-segura-2026',
        },
      ),
    ).rejects.toEqual(
      new UnauthorizedException('La contraseña actual no es correcta'),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
