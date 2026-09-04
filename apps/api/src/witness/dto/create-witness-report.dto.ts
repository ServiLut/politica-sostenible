import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateWitnessReportDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Transform(trim)
  puestoId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99_999)
  mesa: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  @Transform(trim)
  e14ImageUrl: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(99_999)
  candidateVotes: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(99_999)
  totalTableVotes: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  observations?: string;
}
