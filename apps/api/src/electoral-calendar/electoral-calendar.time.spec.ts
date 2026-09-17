import { BadRequestException } from '@nestjs/common';
import {
  civilDateAt,
  civilDateTimeToUtc,
  isIanaTimeZone,
} from './electoral-calendar.time';

describe('electoral calendar civil time', () => {
  it('interprets Bogota independently from the server time zone', () => {
    expect(
      civilDateTimeToUtc('2099-03-10', '17:00', 'America/Bogota').toISOString(),
    ).toBe('2099-03-10T22:00:00.000Z');
    expect(
      civilDateAt(new Date('2099-03-11T04:30:00.000Z'), 'America/Bogota'),
    ).toBe('2099-03-10');
  });

  it('fails closed for invalid and DST-ambiguous civil times', () => {
    expect(isIanaTimeZone('Bogota')).toBe(false);
    expect(() =>
      civilDateTimeToUtc('2026-11-01', '01:30', 'America/New_York'),
    ).toThrow(BadRequestException);
  });
});
