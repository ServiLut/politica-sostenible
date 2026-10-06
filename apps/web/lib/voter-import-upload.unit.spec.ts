import { expect, test } from "@playwright/test";
import {
  createVoterImportUploadSession,
  type VoterImportUploadDependencies,
} from "./voter-import-upload";

const header =
  "Documento;Nombre;Apellido;Consentimiento;Version aviso;Fecha consentimiento;Ruta evidencia";
const csv = `${header}\n1;Ana;Prueba;SI;v1;2026-10-06T09:00:00-05:00;ana.pdf`;
const limits = { maxRows: 50_000, maxBytes: 20 * 1024 * 1024 };
const pdf = new File(["synthetic evidence"], "ana.pdf", {
  type: "application/pdf",
});
const file = new File([csv], "personas.csv", { type: "text/csv" });
const base = {
  file,
  evidenceFiles: [pdf],
  limits,
  signal: new AbortController().signal,
  onProgress: () => {},
  onUnused: () => {},
};

test("un informe grande de errores se vuelve a cargar sin sus columnas auxiliares", async () => {
  const source = `${header};Fila;Motivo\n1;Ana;Prueba;NO;v1;2026-10-06T14:00:00Z;tenant/consent/confirmed;2;${"Explicación extensa ".repeat(180)}`;
  const correction = new File([source], "personas_por_corregir.csv", {
    type: "text/csv",
  });
  const correctionLimits = { maxRows: 50_000, maxBytes: 1024 };
  expect(correction.size).toBeGreaterThan(correctionLimits.maxBytes);
  const uploaded: File[] = [];
  const session = createVoterImportUploadSession({
    upload: async (file, module) => {
      expect(module).toBe("person-import");
      uploaded.push(file);
      return { path: "tenant/person-import/corrected", sha256: "c".repeat(64) };
    },
    requestId: () => "correction-id",
  });
  await session.prepare({
    ...base,
    file: correction,
    evidenceFiles: [],
    limits: correctionLimits,
  });
  expect(uploaded).toHaveLength(1);
  expect(uploaded[0].size).toBeLessThanOrEqual(correctionLimits.maxBytes);
  expect(await uploaded[0].text()).toBe(
    `${header}\n1;Ana;Prueba;NO;v1;2026-10-06T14:00:00Z;tenant/consent/confirmed`,
  );
});

test("las columnas de errores no permiten subir datos reales por encima del límite", async () => {
  let uploads = 0;
  const session = createVoterImportUploadSession({
    upload: async () => {
      uploads++;
      throw new Error("No debe cargarse");
    },
    requestId: () => "never",
  });
  const oversized = `${header};Fila;Motivo\n1;${"Ana ".repeat(400)};Prueba;NO;v1;2026-10-06T14:00:00Z;tenant/consent/confirmed;2;Revisar`;
  await expect(
    session.prepare({
      ...base,
      file: new File([oversized], "corregido.csv"),
      evidenceFiles: [],
      limits: { maxRows: 50_000, maxBytes: 1024 },
    }),
  ).rejects.toThrow(/máximo/u);
  expect(uploads).toBe(0);
});

test("sube evidencia antes del CSV y reintenta la misma revisión sin duplicar cargas ni ID", async () => {
  const calls: Array<{ file: File; module: string }> = [];
  let ids = 0;
  const session = createVoterImportUploadSession({
    upload: async (file, module) => {
      calls.push({ file, module });
      return { path: `tenant/${module}/confirmed`, sha256: "a".repeat(64) };
    },
    requestId: () => `id-${++ids}`,
  });
  const first = await session.prepare(base);
  const retry = await session.prepare(base);
  expect(calls.map((call) => call.module)).toEqual([
    "consent",
    "person-import",
  ]);
  expect(await calls[1].file.text()).toContain("tenant/consent/confirmed");
  expect(await calls[1].file.text()).not.toContain("ana.pdf");
  expect(retry).toBe(first);
  expect(ids).toBe(1);
});

