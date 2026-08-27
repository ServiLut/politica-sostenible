import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DivisionType } from '../../../prisma/generated/prisma';

const LISTABLE_DIVISION_TYPES = [
  DivisionType.MUNICIPIO,
  DivisionType.ZONA,
  DivisionType.PUESTO,
] as const;

export type ListableDivisionType = (typeof LISTABLE_DIVISION_TYPES)[number];

export class ListDivisionsQueryDto {
  @IsIn([...LISTABLE_DIVISION_TYPES])
  type!: ListableDivisionType;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === '' || value === undefined ? undefined : Number(value),
  )
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === '' || value === undefined ? undefined : Number(value),
  )
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}
