import { expect, test } from "@playwright/test";
import {
  adaptVoterImportTemplate,
  applyBulkVoterImportEvidencePaths,
  applyVoterImportEvidencePaths,
  canAccessVoterImport,
  createBlankVoterImportTemplate,
  inspectVoterImportCsv,
  matchVoterImportEvidence,
  mergeVoterImportEvidenceFiles,
  planBulkVoterImportEvidence,
  prepareVoterImportCorrectionCsv,
} from "./voter-import";

const HEADER =
  "Documento,Nombre,Apellido,Teléfono,Correo,Puesto,Mesa,Consentimiento,Version aviso,Fecha consentimiento,Ruta evidencia";

test("recupera signos protegidos por Excel sin cambiar consentimiento ni apóstrofos literales", () => {
  const limits = { maxRows: 50_000, maxBytes: 10 * 1024 * 1024 };
  const original = [
    "1",
    "-PRUEBA",
    "Prueba",
    "+573001234567",
    "+etiqueta@example.invalid",
    "",
    "",
    "NO",
    "v1",
    "2026-10-06T10:30:00-05:00",
    "tenant/consent/confirmed",
  ];
  const escaped = original.map((value) =>
    /^[\s]*[=+@-]/u.test(value) ? `'${value}` : value,
  );
  const reportHeader = `${HEADER},Fila,Motivo,Columnas protegidas`;
  const report = `${reportHeader}\n${[...escaped, "2", "Revisar", "Nombre|Teléfono|Correo"].join(",")}`;
  expect(prepareVoterImportCorrectionCsv(report, limits)).toBe(
    `${HEADER}\n${original.join(",")}`,
  );
  const alreadyRestored = `${reportHeader}\n${[...original, "2", "Revisar", "Nombre|Teléfono|Correo"].join(",")}`;
  expect(prepareVoterImportCorrectionCsv(alreadyRestored, limits)).toBe(
    `${HEADER}\n${original.join(",")}`,
  );
  const literal = [...original];
  literal[1] = "'-PRUEBA";
  const literalReport = `${reportHeader}\n${[...literal, "2", "Revisar", ""].join(",")}`;
  expect(prepareVoterImportCorrectionCsv(literalReport, limits)).toBe(
    `${HEADER}\n${literal.join(",")}`,
  );
});

test("un informe antiguo ambiguo pide una descarga nueva y no altera el nombre", () => {
  const legacy = `${HEADER},Fila,Motivo\n1,'-PRUEBA,Prueba,'+573001234567,,,,NO,v1,2026-10-06T15:30:00Z,tenant/consent/confirmed,2,Revisar`;
  const limits = { maxRows: 50_000, maxBytes: 10 * 1024 * 1024 };
  expect(() => prepareVoterImportCorrectionCsv(legacy, limits)).toThrow(
    /informe antiguo/u,
  );
  const phoneOnly = legacy.replace("'-PRUEBA", "PRUEBA");
  expect(prepareVoterImportCorrectionCsv(phoneOnly, limits)).toContain(
    "Prueba,+573001234567",
  );
  const malformed = `${legacy},Nombre|No existe`.replace(
    "Fila,Motivo\n",
    "Fila,Motivo,Columnas protegidas\n",
  );
  expect(() => prepareVoterImportCorrectionCsv(malformed, limits)).toThrow(
    /columnas de ayuda/u,
  );
});

test("inspecciona CSV con comillas y reemplaza solo las evidencias por rutas confirmadas", () => {
  const csv = [
    HEADER,
    '1012345678,"Ana, María",Pérez,,,,,SI,notice-v1,2026-09-07T12:00:00.000Z,ana.pdf',
    "1098765432,Carlos,Rojas,,,,,SI,notice-v1,2026-09-07T12:10:00.000Z,carlos.png",
  ].join("\n");
  const inspection = inspectVoterImportCsv(csv);

  expect(inspection).toEqual({
    totalRows: 2,
    evidence: [
      {
        row: 2,
        documentId: "1012345678",
        reference: "ana.pdf",
        fileName: "ana.pdf",
      },
      {
        row: 3,
        documentId: "1098765432",
        reference: "carlos.png",
        fileName: "carlos.png",
      },
    ],
  });

  const prepared = applyVoterImportEvidencePaths(
    csv,
    new Map([
      [
        "ana.pdf",
        "tenant-from-api/consent/123e4567-e89b-42d3-a456-426614174000.pdf",
      ],
      [
        "carlos.png",
        "tenant-from-api/consent/223e4567-e89b-42d3-a456-426614174000.png",
      ],
    ]),
  );

  expect(prepared).toContain('1012345678,"Ana, María",Pérez');
  expect(prepared).not.toContain(",ana.pdf");
  expect(prepared).not.toContain(",carlos.png");
  expect(prepared).toContain(
    ",tenant-from-api/consent/123e4567-e89b-42d3-a456-426614174000.pdf",
  );
});

