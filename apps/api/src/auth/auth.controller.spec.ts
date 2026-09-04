import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { AuthController } from './auth.controller';
import { ALLOW_REQUIRED_PASSWORD_CHANGE_KEY } from './decorators/allow-required-password-change.decorator';

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
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, AuthController)).toBeUndefined();
  });

  it('allows only session inspection and password change during mandatory change', () => {
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
        AuthController.prototype.login,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(ALLOW_REQUIRED_PASSWORD_CHANGE_KEY, AuthController),
    ).toBeUndefined();
  });
});
