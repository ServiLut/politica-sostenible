import { BadRequestException } from '@nestjs/common';
import { REQUIRED_HEADERS, type ParsedCsvRow } from './import.service';
import { PERSON_IMPORT_MAX_ROWS } from './person-import.constants';

/** Streaming UTF-8 CSV, including quoted delimiters/newlines and CRLF boundaries. */
export async function* personCsvRows(
  chunks: AsyncIterable<Uint8Array>,
): AsyncGenerator<ParsedCsvRow> {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let physicalLine = 1;
  let firstLine = 1;
  let raw = '';
  let quoted = false;
  let previousCR = false;
  let firstCharacter = true;
  let headers: string[] | undefined;
  let delimiter = ',';
  let count = 0;

  const record = (): ParsedCsvRow | undefined => {
    const text = raw;
    raw = '';
    if (!text.trim()) return undefined;
    if (!headers) {
      let commas = 0;
      let semicolons = 0;
      let inQuotes = false;
      for (const char of text) {
        if (char === '"') inQuotes = !inQuotes;
        else if (!inQuotes && char === ',') commas++;
        else if (!inQuotes && char === ';') semicolons++;
      }
      if (commas === semicolons)
        throw new BadRequestException('Separador CSV ambiguo');
      delimiter = commas > semicolons ? ',' : ';';
      headers = splitRecord(text, delimiter);
      if (headers.some((h) => !h) || new Set(headers).size !== headers.length) {
        throw new BadRequestException('Encabezados CSV vacíos o duplicados');
      }
      const missing = REQUIRED_HEADERS.filter((h) => !headers?.includes(h));
      if (missing.length)
        throw new BadRequestException(`Faltan columnas: ${missing.join(', ')}`);
      return undefined;
    }
    const values = splitRecord(text, delimiter);
    if (values.length !== headers.length) {
      throw new BadRequestException(
        `La fila ${firstLine} no tiene el número de columnas esperado`,
      );
    }
    count += 1;
    if (count > PERSON_IMPORT_MAX_ROWS)
      throw new BadRequestException('El archivo supera 50000 filas');
    return {
      lineNumber: firstLine,
      fields: Object.fromEntries(headers.map((h, i) => [h, values[i]])),
    };
  };

  async function* decoded() {
    const decode = (chunk?: Uint8Array) => {
      try {
        return decoder.decode(chunk, { stream: chunk !== undefined });
      } catch {
        throw new BadRequestException('El CSV debe estar codificado en UTF-8');
      }
    };
    for await (const chunk of chunks) yield decode(chunk);
    yield decode();
  }
  for await (const text of decoded()) {
    for (const char of text) {
      if (firstCharacter) {
        firstCharacter = false;
        if (char === '\uFEFF') continue;
      }
      if (previousCR && char === '\n') {
        previousCR = false;
        continue;
      }
      previousCR = char === '\r';
      const value = char === '\r' ? '\n' : char;
      // Every quote toggles state: two escaped quotes restore the same state.
      if (value === '"') quoted = !quoted;
      if (value === '\n' && !quoted) {
        const row = record();
        if (row) yield row;
        physicalLine += 1;
        firstLine = physicalLine;
      } else {
        raw += value;
        if (raw.length > 16_384)
          throw new BadRequestException(
            `La fila ${firstLine} supera 16384 caracteres`,
          );
        if (value === '\n') physicalLine += 1;
      }
    }
  }
  if (quoted) throw new BadRequestException('El CSV tiene comillas sin cerrar');
  const final = record();
  if (final) yield final;
  if (!count)
    throw new BadRequestException('El CSV debe contener al menos una persona');
}

function splitRecord(text: string, delimiter: string): string[] {
  const fields: string[] = [];
  let value = '';
  let quoted = false;
  let closed = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else value += char;
    } else if (char === delimiter) {
      fields.push(value.trim());
      value = '';
      closed = false;
    } else if (closed && !/\s/u.test(char))
      throw new BadRequestException('CSV inválido después de comillas');
    else if (char === '"') {
      if (value.trim()) throw new BadRequestException('Comillas CSV inválidas');
      value = '';
      quoted = true;
    } else value += char;
  }
  if (quoted) throw new BadRequestException('Comillas CSV sin cerrar');
  fields.push(value.trim());
  return fields;
}

export function csvCellNeedsProtection(value: string): boolean {
  return /^[\s]*[=+@-]/u.test(value);
}

export function safeCsvCell(value: string): string {
  // Prevent spreadsheet formula injection when a user opens a correction report.
  const safe = csvCellNeedsProtection(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
