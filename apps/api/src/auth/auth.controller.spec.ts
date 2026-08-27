import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { AuthController } from './auth.controller';

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
});