test("la carga masiva permite 50.000 filas y deja errores y duplicados a la revisión del servidor", () => {
  const rows = Array.from(
    { length: 50_000 },
    (_, index) =>
      `${index},Persona,Prueba,,,,,SI,v1,2026-10-06T09:00:00-05:00,`,
  );
  rows[3] = rows[2];
  const csv = [HEADER, ...rows].join("\n");
  const plan = planBulkVoterImportEvidence(csv, []);
  expect(plan).toEqual({ totalRows: 50_000, matches: [], unusedFileNames: [] });
  expect(() => planBulkVoterImportEvidence(`${csv}\n${rows[0]}`, [])).toThrow(
    /50.000/u,
  );
});

test("límites masivos se miden en bytes UTF-8, no sólo caracteres", () => {
  const csv = `${HEADER}\n1,José,Prueba,,,,,SI,v1,2026-10-06T09:00:00-05:00,autorización.pdf`;
  expect(new Blob([csv]).size).toBeGreaterThan(csv.length);
  expect(() =>
    planBulkVoterImportEvidence(csv, [], {
      maxRows: 50_000,
      maxBytes: csv.length,
    }),
  ).toThrow(/tamaño|máximo/u);
});

test("adjunta sólo referencias exactas y permite conservar rutas ya cargadas", () => {
  const csv = [
    HEADER,
    "1,Ana,Prueba,,,,,SI,v1,2026-10-06T09:00:00-05:00,ana.pdf",
    "2,Luz,Prueba,,,,,SI,v1,2026-10-06T09:00:00-05:00,tenant/consent/luz.pdf",
    "3,Leo,Prueba,,,,,SI,v1,2026-10-06T09:00:00-05:00,falta.pdf",
  ].join("\n");
  const selected = new File(["pdf"], "ana.pdf", { type: "application/pdf" });
  const extra = new File(["pdf"], "luz.pdf", { type: "application/pdf" });
  expect(planBulkVoterImportEvidence(csv, [selected, extra])).toEqual({
    totalRows: 3,
    matches: [{ reference: "ana.pdf", file: selected }],
    unusedFileNames: ["luz.pdf"],
  });
  const prepared = applyBulkVoterImportEvidencePaths(
    csv,
    new Map([["ana.pdf", "tenant/consent/confirmed.pdf"]]),
  );
  expect(prepared).toContain("tenant/consent/confirmed.pdf");
  expect(prepared).toContain("tenant/consent/luz.pdf");
  expect(prepared).toContain("falta.pdf");
  // A missing or existing reference is never assumed to be authorized locally.
  expect(prepared.split("\n")).toHaveLength(4);
});

test("corregir CSV de errores conserva columnas y comillas sin importar la explicación como persona", () => {
  const csv = [
    HEADER + ",Fila,Motivo",
    '1,"Ana, Luz",Prueba,,,,,SI,v1,2026-10-06T09:00:00-05:00,ana.pdf,2,"Nombre, incompleto"',
  ].join("\n");
  const prepared = applyBulkVoterImportEvidencePaths(
    csv,
    new Map([["ana.pdf", "tenant/consent/confirmed.pdf"]]),
  );
  expect(planBulkVoterImportEvidence(prepared, []).totalRows).toBe(1);
  expect(prepared).toContain('"Ana, Luz"');
  expect(prepared).toContain('2,"Nombre, incompleto"');
});

test("plantilla masiva real está vacía, con BOM y encabezados únicos", () => {
  const template = createBlankVoterImportTemplate(
    ["Documento", "Nombre"],
    ["Nombre", "Correo"],
  );
  expect(template).toBe("\uFEFFDocumento;Nombre;Correo\r\n");
  expect(template).not.toContain("SI");
  expect(template).not.toContain("2026");
});

test("no elige silenciosamente entre evidencias homónimas y distingue reemplazos", () => {
  const first = new File(["a"], "a.pdf");
  const corrected = new File(["b"], "a.pdf");
  expect(() => mergeVoterImportEvidenceFiles([], [first, corrected])).toThrow(
    /dos archivos llamados/u,
  );
  expect(mergeVoterImportEvidenceFiles([first], [corrected])).toEqual({
    files: [corrected],
    replaced: 1,
  });
});

