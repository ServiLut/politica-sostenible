export const CANONICAL_PHONE_PATTERN = /^\+?[0-9]{7,15}$/;

const FORMATTED_PHONE_PATTERN = /^\+?[0-9 .()-]+$/;

/**
 * Conserva un `+` internacional opcional y elimina exclusivamente separadores
 * visuales conocidos. Otros caracteres permanecen para que la validacion los
 * rechace en lugar de transformar una entrada invalida en un numero valido.
 */
export function normalizePhoneInput(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  return FORMATTED_PHONE_PATTERN.test(trimmed)
    ? trimmed.replace(/[ .()-]/g, '')
    : trimmed;
}

export function normalizePhoneSearch(value: string): string {
  const normalized = normalizePhoneInput(value);
  return typeof normalized === 'string' &&
    CANONICAL_PHONE_PATTERN.test(normalized)
    ? normalized
    : value;
}
