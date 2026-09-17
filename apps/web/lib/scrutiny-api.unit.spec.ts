import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  SCRUTINY_EVIDENCE_LABELS,
  canonicalScrutinyCommand,
  computeScrutinyCommandSha256,
} from "./scrutiny-api";

test("genera el mismo SHA canónico que Nest sin depender del orden de claves", async () => {
  const requestId = "6e927194-7a8f-4d4c-aabd-99b2ead3627d";
  const left = {
    decision: "APPROVE",
    documentId: "document-a",
    clientRequestId: requestId,
    payloadSha256: "0".repeat(64),
  };
  const right = {
    clientRequestId: requestId,
    payloadSha256: "f".repeat(64),
    documentId: "document-a",
    decision: "APPROVE",
  };
  const canonical = canonicalScrutinyCommand("DOCUMENT_REVIEW", left);
  const nodeDigest = createHash("sha256")
    .update(canonical, "utf8")
    .digest("hex");

  await expect(
    computeScrutinyCommandSha256("DOCUMENT_REVIEW", right),
  ).resolves.toBe(nodeDigest);
  expect(canonical).not.toContain("payloadSha256");
});

test("etiqueta lo interno explícitamente como no oficial", () => {
  expect(SCRUTINY_EVIDENCE_LABELS.INTERNAL).toBe("Interno · no oficial");
  expect(SCRUTINY_EVIDENCE_LABELS.OFFICIAL).toBe("Oficial documentado");
  expect(SCRUTINY_EVIDENCE_LABELS.INTERNAL).not.toBe(
    SCRUTINY_EVIDENCE_LABELS.OFFICIAL,
  );
});
