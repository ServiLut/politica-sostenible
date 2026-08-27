import { Transform, type TransformFnParams } from 'class-transformer';
import {
  Equals,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

const normalizeEmail = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class SyncVoterDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  @Matches(/^[\p{L}\p{N}.-]+$/u)
  documentId: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(25)
  @Matches(/^\+?[0-9][0-9 .()-]{6,24}$/)
  phone?: string;

  @IsOptional()
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  puestoId?: string;

  @Equals(true, {
    message: 'Debe aceptar el tratamiento de datos para sincronizar',
  })
  consentAccepted: true;

  @IsString()
  @IsIn(['2026.1'], { message: 'Versión de términos no soportada' })
  termsVersion: string;
}
