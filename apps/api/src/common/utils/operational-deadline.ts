import { BadRequestException } from '@nestjs/common';
import { isISO8601, registerDecorator } from 'class-validator';

const DATE_ONLY = /^(?!0000)\d{4}-\d{2}-\d{2}$/u;
const ZONED_TIMESTAMP =
  /^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-](?:(?:0\d|1[0-3]):?[0-5]\d|14:?00))$/u;
const DEADLINE_MESSAGE =
  'Usa una fecha válida AAAA-MM-DD o una fecha y hora ISO con zona horaria explícita.';

export function isOperationalDeadline(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (DATE_ONLY.test(value) || ZONED_TIMESTAMP.test(value)) &&
    isISO8601(value, { strict: true, strictSeparator: true }) &&
    Number.isFinite(new Date(value).getTime())
  );
}

/** Date-only operational deadlines include the entire Colombia civil day.
 * Existing clients may still supply an exact ISO instant with an explicit zone;
 * that instant is preserved. No stored deadlines are rewritten by this rule.
 */
export function parseOperationalDeadline(value: string): Date {
  if (!isOperationalDeadline(value)) {
    throw new BadRequestException(DEADLINE_MESSAGE);
  }
  return new Date(
    DATE_ONLY.test(value) ? `${value}T23:59:59.999-05:00` : value,
  );
}

export function IsOperationalDeadline(): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'isOperationalDeadline',
      target: target.constructor,
      propertyName: String(propertyKey),
      validator: {
        validate: isOperationalDeadline,
        defaultMessage: () => DEADLINE_MESSAGE,
      },
    });
  };
}
