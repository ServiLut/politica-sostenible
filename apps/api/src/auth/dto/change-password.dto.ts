import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'La contraseña actual es requerida' })
  @MaxLength(128)
  currentPassword: string;

  @IsString()
  @IsNotEmpty({ message: 'La nueva contraseña es requerida' })
  @MinLength(12, {
    message: 'La nueva contraseña debe tener al menos 12 caracteres',
  })
  @MaxLength(128)
  newPassword: string;
}
