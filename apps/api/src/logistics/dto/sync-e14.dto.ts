import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SyncE14Dto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  puestoId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99_999)
  mesa: number;

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

  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  e14ImageUrl: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observations?: string;
}
