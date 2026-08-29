import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChangePasswordDto } from './change-password.dto';

describe('ChangePasswordDto', () => {
  it('accepts a valid current and new password pair', async () => {
    const dto = plainToInstance(ChangePasswordDto, {
      currentPassword: 'clave-actual-segura',
      newPassword: 'clave-nueva-segura',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects a short new password', async () => {
    const dto = plainToInstance(ChangePasswordDto, {
      currentPassword: 'clave-actual',
      newPassword: 'corta',
    });

    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toContain('newPassword');
  });
});
