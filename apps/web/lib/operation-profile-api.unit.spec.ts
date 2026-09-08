import { expect, test } from "@playwright/test";
import {
  getOperationProfile,
  saveOperationProfile,
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
  electionDate: "2027-10-31T17:00:00.000Z",
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
