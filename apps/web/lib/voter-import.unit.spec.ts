import { expect, test } from "@playwright/test";
import {
  adaptVoterImportTemplate,
  applyVoterImportEvidencePaths,
  canAccessVoterImport,
  inspectVoterImportCsv,
  matchVoterImportEvidence,
} from "./voter-import";

const HEADER =
  "Documento,Nombre,Apellido,Teléfono,Correo,Puesto,Mesa,Consentimiento,Version aviso,Fecha consentimiento,Ruta evidencia";

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
