import type { BackendUserRole, Tenant } from "@/types/saas-schema";

export const MAX_VOTER_IMPORT_ROWS = 500;
export const MAX_DIRECT_CONSENT_FILES = 30;
export const MAX_VOTER_IMPORT_CSV_CHARACTERS = 100_000;
export const MAX_CONSENT_EVIDENCE_BYTES = 15 * 1024 * 1024;

const IMPORT_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "CAMPAIGN_MANAGER",
]);
const REQUIRED_HEADERS = [
  "Documento",
  "Nombre",
  "Apellido",
  "Consentimiento",
  "Version aviso",
  "Fecha consentimiento",
  "Ruta evidencia",
] as const;
const CONSENT_EVIDENCE_TYPES = new Map<string, ReadonlySet<string>>([
  ["application/pdf", new Set(["pdf"])],
  ["image/jpeg", new Set(["jpg", "jpeg"])],
  ["image/png", new Set(["png"])],
  ["image/webp", new Set(["webp"])],
]);

interface ParsedRecord {
  lineNumber: number;
  values: string[];
}

interface ParsedImportCsv {
  delimiter: "," | ";";
  headers: string[];
  rows: ParsedRecord[];
  documentIndex: number;
  evidenceIndex: number;
}

export interface VoterImportEvidenceRequirement {
  row: number;
  documentId: string;
  reference: string;
  fileName: string;
}

export interface VoterImportEvidenceMatch
  extends VoterImportEvidenceRequirement {
  file: File;
}

export interface VoterImportCsvInspection {
  totalRows: number;
  evidence: VoterImportEvidenceRequirement[];
}

export interface VoterImportEvidencePlan {
  matches: VoterImportEvidenceMatch[];
  unusedFileNames: string[];
}

export function canAccessVoterImport(
  role: BackendUserRole | null | undefined,
  tenantType: Tenant["type"] | null | undefined,
): boolean {
  return (
    role !== null &&
    role !== undefined &&
    IMPORT_ROLES.has(role) &&
    tenantType !== null &&
    tenantType !== undefined &&
    tenantType !== "PUBLIC_OFFICE"
  );
}

function detectDelimiter(csv: string): "," | ";" {
  let inQuotes = false;
  let commas = 0;
  let semicolons = 0;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (character === '"') {
      if (inQuotes && csv[index + 1] === '"') index += 1;
      else inQuotes = !inQuotes;
    } else if (!inQuotes && character === "\n") {
      break;
    } else if (!inQuotes && character === ",") {
      commas += 1;
    } else if (!inQuotes && character === ";") {
      semicolons += 1;
    }
  }

  if (commas === 0 && semicolons === 0) {
    throw new Error("No se pudo identificar el separador CSV.");
  }
  if (commas === semicolons) {
    throw new Error("El separador del CSV es ambiguo.");
  }
  return commas > semicolons ? "," : ";";
}

function parseRecords(csv: string, delimiter: "," | ";"): ParsedRecord[] {
  const records: ParsedRecord[] = [];
  let values: string[] = [];
  let field = "";
  let inQuotes = false;
  let afterClosingQuote = false;
  let lineNumber = 1;
  let recordLineNumber = 1;

  const finishField = () => {
    values.push(field.trim());
    field = "";
    afterClosingQuote = false;
  };
  const finishRecord = () => {
    finishField();
    records.push({ lineNumber: recordLineNumber, values });
    values = [];
    recordLineNumber = lineNumber + 1;
  };

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (inQuotes) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
        afterClosingQuote = true;
      } else {
        field += character;
        if (character === "\n") lineNumber += 1;
      }
      continue;
    }

    if (afterClosingQuote) {
      if (character === delimiter) finishField();
      else if (character === "\n") {
        finishRecord();
        lineNumber += 1;
      } else if (!/\s/u.test(character)) {
        throw new Error(
          `Carácter inesperado después de comillas en la línea ${lineNumber}.`,
        );
      }
      continue;
    }

    if (character === '"') {
      if (field.trim()) {
        throw new Error(`Comillas inválidas en la línea ${lineNumber}.`);
      }
      field = "";
      inQuotes = true;
    } else if (character === delimiter) finishField();
    else if (character === "\n") {
      finishRecord();
      lineNumber += 1;
    } else field += character;
  }

  if (inQuotes) throw new Error("El CSV contiene comillas sin cerrar.");
  if (field.length > 0 || values.length > 0 || afterClosingQuote) {
    finishRecord();
  }
  return records;
}

