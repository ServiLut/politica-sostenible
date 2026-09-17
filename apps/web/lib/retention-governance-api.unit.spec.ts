import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  canonicalRetentionDispositionCancellationPayload,
  canonicalRetentionDispositionPayload,
  canonicalRetentionDispositionReviewPayload,
  canonicalRetentionLegalHoldPayload,
  canonicalRetentionLegalHoldRevocationPayload,
  computeRetentionDispositionCancellationSha256,
  computeRetentionDispositionPayloadSha256,
  computeRetentionDispositionReviewSha256,
  computeRetentionLegalHoldPayloadSha256,
  computeRetentionLegalHoldRevocationSha256,
} from "./retention-governance-api";

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const HASH = "a".repeat(64);

test("canonical disposition hash includes the preview, profile and three blockers", async () => {
  const input = {
    clientRequestId: "11111111-1111-4111-8111-111111111111",
    expectedPreviewSha256: HASH,
    expectedProfileUpdatedAt: "2026-07-15T12:00:00Z",
    scope: "DATA_SUBJECT_RECORDS" as const,
    cutoffAt: "2026-09-09T15:00:00Z",
    justification: `  ${"Justificación ".repeat(10)}  `,
    legalReference: "  Política jurídica 2026-01  ",
    evidenceReference: "  https://evidence.example.test/retention/1  ",
    evidenceSha256: HASH.toUpperCase(),
    legalPolicyRequiredAcknowledged: true as const,
    backupRestoreRequiredAcknowledged: true as const,
    executorUnavailableAcknowledged: true as const,
  };
  const canonical = canonicalRetentionDispositionPayload(input);

  expect(JSON.parse(canonical)).toMatchObject({
    expectedPreviewSha256: HASH,
    expectedProfileUpdatedAt: "2026-07-15T12:00:00.000Z",
    cutoffAt: "2026-09-09T15:00:00.000Z",
    evidenceSha256: HASH,
    legalPolicyRequiredAcknowledged: true,
    backupRestoreRequiredAcknowledged: true,
    executorUnavailableAcknowledged: true,
  });
  await expect(computeRetentionDispositionPayloadSha256(input)).resolves.toBe(
    sha256(canonical),
  );
});

test("canonical review distinguishes approval-not-executed from rejection", async () => {
  const approval = {
    clientReviewId: "22222222-2222-4222-8222-222222222222",
    expectedPayloadSha256: HASH,
    decision: "APPROVE" as const,
    approvedNotExecutedAcknowledged: true as const,
  };
  const rejection = {
    clientReviewId: "33333333-3333-4333-8333-333333333333",
    expectedPayloadSha256: HASH,
    decision: "REJECT" as const,
    rejectionReason: "  La referencia no acredita el alcance.  ",
  };

  const approvalCanonical = canonicalRetentionDispositionReviewPayload(
    "request-1",
    approval,
  );
  const rejectionCanonical = canonicalRetentionDispositionReviewPayload(
    "request-1",
    rejection,
  );
  expect(JSON.parse(approvalCanonical)).toMatchObject({
    approvedNotExecutedAcknowledged: true,
    rejectionReason: null,
  });
  expect(JSON.parse(rejectionCanonical)).toMatchObject({
    approvedNotExecutedAcknowledged: false,
    rejectionReason: "La referencia no acredita el alcance.",
  });
  await expect(
    computeRetentionDispositionReviewSha256("request-1", approval),
  ).resolves.toBe(sha256(approvalCanonical));
});

test("canonical cancellation and legal-hold receipts are deterministic", async () => {
  const cancellation = {
    clientCancellationId: "44444444-4444-4444-8444-444444444444",
    expectedPayloadSha256: HASH,
    reason: "  Debe corregirse la referencia jurídica.  ",
  };
  const hold = {
    clientRequestId: "55555555-5555-4555-8555-555555555555",
    scope: "ALL_TENANT_RECORDS" as const,
    reason: "  Existe una orden administrativa vigente que exige preservar.  ",
    legalAuthority: "  Oficina jurídica  ",
    legalReference: "  Actuación 2026-55  ",
    evidenceReference: "  https://evidence.example.test/hold/55  ",
    evidenceSha256: HASH,
    effectiveAt: "2026-09-09T15:00:00Z",
  };
  const revocation = {
    clientRequestId: "66666666-6666-4666-8666-666666666666",
    expectedHoldPayloadSha256: HASH,
    reason: "  La autoridad certificó el levantamiento de la medida.  ",
    legalAuthority: "  Oficina jurídica  ",
    legalReference: "  Acta 2026-66  ",
    evidenceReference: "  https://evidence.example.test/hold/66  ",
    evidenceSha256: HASH,
  };

  const cancellationCanonical =
    canonicalRetentionDispositionCancellationPayload(
      "request-1",
      cancellation,
    );
  const holdCanonical = canonicalRetentionLegalHoldPayload(hold);
  const revocationCanonical = canonicalRetentionLegalHoldRevocationPayload(
    "hold-1",
    revocation,
  );
  await expect(
    computeRetentionDispositionCancellationSha256(
      "request-1",
      cancellation,
    ),
  ).resolves.toBe(sha256(cancellationCanonical));
  await expect(computeRetentionLegalHoldPayloadSha256(hold)).resolves.toBe(
    sha256(holdCanonical),
  );
  await expect(
    computeRetentionLegalHoldRevocationSha256("hold-1", revocation),
  ).resolves.toBe(sha256(revocationCanonical));
});
