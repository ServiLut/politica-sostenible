import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  CANONICAL_PHONE_PATTERN,
  normalizePhoneInput,
} from '../../common/utils/phone-normalization.util';

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

const normalizeEmail = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const parseInteger = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' && value.trim() !== '' ? Number(value) : value;

/**
 * Correcciones permitidas sobre los datos del titular. Los campos de control
 * (tenant, consentimiento, registrador y evidencia) se excluyen a proposito y
 * el ValidationPipe global los rechaza con `forbidNonWhitelisted`.
 */
export class UpdateVoterDataDto {
  @ApiPropertyOptional({ example: '1012345678' })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  @Matches(/^[\p{L}\p{N}.-]+$/u, {
    message: 'El documento contiene caracteres no permitidos',
  })
  documentId?: string;

  @ApiPropertyOptional({ example: 'Carlos' })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Restrepo' })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ example: '+57 300 123 4567', nullable: true })
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => normalizePhoneInput(value))
  @IsString()
  @MaxLength(16)
  @Matches(CANONICAL_PHONE_PATTERN, {
    message: 'El telefono no tiene un formato valido',
  })
  phone?: string | null;

  @ApiPropertyOptional({ example: 'carlos@email.com', nullable: true })
  @IsOptional()
  @Transform(normalizeEmail)
  @IsString()
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @ApiPropertyOptional({
    description: 'ID del puesto de votacion',
    nullable: true,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'El identificador del puesto no es valido',
  })
  puestoId?: string | null;

  @ApiPropertyOptional({ example: 12, nullable: true })
  @IsOptional()
  @Transform(parseInteger)
  @IsInt()
  @Min(1)
  @Max(99_999)
  mesa?: number | null;
}
