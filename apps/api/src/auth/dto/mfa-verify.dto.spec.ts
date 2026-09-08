import { validate } from 'class-validator';
import { MfaVerifyDto } from './mfa-verify.dto';

describe('MfaVerifyDto', () => {
  it.each(['000000', '123456', '999999'])(
    'accepts a six-digit TOTP code: %s',
    async (code) => {
      const dto = Object.assign(new MfaVerifyDto(), { code });
      await expect(validate(dto)).resolves.toHaveLength(0);
    },
  );

  it.each(['', '12345', '1234567', 'abcdef', '１２３４５６', 123456])(
    'rejects a non-canonical TOTP code: %s',
    async (code) => {
      const dto = Object.assign(new MfaVerifyDto(), { code });
      expect(await validate(dto)).not.toHaveLength(0);
    },
  );
});
