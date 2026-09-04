import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  Equals,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  CANONICAL_PHONE_PATTERN,
  normalizePhoneInput,
} from '../../common/utils/phone-normalization.util';

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

const normalizeEmail = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CreateVoterDto {
  @ApiProperty({ example: '1012345678' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  @Matches(/^[\p{L}\p{N}.-]+$/u, {
    message: 'El documento contiene caracteres no permitidos',
  })
  documentId: string;

  @ApiProperty({ example: 'Carlos' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ example: 'Restrepo' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @ApiProperty({ example: '3001234567', required: false })
  @Transform(({ value }: TransformFnParams) => normalizePhoneInput(value))
  @IsString()
  @IsOptional()
  @MaxLength(16)
  @Matches(CANONICAL_PHONE_PATTERN, {
    message: 'El teléfono no tiene un formato válido',
  })
  phone?: string;

  @ApiProperty({ example: 'carlos@email.com', required: false })
  @Transform(normalizeEmail)
  @IsString()
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiProperty({ description: 'ID del puesto de votación' })
  @Transform(trim)
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(128)
  puestoId?: string;

  @ApiProperty({ example: 12, required: false })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(99_999)
  mesa?: number;

  @ApiProperty({
    example: true,
    description: 'Consentimiento expreso para el tratamiento de datos',
  })
  @Equals(true, {
    message: 'Debe aceptar el tratamiento de datos para continuar',
  })
  consentAccepted: true;

  @ApiProperty({ example: '2026.1' })
  @IsString()
  @IsIn(['2026.1'], { message: 'Versión de términos no soportada' })
  termsVersion: string;
}
