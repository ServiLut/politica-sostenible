import { expect, test } from "@playwright/test";
import {
  activateCalendarRelease,
  canonicalCalendarCommandPayload,
  computeCalendarCommandSha256,
  createCalendarRelease,
  recordCalendarResult,
} from "./electoral-calendar-api";

function successful(data: unknown) {
  return new Response(
    JSON.stringify({ statusCode: 200, message: "Success", data }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

test("canonicaliza recursivamente y excluye cualquier huella recibida", async () => {
  const first = {
    clientRequestId: "123e4567-e89b-42d3-a456-426614174000",
    z: 1,
    nested: { z: true, a: false },
  };
  const second = {
    nested: { a: false, payloadSha256: "f".repeat(64), z: true },
    payloadSha256: "e".repeat(64),
    z: 1,
    clientRequestId: "123e4567-e89b-42d3-a456-426614174000",
  };

  await expect(
    computeCalendarCommandSha256("RELEASE_STAGE", first),
  ).resolves.toBe(
    await computeCalendarCommandSha256("RELEASE_STAGE", second),
  );
  expect(canonicalCalendarCommandPayload("RELEASE_STAGE", second)).toBe(
    '{"clientRequestId":"123e4567-e89b-42d3-a456-426614174000","nested":{"a":false,"z":true},"type":"RELEASE_STAGE","z":1}',
  );
});

test("liga las mutaciones a la release o hito exactos", async () => {
  const identity = {
    clientRequestId: "123e4567-e89b-42d3-a456-426614174000",
    expectedVersion: 2,
    sourceReviewedAcknowledged: true,
    diffReviewedAcknowledged: true,
    affectedTasksResolvedAcknowledged: true,
    rationale: "Revisión independiente de fuente y diferencias",
  };

  expect(
    await computeCalendarCommandSha256("RELEASE_ACTIVATE", {
      releaseId: "release-a",
      ...identity,
    }),
  ).not.toBe(
    await computeCalendarCommandSha256("RELEASE_ACTIVATE", {
      releaseId: "release-b",
      ...identity,
    }),
  );
});

test("normaliza versión e hitos sin enviar tenant, actor ni modo", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = async (request, init) => {
    calls.push({
      url: String(request),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return successful({ resource: {}, command: {}, noOp: false });
  };

  try {
    await createCalendarRelease({
      clientRequestId: "123e4567-e89b-42d3-a456-426614174000",
      roundCode: " unica ",
      versionLabel: " Corte 1 ",
      sourceAuthority: " Autoridad competente ",
      sourceUrl: " https://authority.invalid/calendar ",
      sourceReference: " Acto verificable ",
      sourcePublishedAt: "2099-01-01",
      sourceCutoffAt: "2099-01-02T12:00:00.000Z",
      sourceSha256: "a".repeat(64),
      milestones: [
        {
          stableKey: " cierre.registro ",
          category: "REGISTRATION",
          semantics: "EXTERNAL_DEADLINE",
          title: " Cierre de registro ",
          applicabilityRule: " Aplica al perfil configurado ",
          originalTextSummary: " Resumen contrastado de la fuente ",
          localDate: "2099-03-01",
          localTime: "17:00",
          timeZone: "America/Bogota",
          responsibleUserId: "responsible-a",
          backupUserId: "backup-b",
          alertOffsetsDays: [0, 30, 7],
          stageGateRequired: true,
          resultEvidenceRequired: true,
        },
      ],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/electoral-calendar/releases");
    expect(calls[0].body).toMatchObject({ roundCode: "UNICA" });
    const milestones = calls[0].body.milestones as Array<
      Record<string, unknown>
    >;
    expect(milestones[0]).toMatchObject({
      stableKey: "CIERRE.REGISTRO",
      alertOffsetsDays: [30, 7, 0],
    });
    expect(calls[0].body.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(calls[0].body)).not.toContain("tenantId");
    expect(JSON.stringify(calls[0].body)).not.toContain("actorUserId");
    expect(JSON.stringify(calls[0].body)).not.toContain('"mode"');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("envía activación y resultado por endpoints ligados y con hash", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = async (request, init) => {
    calls.push({
      url: String(request),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return successful({ resource: {}, command: {}, noOp: false });
  };

  try {
    await activateCalendarRelease("release-1", {
      clientRequestId: "123e4567-e89b-42d3-a456-426614174001",
      expectedVersion: 2,
      sourceReviewedAcknowledged: true,
      diffReviewedAcknowledged: true,
      affectedTasksResolvedAcknowledged: true,
      rationale: "Fuente, cambios y tareas revisados por segunda persona",
    });
    await recordCalendarResult("milestone-1", {
      clientRequestId: "123e4567-e89b-42d3-a456-426614174002",
      outcome: "COMPLETED",
      explanation: "Resultado interno documentado y verificable",
      evidenceStoragePath: "tenant/electoral-calendar/object.pdf",
      evidenceSha256: "b".repeat(64),
    });

    expect(calls.map(({ url }) => url)).toEqual([
      "/api/electoral-calendar/releases/release-1/activate",
      "/api/electoral-calendar/milestones/milestone-1/results",
    ]);
    for (const { body } of calls) {
      expect(body.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(body).not.toHaveProperty("tenantId");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
