import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DivisionType } from '../../../prisma/generated/prisma';
import {
  TerritoryHeatmapMetric,
  TerritoryHeatmapQueryDto,
} from './territory-heatmap-query.dto';

describe('TerritoryHeatmapQueryDto', () => {
  it('uses a safe national overview by default', async () => {
    const dto = plainToInstance(TerritoryHeatmapQueryDto, {});

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.level).toBe(DivisionType.DEPARTAMENTO);
    expect(dto.metric).toBe(TerritoryHeatmapMetric.E14_COVERAGE);
    expect(dto.parentId).toBeUndefined();
  });

  it('normalizes a valid drill-down request', async () => {
    const dto = plainToInstance(TerritoryHeatmapQueryDto, {
      level: DivisionType.PUESTO,
      metric: TerritoryHeatmapMetric.VOTER_ACTIVITY,
      parentId: ' zone_a-1 ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.parentId).toBe('zone_a-1');
  });

  it('rejects unsupported metrics, levels and path-like identifiers', async () => {
    const dto = plainToInstance(TerritoryHeatmapQueryDto, {
      level: DivisionType.COUNTRY,
      metric: 'POLITICAL_AFFINITY',
      parentId: '../tenant-b',
    });

    const errors = await validate(dto);

    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining(['level', 'metric', 'parentId']),
    );
  });
});
