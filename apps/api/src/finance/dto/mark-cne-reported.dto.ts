import { Transform, type TransformFnParams } from 'class-transformer';
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
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(120)
  @Matches(/^[\p{L}\p{N}][\p{L}\p{N} ._:/-]*$/u, {
    message: 'El radicado externo contiene caracteres no permitidos',
  })
  externalReference: string;
}
