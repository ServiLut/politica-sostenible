import { expect, test } from "@playwright/test";
import {
  canonicalSignatureCommandPayload,
  computeSignatureCommandSha256,
} from "./signature-collection-api";

test("canonicaliza comandos de firmas sin depender del orden ni del hash recibido", async () => {
  const left = await computeSignatureCommandSha256("BATCH_CREATE", {
    code: "LOTE-01",
    clientRequestId: "123e4567-e89b-42d3-a456-426614174000",
    payloadSha256: "f".repeat(64),
  });
  const right = await computeSignatureCommandSha256("BATCH_CREATE", {
    clientRequestId: "123e4567-e89b-42d3-a456-426614174000",
    code: "LOTE-01",
  });
  expect(left).toBe(right);
  expect(left).toMatch(/^[a-f0-9]{64}$/);
});

test("liga cada mutacion al lote exacto", async () => {
  const command = {
    clientRequestId: "123e4567-e89b-42d3-a456-426614174000",
    expectedVersion: 1,
  };
  await expect(
    computeSignatureCommandSha256("BATCH_RETURN", {
      batchId: "batch-a",
      ...command,
    }),
  ).resolves.not.toBe(
    await computeSignatureCommandSha256("BATCH_RETURN", {
      batchId: "batch-b",
      ...command,
    }),
  );
});

test("el contrato canonico coincide con el backend", () => {
  expect(
    canonicalSignatureCommandPayload("PLAN_CREATE", {
      z: 1,
      nested: { z: true, a: false },
      a: 2,
    }),
  ).toBe(
    '{"a":2,"nested":{"a":false,"z":true},"type":"PLAN_CREATE","z":1}',
  );
});
