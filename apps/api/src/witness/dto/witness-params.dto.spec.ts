import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  PollingPlaceParamsDto,
  WitnessReportParamsDto,
} from './witness-params.dto';

const CUID = `c${'7'.repeat(24)}`;

describe('witness route identifier validation', () => {
  it('accepts and trims canonical CUID route identifiers', async () => {
    const report = plainToInstance(WitnessReportParamsDto, {
      id: ` ${CUID} `,
    });
    const place = plainToInstance(PollingPlaceParamsDto, {
      puestoId: ` ${CUID} `,
    });

    await expect(validate(report)).resolves.toHaveLength(0);
    await expect(validate(place)).resolves.toHaveLength(0);
    expect(report.id).toBe(CUID);
    expect(place.puestoId).toBe(CUID);
  });

  it.each(['place-a', CUID.toUpperCase(), `${CUID}/nested`, ''])(
    'rejects non-canonical route identifiers: %s',
    async (id) => {
      expect(
        await validate(plainToInstance(WitnessReportParamsDto, { id })),
      ).not.toHaveLength(0);
      expect(
        await validate(
          plainToInstance(PollingPlaceParamsDto, { puestoId: id }),
        ),
      ).not.toHaveLength(0);
    },
  );
});
