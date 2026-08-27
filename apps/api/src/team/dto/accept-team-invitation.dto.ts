import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class AcceptTeamInvitationDto {
  @IsString()
  @Length(43, 43, { message: 'El token de invitacion no es valido' })
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'El token de invitacion no es valido',
  })
  token: string;

  @IsString()
  @IsNotEmpty({ message: 'La contrasena es requerida' })
  @MinLength(12, {
    message: 'La contrasena debe tener al menos 12 caracteres',
  })
  @MaxLength(128)
  password: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'El nombre completo es requerido' })
  @MaxLength(120)
  name: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'El numero de documento es requerido' })
  @MaxLength(30)
  @Matches(/^[\p{L}\p{N}.-]+$/u, {
    message: 'El documento contiene caracteres no permitidos',
  })
  documentId: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const normalized = value.trim();
    return normalized || undefined;
  })
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/, {
    message: 'El telefono debe contener entre 7 y 15 digitos',
  })
  phone?: string;

  @IsBoolean()
  @Equals(true, { message: 'Debes aceptar los terminos para continuar' })
  termsAccepted: boolean;

  @IsString()
  @IsIn(['2026.1'], { message: 'La version de terminos no es valida' })
  termsVersion: string;
}