test("rechaza localmente documentos o evidencias repetidos antes de subir archivos", () => {
  expect(() =>
    inspectVoterImportCsv(
      [
        HEADER,
        "1012345678,Ana,Pérez,,,,,SI,v1,2026-09-07T12:00:00.000Z,ana.pdf",
        "1012345678,Otro,Nombre,,,,,SI,v1,2026-09-07T12:01:00.000Z,otra.pdf",
      ].join("\n"),
    ),
  ).toThrow(/aparece más de una vez/u);

  expect(() =>
    inspectVoterImportCsv(
      [
        HEADER,
        "1012345678,Ana,Pérez,,,,,SI,v1,2026-09-07T12:00:00.000Z,mis/ana.pdf",
        "1098765432,Otro,Nombre,,,,,SI,v1,2026-09-07T12:01:00.000Z,ana.pdf",
      ].join("\n"),
    ),
  ).toThrow(/Cada persona requiere un archivo único/u);
});

test("empareja nombres exactos, valida la política CONSENT y no carga extras", () => {
  const inspection = inspectVoterImportCsv(
    [
      HEADER,
      "1012345678,Ana,Pérez,,,,,SI,v1,2026-09-07T12:00:00.000Z,ana.pdf",
    ].join("\n"),
  );
  const expected = new File([new Uint8Array([1, 2])], "ana.pdf", {
    type: "application/pdf",
  });
  const extra = new File([new Uint8Array([3])], "extra.png", {
    type: "image/png",
  });

  expect(matchVoterImportEvidence(inspection, [expected, extra])).toEqual({
    matches: [{ ...inspection.evidence[0], file: expected }],
    unusedFileNames: ["extra.png"],
  });
  expect(() =>
    matchVoterImportEvidence(inspection, [
      new File([new Uint8Array([1])], "ana.exe", {
        type: "application/octet-stream",
      }),
    ]),
  ).toThrow(/evidencia válida/u);
  expect(() => matchVoterImportEvidence(inspection, [])).toThrow(
    /Falta seleccionar ana\.pdf/u,
  );
});

test("restringe la entrada por el mismo rol y modo de campaña del backend", () => {
  expect(canAccessVoterImport("ADMIN", "CANDIDACY")).toBe(true);
  expect(canAccessVoterImport("CAMPAIGN_MANAGER", "PARTY")).toBe(true);
  expect(canAccessVoterImport("COMPLIANCE_OFFICER", "CANDIDACY")).toBe(false);
  expect(canAccessVoterImport("ADMIN", "PUBLIC_OFFICE")).toBe(false);
  expect(canAccessVoterImport(undefined, "CANDIDACY")).toBe(false);
});

test("adapta la plantilla del backend al nombre local y completa el flujo solo con la ruta retornada", () => {
  const serverTemplate = [
    HEADER,
    "1234567890,Juan,García,3001234567,juan@ejemplo.com,,,SI,VERSION_AVISO_ACTIVA,2026-09-07T12:00:00.000Z,tenant-a/consent/UUID.pdf",
  ].join("\n");
  const adapted = adaptVoterImportTemplate(
    serverTemplate,
    "notice-active-v3",
    "2026-09-07T13:00:00.000Z",
  );

  expect(adapted).toContain("evidencia_1234567890.pdf");
  expect(adapted).toContain("notice-active-v3");
  expect(adapted).not.toContain("tenant-a");
  expect(adapted).not.toContain("VERSION_AVISO_ACTIVA");
  expect(adapted).toContain("2026-09-07T13:00:00.000Z");

  const inspection = inspectVoterImportCsv(adapted);
  const evidence = new File(
    [new Uint8Array([1, 2, 3])],
    "evidencia_1234567890.pdf",
    { type: "application/pdf" },
  );
  const plan = matchVoterImportEvidence(inspection, [evidence]);
  expect(plan.matches[0].file).toBe(evidence);

  const returnedPath =
    "tenant-from-api/consent/123e4567-e89b-42d3-a456-426614174000.pdf";
  const prepared = applyVoterImportEvidencePaths(
    adapted,
    new Map([[plan.matches[0].reference, returnedPath]]),
  );
  expect(prepared).toContain(returnedPath);
  expect(prepared).not.toContain("evidencia_1234567890.pdf");
});
