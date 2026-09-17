import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { DivisionType } from '../../../prisma/generated/prisma';

export const TERRITORY_HEATMAP_LEVELS = [
  DivisionType.DEPARTAMENTO,
  DivisionType.MUNICIPIO,
  DivisionType.ZONA,
  DivisionType.PUESTO,
] as const;

export type TerritoryHeatmapLevel = (typeof TERRITORY_HEATMAP_LEVELS)[number];

export const TerritoryHeatmapMetric = {
  VOTER_ACTIVITY: 'VOTER_ACTIVITY',
  E14_COVERAGE: 'E14_COVERAGE',
  OPEN_CASES: 'OPEN_CASES',
  TEAM_COVERAGE: 'TEAM_COVERAGE',
} as const;

export type TerritoryHeatmapMetric =
  (typeof TerritoryHeatmapMetric)[keyof typeof TerritoryHeatmapMetric];

const trimOptional = ({ value }: TransformFnParams): unknown => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim();
  return normalized || undefined;
};

export class TerritoryHeatmapQueryDto {
  @IsOptional()
  @IsIn([...TERRITORY_HEATMAP_LEVELS])
  level: TerritoryHeatmapLevel = DivisionType.DEPARTAMENTO;

  @IsOptional()
  @IsIn(Object.values(TerritoryHeatmapMetric))
  metric: TerritoryHeatmapMetric = TerritoryHeatmapMetric.E14_COVERAGE;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9:_-]+$/, {
    message: 'El territorio padre no tiene un formato válido',
  })
  parentId?: string;
}
