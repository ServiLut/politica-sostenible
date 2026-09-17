import { expect, test } from "@playwright/test";
import {
  createWitnessAssignment,
  getWitnessCoverage,
  listWitnessCoverageWindows,
} from "./witness-planning-api";

function successful(data: unknown) {
  return new Response(
    JSON.stringify({ statusCode: 200, message: "Success", data }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

test("consulta cobertura y ventanas por HTTP sin aceptar tenantId", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (request) => {
    urls.push(String(request));
    return successful({ items: [], places: [], summary: {} });
  };
  try {
    await getWitnessCoverage("REAL");
    await listWitnessCoverageWindows("SIMULATION");
    expect(urls).toEqual([
      "/api/witnesses/assignments/coverage?captureContext=REAL&limit=100",
      "/api/witnesses/assignments/coverage-windows?captureContext=SIMULATION",
    ]);
    expect(urls.join(" ")).not.toContain("tenantId");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("crea una asignación vinculada a ventana con JSON y sin tenant del cliente", async () => {
  const originalFetch = globalThis.fetch;
  let body = "";
  let method = "";
  globalThis.fetch = async (_request, init) => {
    body = String(init?.body);
    method = String(init?.method);
    return successful({ id: "assignment-a" });
  };
  try {
    await createWitnessAssignment({
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      coverageWindowId: "window-a",
      witnessId: "witness-a",
      puestoId: "place-a",
      tableStart: 1,
      tableEnd: 3,
      shiftStartsAt: "2027-10-31T12:00:00.000Z",
      shiftEndsAt: "2027-10-31T22:00:00.000Z",
      captureContext: "REAL",
      assignmentType: "PRIMARY",
    });
    expect(method).toBe("POST");
    expect(JSON.parse(body)).toMatchObject({
      coverageWindowId: "window-a",
      tableStart: 1,
      tableEnd: 3,
    });
    expect(body).not.toContain("tenantId");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
