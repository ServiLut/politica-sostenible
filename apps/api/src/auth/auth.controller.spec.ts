import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { AuthController } from './auth.controller';
import { ALLOW_REQUIRED_PASSWORD_CHANGE_KEY } from './decorators/allow-required-password-change.decorator';
import { ROLES_KEY } from './decorators/roles.decorator';
import { Role } from '../../prisma/generated/prisma';
import type { AuthService } from './auth.service';
import type { MfaService } from './mfa.service';

jest.mock('./mfa.service', () => ({
  MfaService: class MfaService {},
}));

describe('AuthController route exposure', () => {
  it('keeps login and registration public but protects the live session', () => {
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, AuthController.prototype.login),
    ).toBe(true);
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, AuthController.prototype.register),
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        IS_PUBLIC_KEY,
        AuthController.prototype.currentSession,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, AuthController.prototype.logout),
    ).toBeUndefined();
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, AuthController)).toBeUndefined();
  });

  it('allows session inspection, password change and logout during mandatory change', () => {
    expect(
      Reflect.getMetadata(
        ALLOW_REQUIRED_PASSWORD_CHANGE_KEY,
        AuthController.prototype.currentSession,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        ALLOW_REQUIRED_PASSWORD_CHANGE_KEY,
        AuthController.prototype.changePassword,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        ALLOW_REQUIRED_PASSWORD_CHANGE_KEY,
        AuthController.prototype.logout,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        ALLOW_REQUIRED_PASSWORD_CHANGE_KEY,
        AuthController.prototype.login,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(ALLOW_REQUIRED_PASSWORD_CHANGE_KEY, AuthController),
    ).toBeUndefined();
  });

  it('protege la edición de organización para administración vigente', () => {
    expect(
      Reflect.getMetadata(
        IS_PUBLIC_KEY,
        AuthController.prototype.updateOrganization,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        ALLOW_REQUIRED_PASSWORD_CHANGE_KEY,
        AuthController.prototype.updateOrganization,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        AuthController.prototype.updateOrganization,
      ),
    ).toEqual([Role.ADMIN]);
  });

  it('conecta el enrolamiento MFA con la contraseña y la identidad autenticada', async () => {
    const generateSecret = jest.fn().mockResolvedValue({
      qrCodeDataUrl: 'data:image/png;base64,qr',
      secret: 'secret',
    });
    const controller = new AuthController(
      {} as AuthService,
      { generateSecret } as unknown as MfaService,
    );

    await controller.setupMfa(
      { userId: 'user-a', tenantId: 'tenant-a', role: Role.ADMIN },
      { currentPassword: 'current-password' },
    );

    expect(generateSecret).toHaveBeenCalledWith(
      'user-a',
      'tenant-a',
      'current-password',
    );
  });

  it('delegates logout using only the authenticated token identity', async () => {
    const logout = jest.fn().mockResolvedValue({
      message: 'Sesiones cerradas en todos los dispositivos',
    });
    const controller = new AuthController(
      { logout } as unknown as AuthService,
      {} as MfaService,
    );
    const user = { userId: 'user-a', tenantId: 'tenant-a', role: Role.ADMIN };

    await expect(controller.logout(user)).resolves.toEqual({
      message: 'Sesiones cerradas en todos los dispositivos',
    });
    expect(logout).toHaveBeenCalledWith(user);
  });
});
