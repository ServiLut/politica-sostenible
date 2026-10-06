import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TerritoryHeatmapQueryDto } from './territory-heatmap-query.dto';

export const TERRITORY_OVERVIEW_ACTIVITIES = ['ACTIVE', 'ALL'] as const;
export type TerritoryOverviewActivity =
  (typeof TERRITORY_OVERVIEW_ACTIVITIES)[number];

const integerQuery = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;

export class TerritoryOverviewQueryDto extends TerritoryHeatmapQueryDto {
  @IsOptional()
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString()
  @MaxLength(80)
  search?: string;

  @IsIn(TERRITORY_OVERVIEW_ACTIVITIES)
  activity: TerritoryOverviewActivity = 'ACTIVE';

  @Transform(integerQuery)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  page: number = 1;

  @Transform(integerQuery)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
}
