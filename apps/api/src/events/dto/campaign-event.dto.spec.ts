import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CampaignEventStatus } from '../../../prisma/generated/prisma';
import { CreateCampaignEventDto } from './create-campaign-event.dto';
import { ListCampaignEventsQueryDto } from './list-campaign-events-query.dto';
import { ListResponsiblesQueryDto } from './list-responsibles-query.dto';
import { TransitionCampaignEventDto } from './transition-campaign-event.dto';
import { UpdateCampaignEventDto } from './update-campaign-event.dto';

describe('Campaign event DTO validation', () => {
  it('normalizes bounded create input without accepting tenant or mode fields', async () => {
    const dto = plainToInstance(CreateCampaignEventDto, {
      name: '  Encuentro ciudadano  ',
      description: '  Rendición de cuentas  ',
      startsAt: '2026-09-01T14:00:00.000Z',
      endsAt: '2026-09-01T16:00:00.000Z',
      location: '  Auditorio municipal  ',
      capacity: '250',
      responsibleId: '  user-1  ',
      tenantId: 'tenant-forged',
      mode: 'PUBLIC_OFFICE',
    });

    await expect(validate(dto, { whitelist: true })).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      name: 'Encuentro ciudadano',
      description: 'Rendición de cuentas',
      location: 'Auditorio municipal',
      capacity: 250,
      responsibleId: 'user-1',
    });
    expect(dto).not.toHaveProperty('tenantId');
    expect(dto).not.toHaveProperty('mode');
  });

  it('rejects malformed dates and capacity outside the operational bound', async () => {
    const dto = plainToInstance(CreateCampaignEventDto, {
      name: 'Evento válido',
      startsAt: 'mañana',
      endsAt: 'después',
      capacity: 1_000_001,
    });

    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['startsAt', 'endsAt', 'capacity']),
    );
  });

  it('allows explicit nulls only for nullable update fields', async () => {
    const dto = plainToInstance(UpdateCampaignEventDto, {
      description: null,
      location: null,
      capacity: null,
      responsibleId: null,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('bounds pagination and validates status transitions', async () => {
    const query = plainToInstance(ListCampaignEventsQueryDto, {
      page: '0',
      limit: '101',
      status: 'UNKNOWN',
    });
    const transition = plainToInstance(TransitionCampaignEventDto, {
      status: CampaignEventStatus.SCHEDULED,
    });

    expect((await validate(query)).map((error) => error.property)).toEqual(
      expect.arrayContaining(['page', 'limit', 'status']),
    );
    await expect(validate(transition)).resolves.toHaveLength(0);
  });

  it('accepts whole pagination values for the responsible directory', async () => {
    const query = plainToInstance(ListResponsiblesQueryDto, {
      page: '2',
      limit: '25',
    });

    await expect(validate(query)).resolves.toHaveLength(0);
    expect(query).toMatchObject({ page: 2, limit: 25 });
    await expect(
      validate(new ListResponsiblesQueryDto()),
    ).resolves.toHaveLength(0);
  });

  it.each(['1abc', '1.5', '', '0', true, ['1'], {}])(
    'rejects malformed responsible pagination instead of partially parsing %j',
    async (value) => {
      const query = plainToInstance(ListResponsiblesQueryDto, {
        page: value,
        limit: value,
      });

      expect((await validate(query)).map(({ property }) => property)).toEqual(
        expect.arrayContaining(['page', 'limit']),
      );
    },
  );
});
