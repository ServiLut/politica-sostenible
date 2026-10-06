import type { BackendUserRole, Tenant } from "@/types/saas-schema";

export const MAX_VOTER_IMPORT_ROWS = 500;
export const MAX_DIRECT_CONSENT_FILES = 30;
export const MAX_VOTER_IMPORT_CSV_CHARACTERS = 100_000;
export const MAX_CONSENT_EVIDENCE_BYTES = 15 * 1024 * 1024;
export const MAX_BULK_VOTER_IMPORT_ROWS = 50_000;
export const MAX_BULK_VOTER_IMPORT_BYTES = 20 * 1024 * 1024;

const IMPORT_ROLES = new Set<BackendUserRole>(["ADMIN", "CAMPAIGN_MANAGER"]);
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

export interface VoterImportEvidenceMatch extends VoterImportEvidenceRequirement {
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

function parseImportCsv(
  csv: string,
  limits = {
    maxRows: MAX_VOTER_IMPORT_ROWS,
    maxCharacters: MAX_VOTER_IMPORT_CSV_CHARACTERS,
  },
): ParsedImportCsv {
  const normalized = csv
    .replace(/^\uFEFF/u, "")
    .replace(/\r\n/gu, "\n")
    .replace(/\r/gu, "\n");
  if (!normalized.trim()) throw new Error("El CSV no contiene registros.");
  if (normalized.length > limits.maxCharacters) {
    throw new Error(
      `El CSV supera el tamaño permitido de ${limits.maxCharacters.toLocaleString("es-CO")} caracteres.`,
    );
  }

  const delimiter = detectDelimiter(normalized);
  const records = parseRecords(normalized, delimiter).filter((record) =>
    record.values.some((value) => value.trim().length > 0),
  );
  if (records.length < 2) {
    throw new Error("El CSV debe incluir encabezados y al menos un registro.");
  }

  const rows = records.slice(1);
  if (rows.length > limits.maxRows) {
    throw new Error(
      `El CSV supera el máximo de ${limits.maxRows.toLocaleString("es-CO")} registros por lote.`,
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

export function inspectVoterImportCsv(csv: string): VoterImportCsvInspection {
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
  const records = [
    parsed.headers,
    ...parsed.rows.map((row) => [...row.values]),
  ];

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
  const records = [
    parsed.headers,
    ...parsed.rows.map((row) => [...row.values]),
  ];

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

export interface BulkVoterImportLimits {
  maxRows: number;
  maxBytes: number;
  maxEvidenceBytes?: number;
}

const BULK_LIMITS: BulkVoterImportLimits = {
  maxRows: MAX_BULK_VOTER_IMPORT_ROWS,
  maxBytes: MAX_BULK_VOTER_IMPORT_BYTES,
};

export function formatVoterImportSize(bytes: number): string {
  if (bytes >= 1024 * 1024)
    return `${(bytes / 1024 / 1024).toLocaleString("es-CO", { maximumFractionDigits: 1 })} MB`;
  if (bytes >= 1024)
    return `${(bytes / 1024).toLocaleString("es-CO", { maximumFractionDigits: 1 })} KB`;
  return `${bytes.toLocaleString("es-CO")} bytes`;
}

/** Downloaded correction reports can be larger than their source because each
 * row includes an explanation. Bound local reading without increasing uploads. */
export function voterImportReadLimit(limits: BulkVoterImportLimits): number {
  return Math.max(
    limits.maxBytes,
    Math.min(64 * 1024 * 1024, limits.maxBytes * 6),
  );
}

/** Report annotations are never person data or authorization. Restore only
 * formula escaping explicitly recorded by the exporter, then drop annotations. */
export function prepareVoterImportCorrectionCsv(
  csv: string,
  limits: BulkVoterImportLimits,
): string {
  const readLimit = voterImportReadLimit(limits);
  if (new Blob([csv]).size > readLimit) {
    throw new Error(
      `El archivo supera el máximo de lectura de ${formatVoterImportSize(readLimit)}.`,
    );
  }
  const parsed = parseImportCsv(csv, {
    maxRows: limits.maxRows,
    maxCharacters: readLimit,
  });
  if (!parsed.headers.includes("Fila") || !parsed.headers.includes("Motivo")) {
    parseBulkCsv(csv, limits);
    return csv;
  }
  const annotations = new Set(["Fila", "Motivo", "Columnas protegidas"]);
  const keep = parsed.headers.flatMap((header, index) =>
    annotations.has(header) ? [] : [index],
  );
  const protectionIndex = parsed.headers.indexOf("Columnas protegidas");
  const restored = parsed.rows.map((row) => {
    const values = [...row.values];
    const protectedHeaders =
      protectionIndex >= 0 && values[protectionIndex]
        ? values[protectionIndex].split("|")
        : [];
    if (
      new Set(protectedHeaders).size !== protectedHeaders.length ||
      protectedHeaders.some(
        (header) => !parsed.headers.includes(header) || annotations.has(header),
      )
    ) {
      throw new Error(
        "Las columnas de ayuda del archivo cambiaron. Vuelve a descargar las filas con errores desde Importaciones recientes.",
      );
    }
    for (const index of keep) {
      if (!/^'\s*[=+@-]/u.test(values[index])) continue;
      if (protectionIndex >= 0) {
        if (protectedHeaders.includes(parsed.headers[index]))
          values[index] = values[index].slice(1);
      } else if (
        parsed.headers[index] === "Teléfono" &&
        /^'\+[1-9]\d{6,14}$/u.test(values[index])
      ) {
        // A leading apostrophe cannot be part of a valid canonical phone.
        values[index] = values[index].slice(1);
      } else {
        throw new Error(
          "Este informe antiguo no permite recuperar algunos signos iniciales con seguridad. Vuelve a descargar las filas con errores desde Importaciones recientes.",
        );
      }
    }
    return values;
  });
  const prepared = [parsed.headers, ...restored]
    .map((record) =>
      keep
        .map((index) => serializeValue(record[index], parsed.delimiter))
        .join(parsed.delimiter),
    )
    .join("\n");
  parseBulkCsv(prepared, limits);
  return prepared;
}

function parseBulkCsv(
  csv: string,
  limits: BulkVoterImportLimits,
): ParsedImportCsv {
  if (new Blob([csv]).size > limits.maxBytes) {
    throw new Error(
      `El archivo supera el máximo de ${formatVoterImportSize(limits.maxBytes)}. Divide el archivo antes de continuar.`,
    );
  }
  return parseImportCsv(csv, {
    maxRows: limits.maxRows,
    maxCharacters: limits.maxBytes,
  });
}

/** Only plan files explicitly selected by the user. The server validates every row,
 * existing evidence path, duplicate, notice and permission; this is not authorization. */
export function planBulkVoterImportEvidence(
  csv: string,
  files: readonly File[],
  limits: BulkVoterImportLimits = BULK_LIMITS,
): {
  totalRows: number;
  matches: Array<{ reference: string; file: File }>;
  unusedFileNames: string[];
} {
  const parsed = parseBulkCsv(csv, limits);
  const references = new Set(
    parsed.rows.map((row) => row.values[parsed.evidenceIndex]),
  );
  const selected = new Set<string>();
  const matches: Array<{ reference: string; file: File }> = [];
  const unusedFileNames: string[] = [];
  for (const file of files) {
    if (selected.has(file.name))
      throw new Error(
        `Hay dos archivos llamados ${file.name}. Asigna nombres distintos para poder reconocerlos.`,
      );
    selected.add(file.name);
    if (!references.has(file.name)) {
      unusedFileNames.push(file.name);
      continue;
    }
    validateEvidenceFile(file);
    matches.push({ reference: file.name, file });
  }
  return { totalRows: parsed.rows.length, matches, unusedFileNames };
}

export function applyBulkVoterImportEvidencePaths(
  csv: string,
  confirmedPaths: ReadonlyMap<string, string>,
  limits: BulkVoterImportLimits = BULK_LIMITS,
): string {
  const parsed = parseBulkCsv(csv, limits);
  const records = [
    parsed.headers,
    ...parsed.rows.map(({ values }) => {
      const next = [...values];
      const replacement = confirmedPaths.get(next[parsed.evidenceIndex]);
      if (replacement) next[parsed.evidenceIndex] = replacement;
      return next;
    }),
  ];
  const prepared = records
    .map((record) =>
      record
        .map((value) => serializeValue(value, parsed.delimiter))
        .join(parsed.delimiter),
    )
    .join("\n");
  if (new Blob([prepared]).size > limits.maxBytes) {
    throw new Error(
      "El archivo con sus evidencias supera el tamaño permitido. Divídelo en archivos más pequeños; las evidencias ya cargadas se conservan en esta ventana.",
    );
  }
  return prepared;
}

/** A usable, empty template avoids importing an example person or fabricated consent. */
export function createBlankVoterImportTemplate(
  requiredHeaders: string[],
  optionalHeaders: string[],
): string {
  const headers = [...new Set([...requiredHeaders, ...optionalHeaders])];
  return `\uFEFF${headers.map((header) => serializeValue(header, ";")).join(";")}\r\n`;
}

export function mergeVoterImportEvidenceFiles(
  previous: readonly File[],
  incoming: readonly File[],
): { files: File[]; replaced: number } {
  const seen = new Set<string>();
  for (const file of incoming) {
    if (seen.has(file.name))
      throw new Error(
        `Seleccionaste dos archivos llamados ${file.name}. Ponles nombres distintos y actualiza el CSV para identificar la evidencia correcta.`,
      );
    seen.add(file.name);
  }
  const combined = new Map(previous.map((file) => [file.name, file]));
  let replaced = 0;
  for (const file of incoming) {
    if (combined.has(file.name)) replaced += 1;
    combined.set(file.name, file);
  }
  return { files: [...combined.values()], replaced };
}

export const VOTER_IMPORT_COLUMN_HELP = [
  {
    column: "Documento",
    help: "Número de identificación, como texto para conservar ceros iniciales.",
  },
  {
    column: "Nombre / Apellido",
    help: "Nombres y apellidos en sus dos columnas.",
  },
  {
    column: "Consentimiento",
    help: "SI sólo cuando existe autorización expresa de esa persona.",
  },
  {
    column: "Version aviso",
    help: "Versión del aviso que la persona aceptó; debe coincidir con el aviso vigente.",
  },
  {
    column: "Fecha consentimiento",
    help: "Fecha y hora reales de la autorización, con zona horaria. Ejemplo de formato: 2026-10-06T09:30:00-05:00.",
  },
  {
    column: "Ruta evidencia",
    help: "Nombre exacto del PDF o imagen que adjuntes (por ejemplo, autorizacion_001.pdf), o referencia de una evidencia ya cargada en esta organización.",
  },
  {
    column: "Teléfono / Correo / Puesto / Mesa",
    help: "Opcionales. Usa códigos oficiales para puesto y mesa cuando correspondan; no inventes ubicaciones.",
  },
] as const;
