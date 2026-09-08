import { validate } from 'class-validator';
import { LoginDto } from './login.dto';

function dtoWith(code?: unknown): LoginDto {
  return Object.assign(new LoginDto(), {
    email: 'person@example.test',
    password: 'secure-password',
    ...(code === undefined ? {} : { totpCode: code }),
  });
}

describe('LoginDto TOTP contract', () => {
  it.each([undefined, '000000', '123456', '999999'])(
    'accepts an absent or canonical six-digit code: %s',
    async (code) => {
      await expect(validate(dtoWith(code))).resolves.toHaveLength(0);
    },
  );

  it.each(['', '12345', '1234567', 'abcdef', '12 456', '１２３４５６', 123456])(
    'rejects a non-canonical code before calling otplib: %s',
    async (code) => {
      expect(await validate(dtoWith(code))).not.toHaveLength(0);
    },
  );
});
