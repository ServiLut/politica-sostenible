import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { CreateTaskDto } from '../../tasks/dto/create-task.dto';
import { UpdateTaskDto } from '../../tasks/dto/update-task.dto';
import { CreateCommitmentDto } from '../../commitments/dto/create-commitment.dto';
import { UpdateCommitmentDto } from '../../commitments/dto/update-commitment.dto';
import { CreateIssueCaseDto } from '../../cases/dto/create-issue-case.dto';
import { UpdateIssueCaseDto } from '../../cases/dto/update-issue-case.dto';
import {
  isOperationalDeadline,
  parseOperationalDeadline,
} from './operational-deadline';

describe('Colombia operational deadlines', () => {
  it.each([
    ['2026-10-16', '2026-10-17T04:59:59.999Z'],
    ['2026-12-31', '2027-01-01T04:59:59.999Z'],
    ['2028-02-29', '2028-03-01T04:59:59.999Z'],
    ['2026-03-08', '2026-03-09T04:59:59.999Z'],
    ['2026-11-01', '2026-11-02T04:59:59.999Z'],
  ])('includes the full Colombia day for %s', (input, expected) => {
    expect(parseOperationalDeadline(input).toISOString()).toBe(expected);
  });

  it('is still pending at 15:17 and 23:59:59 Colombia, and expires the next day', () => {
    const deadline = parseOperationalDeadline('2026-10-16').getTime();
    expect(deadline).toBeGreaterThan(
      new Date('2026-10-16T15:17:00-05:00').getTime(),
    );
    expect(deadline).toBeGreaterThan(
      new Date('2026-10-16T23:59:59-05:00').getTime(),
    );
    expect(new Date(deadline + 1).toISOString()).toBe(
      '2026-10-17T05:00:00.000Z',
    );
  });

  it.each([
    ['2026-10-16T12:00:00-05:00', '2026-10-16T17:00:00.000Z'],
    ['2026-10-16T03:27:45.123Z', '2026-10-16T03:27:45.123Z'],
    ['2026-10-16T12:00:00+14:00', '2026-10-15T22:00:00.000Z'],
    ['2026-10-16T12:00-0500', '2026-10-16T17:00:00.000Z'],
  ])('preserves existing explicit ISO instants: %s', (input, expected) => {
    expect(parseOperationalDeadline(input).toISOString()).toBe(expected);
  });

  it.each([
    '',
    '2026-02-29',
    '2026-04-31',
    '2026-13-01',
    '2026-00-16',
    '2026-10-00',
    '0000-10-16',
    '16/10/2026',
    '2026-10-16T12:00:00',
    '2026-10-16T12:00:00+25:00',
    '2026-10-16T12:00:00+14:01',
    '2026-10-16T12:00:00-05:60',
    '2026-10-16T24:01:00Z',
    '2026-02-30T12:00:00Z',
    '2026-10-16T12:00:00America/Bogota',
    '2026-10-16T12:00:00Z extra',
  ])('rejects invalid or ambiguous dates before persistence: %s', (input) => {
    expect(isOperationalDeadline(input)).toBe(false);
    expect(() => parseOperationalDeadline(input)).toThrow(BadRequestException);
  });

  it.each([null, undefined, {}, 20261016])(
    'rejects nonstrings: %p',
    (input) => {
      expect(isOperationalDeadline(input)).toBe(false);
    },
  );

  const contracts = [
    { Dto: CreateTaskDto, field: 'dueAt', required: { title: 'Tarea' } },
    { Dto: UpdateTaskDto, field: 'dueAt', required: {} },
    {
      Dto: CreateCommitmentDto,
      field: 'targetDate',
      required: {
        reference: 'CMP-1',
        title: 'Compromiso',
        description: 'Detalle',
      },
    },
    { Dto: UpdateCommitmentDto, field: 'targetDate', required: {} },
    {
      Dto: CreateIssueCaseDto,
      field: 'dueAt',
      required: {
        title: 'Caso',
        description: 'Detalle',
        category: 'Tecnología',
        sourceChannel: 'INTERNAL',
      },
    },
    { Dto: UpdateIssueCaseDto, field: 'dueAt', required: {} },
  ];

  describe.each(contracts)('$Dto.name.$field HTTP contract', (contract) => {
    it.each(['2026-10-16', '2026-10-16T12:00:00-05:00', undefined])(
      'accepts date-only, exact instant or omission: %s',
      async (value) => {
        const dto = Object.assign(new contract.Dto(), contract.required, {
          [contract.field]: value,
        });
        expect(await validate(dto)).toHaveLength(0);
      },
    );

    it.each(['2026-02-30', '2026-10-16T12:00:00', '2026-10-16T12:00:00+50:00'])(
      'rejects invalid calendars or missing/invalid zones: %s',
      async (value) => {
        const dto = Object.assign(new contract.Dto(), contract.required, {
          [contract.field]: value,
        });
        const errors = await validate(dto);
        expect(errors.map((error) => error.property)).toContain(contract.field);
      },
    );
  });

  it.each([UpdateTaskDto, UpdateCommitmentDto, UpdateIssueCaseDto])(
    'continues allowing explicit removal of optional deadline: %p',
    async (Dto) => {
      const field = Dto === UpdateCommitmentDto ? 'targetDate' : 'dueAt';
      expect(
        await validate(Object.assign(new Dto(), { [field]: null })),
      ).toHaveLength(0);
    },
  );
});