test("al corregir datos se crea otra revisión y se conserva la evidencia ya confirmada", async () => {
  const calls: string[] = [];
  let ids = 0;
  const session = createVoterImportUploadSession({
    upload: async (_, module) => {
      calls.push(module);
      return {
        path: `tenant/${module}/${calls.length}`,
        sha256: "b".repeat(64),
      };
    },
    requestId: () => `id-${++ids}`,
  });
  const first = await session.prepare(base);
  const corrected = await session.prepare({
    ...base,
    file: new File([csv.replace("Ana", "Ana María")], "corregido.csv", {
      type: "text/csv",
    }),
  });
  expect(calls).toEqual(["consent", "person-import", "person-import"]);
  expect(corrected.clientRequestId).not.toBe(first.clientRequestId);
});

test("fallo al subir CSV no obliga a repetir evidencias y no crea ID prematuro", async () => {
  let sourceAttempts = 0;
  let evidenceUploads = 0;
  let ids = 0;
  const session = createVoterImportUploadSession({
    upload: async (_, module) => {
      if (module === "consent") evidenceUploads += 1;
      if (module === "person-import" && ++sourceAttempts === 1)
        throw new Error("Storage no disponible");
      return { path: `tenant/${module}/confirmed`, sha256: "a".repeat(64) };
    },
    requestId: () => `id-${++ids}`,
  });
  await expect(session.prepare(base)).rejects.toThrow("Storage no disponible");
  expect(ids).toBe(0);
  await expect(session.prepare(base)).resolves.toMatchObject({
    clientRequestId: "id-1",
  });
  expect(evidenceUploads).toBe(1);
  expect(sourceAttempts).toBe(2);
});

test("desmontar durante carga detiene el siguiente archivo y no prepara un trabajo", async () => {
  const abort = new AbortController();
  const calls: string[] = [];
  let ids = 0;
  const session = createVoterImportUploadSession({
    upload: async (_, module) => {
      calls.push(module);
      abort.abort();
      return { path: "tenant/consent/confirmed", sha256: "a".repeat(64) };
    },
    requestId: () => String(++ids),
  });
  await expect(
    session.prepare({ ...base, signal: abort.signal }),
  ).rejects.toThrow();
  expect(calls).toEqual(["consent"]);
  expect(ids).toBe(0);
});

test("archivo Excel binario o tamaño excedido falla antes de cualquier subida", async () => {
  let calls = 0;
  const dependencies: VoterImportUploadDependencies = {
    upload: async () => {
      calls += 1;
      throw new Error("No debería cargarse");
    },
    requestId: () => "never",
  };
  const session = createVoterImportUploadSession(dependencies);
  await expect(
    session.prepare({ ...base, file: new File(["excel"], "personas.xlsx") }),
  ).rejects.toThrow(/CSV UTF-8/u);
  await expect(
    session.prepare({ ...base, limits: { ...limits, maxBytes: 1 } }),
  ).rejects.toThrow(/máximo/u);
  expect(calls).toBe(0);
});

test("el límite real de evidencia se comprueba antes de subir ningún archivo", async () => {
  let uploads = 0;
  const session = createVoterImportUploadSession({
    upload: async () => {
      uploads++;
      throw new Error("No debe iniciarse una carga");
    },
    requestId: () => "never",
  });
  await expect(
    session.prepare({
      ...base,
      limits: { ...limits, maxEvidenceBytes: pdf.size - 1 },
    }),
  ).rejects.toThrow(/autorización ana.pdf.*almacenamiento/u);
  expect(uploads).toBe(0);
});

test("sustituir evidencia con mismo nombre obliga a comprobar sus nuevos bytes", async () => {
  const calls: string[] = [];
  const session = createVoterImportUploadSession({
    upload: async (_, module) => {
      calls.push(module);
      return {
        path: `tenant/${module}/${calls.length}`,
        sha256: "a".repeat(64),
      };
    },
    requestId: () => "request",
  });
  await session.prepare(base);
  await session.prepare({
    ...base,
    evidenceFiles: [
      new File(["corrected"], "ana.pdf", { type: "application/pdf" }),
    ],
  });
  expect(calls).toEqual([
    "consent",
    "person-import",
    "consent",
    "person-import",
  ]);
});
