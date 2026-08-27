import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuditOutcome } from '../../../prisma/generated/prisma';
import { ListAuditEventsQueryDto } from './list-audit-events-query.dto';

describe('ListAuditEventsQueryDto', () => {
  it('transforms and validates supported filters', async () => {
    const dto = plainToInstance(ListAuditEventsQueryDto, {
      page: '2',
      limit: '25',
      action: 'CASE_UPDATED',
      resourceType: 'IssueCase',
      outcome: AuditOutcome.SUCCESS,
      occurredFrom: '2026-08-01T00:00:00.000Z',
      occurredTo: '2026-08-31T23:59:59.999Z',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(25);
  });

  it('rejects unsupported outcomes, invalid dates and excessive pages', async () => {
    const dto = plainToInstance(ListAuditEventsQueryDto, {
      limit: '101',
      outcome: 'UNKNOWN',
      occurredFrom: 'not-a-date',
    });

    const properties = (await validate(dto)).map((error) => error.property);
    expect(properties).toEqual(
      expect.arrayContaining(['limit', 'outcome', 'occurredFrom']),
    );
  });

  it('rejects client-controlled tenant and mode parameters', async () => {
    const dto = plainToInstance(ListAuditEventsQueryDto, {
      tenantId: 'tenant-attacker',
      mode: 'PUBLIC_OFFICE',
    });

    const properties = (
      await validate(dto, { whitelist: true, forbidNonWhitelisted: true })
    ).map((error) => error.property);
    expect(properties).toEqual(expect.arrayContaining(['tenantId', 'mode']));
  });
});
