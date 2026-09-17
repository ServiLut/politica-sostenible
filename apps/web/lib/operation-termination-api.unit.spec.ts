import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  cancelOperationTermination,
  canonicalOperationTerminationCancellationPayload,
  canonicalOperationTerminationPayload,
  canonicalOperationTerminationReviewPayload,
  computeOperationTerminationCancellationSha256,
  computeOperationTerminationPayloadSha256,
  computeOperationTerminationReviewSha256,
  getOperationTermination,
  requestOperationTermination,
  reviewOperationTermination,
  type OperationTerminationHashInput,
} from "./operation-termination-api";

function successful(data: unknown) {
  return new Response(
    JSON.stringify({ statusCode: 200, message: "Success", data }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

const request: OperationTerminationHashInput = {
  clientRequestId: "550E8400-E29B-41D4-A716-446655440000",
  expectedProfileUpdatedAt: "2026-09-09T09:00:00-05:00",
  cause: "REGISTRATION_REVOKED",
  effectiveAt: "2026-09-09T08:00:00-05:00",
  explanation:
    " La autoridad electoral revocó formalmente la inscripción mediante acto verificable y la operación no puede continuar sin falsear la etapa real del ciclo. ",
  authorityName: " Consejo Nacional Electoral ",
  officialActType: " Resolución ",
  officialActReference: " CNE-2026-991 ",
  officialActIssuedAt: "2026-09-09T07:00:00-05:00",
  evidenceReference: " https://www.cne.gov.co/actos/991.pdf ",
  evidenceSha256: "A".repeat(64),
  consequencesAcknowledged: true,
};

test("canoniza la terminación exactamente y cubre versión, causal, acto y evidencia", async () => {
  const canonical = canonicalOperationTerminationPayload(request);
  expect(canonical).toContain(
    '"expectedProfileUpdatedAt":"2026-09-09T14:00:00.000Z"',
  );
  expect(canonical).toContain('"otherCause":null');
  expect(canonical).toContain(`"evidenceSha256":"${"a".repeat(64)}"`);
  expect(canonical).not.toContain(" Consejo");
  await expect(computeOperationTerminationPayloadSha256(request)).resolves.toBe(
    createHash("sha256").update(canonical).digest("hex"),
  );
});

test("canoniza por separado revisión y cancelación idempotentes", async () => {
  const review = {
    clientReviewId: "6BA7B810-9DAD-41D1-80B4-00C04FD430C8",
    expectedPayloadSha256: "b".repeat(64),
    decision: "REJECT" as const,
    rejectionReason: " La referencia no demuestra el acto indicado. ",
  };
  const cancellation = {
    clientCancellationId: "6BA7B811-9DAD-41D1-80B4-00C04FD430C8",
    expectedPayloadSha256: "b".repeat(64),
    reason: " El acto fue sustituido por una decisión posterior. ",
  };
  const reviewCanonical = canonicalOperationTerminationReviewPayload(
    "termination/a",
    review,
  );
  const cancelCanonical = canonicalOperationTerminationCancellationPayload(
    "termination/a",
    cancellation,
  );
  await expect(
    computeOperationTerminationReviewSha256("termination/a", review),
  ).resolves.toBe(createHash("sha256").update(reviewCanonical).digest("hex"));
  await expect(
    computeOperationTerminationCancellationSha256(
      "termination/a",
      cancellation,
    ),
  ).resolves.toBe(createHash("sha256").update(cancelCanonical).digest("hex"));
});

test("usa sólo endpoints Nest y nunca envía tenant desde presentación", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return successful({ request: null, dossier: null, noOp: false });
  };
  try {
    const payloadSha256 =
      await computeOperationTerminationPayloadSha256(request);
    await getOperationTermination();
    await requestOperationTermination({ ...request, payloadSha256 });
    await reviewOperationTermination("termination/a", {
      clientReviewId: "6ba7b810-9dad-41d1-80b4-00c04fd430c8",
      expectedPayloadSha256: payloadSha256,
      decision: "APPROVE",
      reviewPayloadSha256: "c".repeat(64),
    });
    await cancelOperationTermination("termination/a", {
      clientCancellationId: "6ba7b811-9dad-41d1-80b4-00c04fd430c8",
      expectedPayloadSha256: payloadSha256,
      cancellationPayloadSha256: "d".repeat(64),
      reason: "El acto debe reemplazarse por una referencia más reciente.",
    });

    expect(calls.map(({ url }) => url)).toEqual([
      "/api/operation-profile/termination",
      "/api/operation-profile/termination",
      "/api/operation-profile/termination/termination%2Fa/review",
      "/api/operation-profile/termination/termination%2Fa/cancel",
    ]);
    expect(calls.slice(1).every(({ init }) => init?.method === "POST")).toBe(
      true,
    );
    for (const call of calls.slice(1)) {
      expect(JSON.parse(String(call.init?.body))).not.toHaveProperty(
        "tenantId",
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
