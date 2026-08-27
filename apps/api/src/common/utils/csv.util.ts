const SPREADSHEET_FORMULA_PREFIX = /^\s*"*[=+\-@]/;

type CsvCellValue = string | number | bigint | boolean | null | undefined;

export function sanitizeSpreadsheetCell(value: CsvCellValue): string {
  const normalized = String(value ?? '')
    .replace(/\0/g, '')
    .replace(/\r\n|\r|\n|\t/g, ' ');

  return SPREADSHEET_FORMULA_PREFIX.test(normalized)
    ? `'${normalized}`
    : normalized;
}

export function escapeCsvCell(value: CsvCellValue): string {
  const sanitized = sanitizeSpreadsheetCell(value);
  return `"${sanitized.replace(/"/g, '""')}"`;
}

export function buildCsvRow(values: readonly CsvCellValue[]): string {
  return values.map(escapeCsvCell).join(',');
}

export function buildPipeDelimitedRow(values: readonly CsvCellValue[]): string {
  return values
    .map((value) => sanitizeSpreadsheetCell(value).replace(/\|/g, ' '))
    .join('|');
}
