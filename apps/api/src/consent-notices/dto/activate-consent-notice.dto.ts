import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

const normalizeEmail = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const optionalTrim = ({ value }: TransformFnParams): unknown => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim();
  return normalized || undefined;
};

export class ActivateConsentNoticeDto {
  @ApiProperty({ example: '2026-09-v1' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  @Matches(/^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u, {
    message:
      'La version solo puede contener letras, numeros, puntos, guiones y guion bajo',
  })
  version: string;

  @ApiProperty({ example: 'Autorizacion para comunicaciones de campana' })
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(160)
  title: string;

  @ApiProperty({
    description:
      'Texto completo en lenguaje claro que el equipo debe comunicar antes de solicitar la autorizacion',
  })
  @Transform(trim)
  @IsString()
  @MinLength(80)
  @MaxLength(4_000)
  content: string;

  @ApiProperty({ example: 'Comite ciudadano por una ciudad sostenible' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  controllerName: string;

  @ApiProperty({ example: 'datos@organizacion.co' })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  contactEmail: string;

  @ApiProperty({
    required: false,
    example: 'https://organizacion.co/privacidad',
  })
  @Transform(optionalTrim)
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2_048)
  privacyPolicyUrl?: string;
}
