import { BadRequestException } from '@nestjs/common';
import { personCsvRows, safeCsvCell } from './person-import-csv';
import { REQUIRED_HEADERS, type ParsedCsvRow } from './import.service';

async function parse(csv: string, chunkSize = 7) {
  const bytes = Buffer.from(csv);
  async function* chunks() {
    for (let at = 0; at < bytes.length; at += chunkSize)
      yield await Promise.resolve(bytes.subarray(at, at + chunkSize));
  }
  const result: ParsedCsvRow[] = [];
  for await (const row of personCsvRows(chunks())) result.push(row);
  return result;
}
const header = REQUIRED_HEADERS.join(',');
const row = '12345,PRUEBA,QA,SI,v1,2026-01-01T00:00:00Z,tenant/consent/one.pdf';

describe('Person CSV streaming contract', () => {
  it('keeps UTF-8 and CRLF boundaries, quoted separators and physical line numbers', async () => {
    const rows = await parse(
      '\uFEFF' +
        header +
        '\r\n12345,"PRUEBA, María\r\nOtra","QA ""A""",SI,v1,2026-01-01T00:00:00Z,path\r\n' +
        row,
      1,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      lineNumber: 2,
      fields: { Nombre: 'PRUEBA, María\nOtra', Apellido: 'QA "A"' },
    });
    expect(rows[1].lineNumber).toBe(4);
  });
  it('accepts semicolon and quoted headers as exported by spreadsheets', async () => {
    const rows = await parse(
      REQUIRED_HEADERS.map((s) => '"' + s + '"').join(';') +
        '\n' +
        row.replaceAll(',', ';'),
    );
    expect(rows[0].fields.Documento).toBe('12345');
  });
  it('accepts correction columns without treating them as person fields', async () => {
    const rows = await parse(header + ',Fila,Motivo\n' + row + ',2,Corregir');
    expect(rows[0].fields.Documento).toBe('12345');
  });
  it.each([
    [header + '\n"unterminated', 'comillas'],
    [header + '\n' + row + ',extra', 'columnas'],
    [header + '\n12345,"A"X,B,SI,v1,date,path', 'comillas'],
    [header + '\n' + row.replace('PRUEBA', 'A'.repeat(17_000)), '16384'],
    ['Documento,Documento\n1,2', 'duplicados'],
    [header + '\n', 'al menos'],
    ['Documento,Nombre\n1,PRUEBA', 'Faltan columnas'],
  ])(
    'rejects malformed input before it can be imported',
    async (input, reason) => {
      await expect(parse(input)).rejects.toThrow(reason);
    },
  );
  it('processes 50000 rows and rejects row 50001 instead of silently truncating', async () => {
    const source =
      header + '\n' + Array.from({ length: 50_000 }, () => row).join('\n');
    expect(await parse(source, 64 * 1024)).toHaveLength(50_000);
    await expect(parse(source + '\n' + row, 64 * 1024)).rejects.toThrow(
      '50000',
    );
  });
  it('escapes spreadsheet formulas and embedded quotes in error exports', () => {
    expect(safeCsvCell('=1+2')).toBe('"\'=1+2"');
    expect(safeCsvCell(' \t@SUM(A1)')).toBe('"\' \t@SUM(A1)"');
    expect(safeCsvCell('PRUEBA "A"')).toBe('"PRUEBA ""A"""');
  });
  it('rejects invalid UTF-8 rather than replacing person data', async () => {
    async function* bytes() {
      yield await Promise.resolve(Buffer.from([0xff]));
    }
    await expect(async () => {
      for await (const r of personCsvRows(bytes())) void r;
    }).rejects.toThrow(BadRequestException);
  });
});
