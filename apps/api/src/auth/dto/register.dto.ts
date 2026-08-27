import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TenantType } from '../../../prisma/generated/prisma';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class RegisterDto {
  @ApiProperty({ example: 'juan.perez@ejemplo.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Email inválido' })
  @IsNotEmpty({ message: 'El email es requerido' })
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @IsNotEmpty({ message: 'La contraseña es requerida' })
  @MinLength(12, {
    message: 'La contraseña debe tener al menos 12 caracteres',
  })
  @MaxLength(128)
  password: string;

  @ApiProperty({ example: 'Juan Pérez' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'El nombre completo es requerido' })
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'Campaña Alcaldía 2027' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la organización es requerido' })
  @MaxLength(160)
  organizationName: string;

  @ApiProperty({ enum: TenantType, example: TenantType.CANDIDACY })
  @IsEnum(TenantType)
  organizationType: TenantType;

  @ApiProperty({ example: '3001234567', required: false })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/, {
    message: 'El teléfono debe contener entre 7 y 15 dígitos',
  })
  phone?: string;

  @ApiProperty({ example: '1012345678' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'El número de documento es requerido' })
  @MaxLength(30)
  @Matches(/^[\p{L}\p{N}.-]+$/u, {
    message: 'El documento contiene caracteres no permitidos',
  })
  documentId: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  @Equals(true, { message: 'Debes aceptar los términos para crear la cuenta' })
  termsAccepted: boolean;

  @ApiProperty({ example: '2026.1' })
  @IsString()
  @IsIn(['2026.1'], { message: 'La versión de términos no es válida' })
  termsVersion: string;
}
