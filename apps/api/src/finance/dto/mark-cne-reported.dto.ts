import { Transform, type TransformFnParams } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class MarkCneReportedDto {
  @ApiProperty({
    description:
      'Referencia externa declarada por el usuario. No constituye ni demuestra una radicación o rendición oficial ante el CNE',
    example: 'CC-2026/004219',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(120)
  @Matches(/^[\p{L}\p{N}][\p{L}\p{N} ._:/-]*$/u, {
    message: 'La referencia externa contiene caracteres no permitidos',
  })
  externalReference: string;

  @ApiProperty({
    description:
      'Ruta privada confirmada del soporte aportado por el usuario. Nunca se devuelve en la vista del movimiento',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  cneReportEvidenceUrl: string;
}
