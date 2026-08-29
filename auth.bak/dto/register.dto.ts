import {
  IsEmail,
  IsNotEmpty,
  MinLength,
  IsBoolean,
  Equals,
} from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @IsNotEmpty({ message: 'El correo electrónico es obligatorio' })
  email: string;

  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password: string;

  @IsBoolean()
  @Equals(true, { message: 'Debes aceptar los términos y condiciones' })
  acceptTerms: boolean;
}