function parseImportCsv(csv: string): ParsedImportCsv {
  const normalized = csv
    .replace(/^\uFEFF/u, "")
    .replace(/\r\n/gu, "\n")
    .replace(/\r/gu, "\n");
  if (!normalized.trim()) throw new Error("El CSV no contiene registros.");
  if (normalized.length > MAX_VOTER_IMPORT_CSV_CHARACTERS) {
    throw new Error("El CSV supera el tamaño permitido de 100.000 caracteres.");
  }

  const delimiter = detectDelimiter(normalized);
  const records = parseRecords(normalized, delimiter).filter((record) =>
    record.values.some((value) => value.trim().length > 0),
  );
  if (records.length < 2) {
    throw new Error("El CSV debe incluir encabezados y al menos un registro.");
  }

  const rows = records.slice(1);
  if (rows.length > MAX_VOTER_IMPORT_ROWS) {
    throw new Error(
      `El CSV supera el máximo de ${MAX_VOTER_IMPORT_ROWS} registros por lote.`,
    );
  }

  const headers = records[0].values.map((header) => header.trim());
  if (headers.some((header) => !header)) {
    throw new Error("El CSV contiene encabezados vacíos.");
  }
  if (new Set(headers).size !== headers.length) {
    throw new Error("El CSV contiene encabezados duplicados.");
  }
  const missingHeaders = REQUIRED_HEADERS.filter(
    (header) => !headers.includes(header),
  );
  if (missingHeaders.length > 0) {
    throw new Error(
      `Faltan columnas obligatorias: ${missingHeaders.join(", ")}.`,
    );
  }
  const malformedRow = rows.find((row) => row.values.length !== headers.length);
  if (malformedRow) {
    throw new Error(
      `La fila ${malformedRow.lineNumber} tiene ${malformedRow.values.length} columnas; se esperaban ${headers.length}.`,
    );
  }

  return {
    delimiter,
    headers,
    rows,
    documentIndex: headers.indexOf("Documento"),
    evidenceIndex: headers.indexOf("Ruta evidencia"),
  };
}

function evidenceFileName(reference: string): string {
  return reference.split(/[\\/]/u).at(-1)?.trim() ?? "";
}

export function inspectVoterImportCsv(
  csv: string,
): VoterImportCsvInspection {
  const parsed = parseImportCsv(csv);
  const evidence = parsed.rows.map((row) => {
    const documentId = row.values[parsed.documentIndex]?.trim() ?? "";
    const reference = row.values[parsed.evidenceIndex]?.trim() ?? "";
    const fileName = evidenceFileName(reference);
    if (!documentId) {
      throw new Error(`La fila ${row.lineNumber} no tiene Documento.`);
    }
    if (!reference || !fileName) {
      throw new Error(
        `La fila ${row.lineNumber} no indica el nombre de su evidencia.`,
      );
    }
    return { row: row.lineNumber, documentId, reference, fileName };
  });

  const repeatedDocument = evidence.find(
    (candidate, index) =>
      evidence.findIndex((item) => item.documentId === candidate.documentId) !==
      index,
  );
  if (repeatedDocument) {
    throw new Error(
      `El documento ${repeatedDocument.documentId} aparece más de una vez. Conserva una sola fila verificable.`,
    );
  }
  const repeatedEvidence = evidence.find(
    (candidate, index) =>
      evidence.findIndex((item) => item.fileName === candidate.fileName) !==
      index,
  );
  if (repeatedEvidence) {
    throw new Error(
      `La evidencia ${repeatedEvidence.fileName} está asignada a más de una fila. Cada persona requiere un archivo único.`,
    );
  }
  if (evidence.length > MAX_DIRECT_CONSENT_FILES) {
    throw new Error(
      `La subida directa admite hasta ${MAX_DIRECT_CONSENT_FILES} evidencias por lote. Divide el archivo y vuelve a intentarlo.`,
    );
  }

  return { totalRows: parsed.rows.length, evidence };
}

