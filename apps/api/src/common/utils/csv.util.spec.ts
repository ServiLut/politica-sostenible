import {
  buildCsvRow,
  buildPipeDelimitedRow,
  sanitizeSpreadsheetCell,
} from './csv.util';

describe('CSV security utilities', () => {
  it.each([
    '=CMD()',
    '+CMD()',
    '-CMD()',
    '@SUM(A1:A2)',
    '  =CMD()',
    '"=CMD()"',
  ])('neutralizes spreadsheet formula payload %s', (payload) => {
    expect(sanitizeSpreadsheetCell(payload)).toBe(`'${payload}`);
  });

  it('escapes quotes and removes row-breaking control characters', () => {
    const row = buildCsvRow(['safe"value', 'line one\r\nline two']);

    expect(row).toBe('"safe""value","line one line two"');
    expect(row).not.toContain('\r');
    expect(row).not.toContain('\n');
  });

  it('removes injected pipe delimiters from pipe-delimited exports', () => {
    const row = buildPipeDelimitedRow(['=CMD()', 'ACME|SAS', 'line\nbreak']);

    expect(row).toBe("'=CMD()|ACME SAS|line break");
    expect(row.split('|')).toHaveLength(3);
  });
});
