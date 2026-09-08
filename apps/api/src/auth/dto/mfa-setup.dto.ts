import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class MfaSetupDto {
  @IsString()
  @IsNotEmpty({ message: 'La contraseña actual es requerida' })
  @MaxLength(128)
  currentPassword: string;
}
