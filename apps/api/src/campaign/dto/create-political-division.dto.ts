import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { DivisionType } from '../../../prisma/generated/prisma';

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export const CreatableDivisionType = {
  ZONA: DivisionType.ZONA,
  PUESTO: DivisionType.PUESTO,
} as const;
export type CreatableDivisionType =
  (typeof CreatableDivisionType)[keyof typeof CreatableDivisionType];

export class CreatePoliticalDivisionDto {
  @IsIn(Object.values(CreatableDivisionType), {
    message: 'Sólo se pueden crear zonas o puestos operativos',
  })
  type: CreatableDivisionType;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[\p{L}\p{N}._-]+$/u, {
    message: 'El código contiene caracteres no permitidos',
  })
  code: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'El identificador del territorio padre no es válido',
  })
  parentId: string;
}
