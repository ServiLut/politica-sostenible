import { expect, test } from "@playwright/test";
import {
  canonicalSignatureCountCorrectionPayload,
  computeSignatureCountCorrectionSha256,
} from "./signature-count-correction-api";

test("canonicaliza la correccion y excluye solamente el hash recibido", async () => {
  const left = {
    proposalId: "9a6691aa-5d3f-467a-9d10-b467adf7f1aa",
    clientRequestId: "123e4567-e89b-42d3-a456-426614174000",
    decision: "APPROVE",
    payloadSha256: "f".repeat(64),
  };
  const right = {
    decision: "APPROVE",
    clientRequestId: "123e4567-e89b-42d3-a456-426614174000",
    proposalId: "9a6691aa-5d3f-467a-9d10-b467adf7f1aa",
  };
  await expect(
    computeSignatureCountCorrectionSha256("DECIDE", left),
  ).resolves.toBe(
    await computeSignatureCountCorrectionSha256("DECIDE", right),
  );
});

test("liga criptograficamente propuesta y decision a la ruta exacta", async () => {
  const input = {
    clientRequestId: "123e4567-e89b-42d3-a456-426614174000",
    expectedVersion: 4,
  };
  expect(
    await computeSignatureCountCorrectionSha256("PROPOSE", {
      batchId: "batch-a",
      ...input,
    }),
  ).not.toBe(
    await computeSignatureCountCorrectionSha256("PROPOSE", {
      batchId: "batch-b",
      ...input,
    }),
  );
  expect(
    canonicalSignatureCountCorrectionPayload("DECIDE", {
      z: 1,
      nested: { z: true, a: false },
      a: 2,
    }),
  ).toBe('{"a":2,"nested":{"a":false,"z":true},"type":"DECIDE","z":1}');
});
