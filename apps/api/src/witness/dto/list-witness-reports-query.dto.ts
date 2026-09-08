import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { WitnessReportStatus } from '../../../prisma/generated/prisma';

export class ListWitnessReportsQueryDto {
  @IsOptional()
  @IsEnum(WitnessReportStatus)
  status?: WitnessReportStatus;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  puestoId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === '' || value === undefined ? undefined : Number(value),
  )
  @IsInt({ message: 'La mesa debe ser un número entero.' })
  @Min(1, { message: 'La mesa debe ser mayor o igual a 1.' })
  @Max(99_999, { message: 'La mesa debe ser menor o igual a 99.999.' })
  mesa?: number;

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