function fileExtension(fileName: string): string {
  const separator = fileName.lastIndexOf(".");
  return separator >= 0 ? fileName.slice(separator + 1).toLowerCase() : "";
}

function validateEvidenceFile(file: File): void {
  if (file.size < 1) throw new Error(`${file.name} está vacío.`);
  if (file.size > MAX_CONSENT_EVIDENCE_BYTES) {
    throw new Error(`${file.name} supera el máximo de 15 MB.`);
  }
  const allowedExtensions = CONSENT_EVIDENCE_TYPES.get(file.type);
  if (!allowedExtensions?.has(fileExtension(file.name))) {
    throw new Error(
      `${file.name} no es una evidencia válida. Usa PDF, JPG, PNG o WEBP.`,
    );
  }
}

export function matchVoterImportEvidence(
  inspection: VoterImportCsvInspection,
  files: readonly File[],
): VoterImportEvidencePlan {
  const filesByName = new Map<string, File>();
  for (const file of files) {
    if (filesByName.has(file.name)) {
      throw new Error(`Seleccionaste más de un archivo llamado ${file.name}.`);
    }
    validateEvidenceFile(file);
    filesByName.set(file.name, file);
  }

  const matches = inspection.evidence.map((requirement) => {
    const file = filesByName.get(requirement.fileName);
    if (!file) {
      throw new Error(
        `Falta seleccionar ${requirement.fileName}, referenciada en la fila ${requirement.row}.`,
      );
    }
    return { ...requirement, file };
  });
  const usedNames = new Set(matches.map((match) => match.file.name));
  return {
    matches,
    unusedFileNames: [...filesByName.keys()].filter(
      (fileName) => !usedNames.has(fileName),
    ),
  };
}

function serializeValue(value: string, delimiter: "," | ";"): string {
  if (
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes("\n") ||
    /^\s|\s$/u.test(value)
  ) {
    return `"${value.replace(/"/gu, '""')}"`;
  }
  return value;
}

export function applyVoterImportEvidencePaths(
  csv: string,
  pathsByReference: ReadonlyMap<string, string>,
): string {
  const parsed = parseImportCsv(csv);
  const records = [parsed.headers, ...parsed.rows.map((row) => [...row.values])];

  for (let index = 1; index < records.length; index += 1) {
    const reference = records[index][parsed.evidenceIndex]?.trim() ?? "";
    const canonicalPath = pathsByReference.get(reference)?.trim();
    if (!canonicalPath) {
      throw new Error(
        `No se obtuvo una ruta confirmada para la evidencia de la fila ${parsed.rows[index - 1].lineNumber}.`,
      );
    }
    records[index][parsed.evidenceIndex] = canonicalPath;
  }

  return records
    .map((record) =>
      record
        .map((value) => serializeValue(value, parsed.delimiter))
        .join(parsed.delimiter),
    )
    .join("\n");
}

export function adaptVoterImportTemplate(
  serverTemplate: string,
  noticeVersion: string,
  exampleConsentDate?: string,
): string {
  const parsed = parseImportCsv(serverTemplate);
  const versionIndex = parsed.headers.indexOf("Version aviso");
  const consentDateIndex = parsed.headers.indexOf("Fecha consentimiento");
  const records = [parsed.headers, ...parsed.rows.map((row) => [...row.values])];

  for (let index = 1; index < records.length; index += 1) {
    const documentId = records[index][parsed.documentIndex]
      ?.replace(/\D/gu, "")
      .trim();
    records[index][parsed.evidenceIndex] =
      `evidencia_${documentId || `fila_${index + 1}`}.pdf`;
    records[index][versionIndex] = noticeVersion;
    if (exampleConsentDate) {
      records[index][consentDateIndex] = exampleConsentDate;
    }
  }

  return `\uFEFF${records
    .map((record) =>
      record
        .map((value) => serializeValue(value, parsed.delimiter))
        .join(parsed.delimiter),
    )
    .join("\n")}`;
}
