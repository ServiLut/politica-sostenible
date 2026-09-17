import { expect, test } from "@playwright/test";
import {
  canonicalOperationAdoptionPayload,
  canonicalOperationAdoptionReviewPayload,
  computeOperationAdoptionPayloadSha256,
  computeOperationAdoptionReviewSha256,
  getOperationAdoption,
  getOperationReadiness,
  getOperationProfile,
  requestOperationAdoption,
  reviewOperationAdoption,
  saveOperationProfile,
  type OperationAdoptionHashInput,
  type OperationReadiness,
  type UpsertOperationProfileInput,
} from "./operation-profile-api";

function successful(data: unknown) {
  return new Response(
    JSON.stringify({ statusCode: 200, message: "Success", data }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

const input: UpsertOperationProfileInput = {
  operationType: "SINGLE_CANDIDACY",
  stage: "ELECTION_DAY",
  electionType: "MAYORALTY",
  circumscriptionType: "MUNICIPAL",
  circumscriptionName: "Medellín",
  circumscriptionCode: "05001",
  electionDate: "2027-10-31",
  votingStartDate: "2027-10-31",
  votingEndDate: "2027-10-31",
  expectedTeamSize: 25,
  candidateCount: 1,
  maxTotalBudget: 500_000_000,
  maxPublicityLimit: 100_000_000,
  dataControllerName: "Comité responsable",
  responsibleDataUserId: "admin-1",
  retentionPeriodDays: 730,
  revocationProcedure:
    "Solicitar la revocación al canal de privacidad y validar la identidad.",
  expectedUpdatedAt: "2026-09-07T10:00:00.000Z",
};

const readiness: OperationReadiness = {
  stage: "ELECTION_DAY",
  electionDate: "2027-10-31T17:00:00.000Z",
  votingStartDate: "2027-10-31",
  votingEndDate: "2027-10-31",
  votingWindowSourceUrl: null,
  votingWindowReference: null,
  generatedAt: "2027-10-31T12:15:00.000Z",
  overall: "BLOCKED",
  closure: null,
  sections: {
    BEFORE_CAMPAIGN: [
      {
        code: "ACTIVE_CONSENT_NOTICE",
        label: "Aviso de consentimiento activo",
        status: "PASS",
        detail: "Existe un aviso activo.",
        href: "/dashboard/settings",
      },
    ],
    CAMPAIGN: [],
    ELECTION_DAY: [
      {
        code: "E14_DIVERGENT",
        label: "Mesas con E-14 divergentes",
        status: "BLOCK",
        detail: "Una mesa requiere conciliación.",
        href: "/dashboard/war-room",
      },
    ],
    POST_ELECTION: [],
  },
};

test("consulta el perfil de la organización autenticada", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = async (request, init) => {
    requestedUrl = String(request);
    requestInit = init;
    return successful({ configured: false, profile: null });
  };

  try {
    await expect(getOperationProfile()).resolves.toEqual({
      configured: false,
      profile: null,
    });
    expect(requestedUrl).toBe("/api/operation-profile");
    expect(requestInit?.method).toBeUndefined();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("consulta el alistamiento y propaga la cancelación de la vista", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let requestedUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = async (request, init) => {
    requestedUrl = String(request);
    requestInit = init;
    return successful(readiness);
  };

  try {
    await expect(getOperationReadiness(controller.signal)).resolves.toEqual(
      readiness,
    );
    expect(requestedUrl).toBe("/api/operation-profile/readiness");
    expect(requestInit?.method).toBeUndefined();
    expect(requestInit?.signal).toBe(controller.signal);
    expect(requestInit?.body).toBeUndefined();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("guarda el DTO sin permitir que el cliente envíe el tenant", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = async (request, init) => {
    requestedUrl = String(request);
    requestInit = init;
    return successful({ configured: true, profile: { stage: input.stage } });
  };

  try {
    await saveOperationProfile(input);
    const body = JSON.parse(String(requestInit?.body)) as Record<
      string,
      unknown
    >;

    expect(requestedUrl).toBe("/api/operation-profile");
    expect(requestInit?.method).toBe("PUT");
    expect(body).toEqual(input);
    expect(body).not.toHaveProperty("tenantId");
    expect(body).not.toHaveProperty("createdById");
    expect(body).not.toHaveProperty("updatedById");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

const adoptionHashInput: OperationAdoptionHashInput = {
  clientRequestId: "550E8400-E29B-41D4-A716-446655440000",
  operationType: "SINGLE_CANDIDACY",
  targetStage: "CAMPAIGN",
  electionType: "MAYORALTY",
  circumscriptionType: "MUNICIPAL",
  circumscriptionName: "  Municipio de Medellín  ",
  circumscriptionCode: " 05001 ",
  electionDate: "2027-10-31T12:00:00-05:00",
  votingStartDate: "2027-10-30",
  votingEndDate: "2027-10-31",
  votingWindowSourceUrl: " https://example.test/calendario.pdf ",
  votingWindowReference: " Resolución de ejemplo, artículo 4 ",
  expectedTeamSize: 25,
  candidateCount: 1,
  maxTotalBudget: 500_000_000,
  maxPublicityLimit: 100_000_000,
  dataControllerName: " Comité responsable ",
  responsibleDataUserId: "admin-1",
  retentionPeriodDays: 730,
  revocationProcedure: " Solicitar la revocación por el canal de privacidad. ",
  effectiveAt: "2026-09-09T09:00:00-05:00",
  justification:
    " La campaña inició fuera del sistema y requiere trazabilidad desde este momento, con revisión independiente y evidencia verificable. ",
  evidenceReference: " expediente-2026/acta-inicio.pdf ",
  evidenceSha256: "a".repeat(64),
  incompleteHistoryAcknowledged: true,
};

test("canoniza y calcula el hash de adopción exactamente como Nest", async () => {
  const canonical = canonicalOperationAdoptionPayload(adoptionHashInput);
  expect(canonical).toContain('"maxTotalBudget":"500000000"');
  expect(canonical).toContain('"listType":null');
  expect(canonical).toContain('"effectiveAt":"2026-09-09T14:00:00.000Z"');
  expect(canonical).toContain('"votingStartDate":"2027-10-30"');
  expect(canonical).toContain('"votingEndDate":"2027-10-31"');
  expect(canonical).toContain(
    '"votingWindowSourceUrl":"https://example.test/calendario.pdf"',
  );
  expect(canonical).toContain(
    '"votingWindowReference":"Resolución de ejemplo, artículo 4"',
  );
  expect(canonical).not.toContain("  Municipio");
  await expect(
    computeOperationAdoptionPayloadSha256(adoptionHashInput),
  ).resolves.toBe(
    "7e88d75ec0644523c29f5ac1aad494a34694a3577ee39e290778a2ec35a9e83b",
  );
});

test("canoniza la revisión con razón nula o recortada y calcula su hash", async () => {
  const rejection = {
    clientReviewId: "6BA7B810-9DAD-41D1-80B4-00C04FD430C8",
    expectedPayloadSha256:
      "0bf25e3cb5faf3f045c0e5cd763575f999ffcd0f870381386c0ced7e26419866",
    decision: "REJECT" as const,
    rejectionReason:
      " La evidencia no permite verificar la fecha efectiva declarada. ",
  };
  expect(canonicalOperationAdoptionReviewPayload("adoption-a", rejection)).toBe(
    '{"requestId":"adoption-a","clientReviewId":"6ba7b810-9dad-41d1-80b4-00c04fd430c8","expectedPayloadSha256":"0bf25e3cb5faf3f045c0e5cd763575f999ffcd0f870381386c0ced7e26419866","decision":"REJECT","rejectionReason":"La evidencia no permite verificar la fecha efectiva declarada."}',
  );
  await expect(
    computeOperationAdoptionReviewSha256("adoption-a", rejection),
  ).resolves.toBe(
    "82d4be79c569e7760b897f0da092051e8ec0efb811f6a66c5629dfa2206cb134",
  );

  expect(
    canonicalOperationAdoptionReviewPayload("adoption-a", {
      ...rejection,
      decision: "APPROVE",
      rejectionReason: undefined,
    }),
  ).toContain('"rejectionReason":null');
});

test("usa exclusivamente los endpoints HTTP de solicitud y revisión", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (request, init) => {
    calls.push({ url: String(request), init });
    return successful({ request: null, noOp: false });
  };

  try {
    const payloadSha256 =
      await computeOperationAdoptionPayloadSha256(adoptionHashInput);
    await getOperationAdoption();
    await requestOperationAdoption({ ...adoptionHashInput, payloadSha256 });
    await reviewOperationAdoption("adoption/a", {
      clientReviewId: "6ba7b810-9dad-41d1-80b4-00c04fd430c8",
      expectedPayloadSha256: payloadSha256,
      decision: "APPROVE",
      reviewPayloadSha256: "b".repeat(64),
    });

    expect(calls.map(({ url }) => url)).toEqual([
      "/api/operation-profile/adoption",
      "/api/operation-profile/adoption",
      "/api/operation-profile/adoption/adoption%2Fa/review",
    ]);
    expect(calls[0]?.init?.method).toBeUndefined();
    expect(calls[1]?.init?.method).toBe("POST");
    expect(calls[2]?.init?.method).toBe("POST");
    const sent = JSON.parse(String(calls[1]?.init?.body)) as Record<
      string,
      unknown
    >;
    expect(sent.payloadSha256).toBe(payloadSha256);
    expect(sent).not.toHaveProperty("tenantId");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
