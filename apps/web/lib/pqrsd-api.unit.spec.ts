import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  PQRSD_DOCUMENT_TYPES,
  canonicalPqrsdCommand,
  computePqrsdCommandSha256,
} from "./pqrsd-api";

test.describe("PQRSD browser contract", () => {
  test("matches the Nest canonical SHA independent of key order", async () => {
    const first = {
      clientRequestId: "123e4567-e89b-42d3-a456-426614174000",
      decision: "APPROVE",
      responseId: "response-a",
      payloadSha256: "0".repeat(64),
      nested: { z: 2, a: 1 },
    };
    const second = {
      nested: { a: 1, z: 2 },
      responseId: "response-a",
      decision: "APPROVE",
      clientRequestId: "123e4567-e89b-42d3-a456-426614174000",
    };
    const canonical = canonicalPqrsdCommand("RESPONSE_REVIEW", first);

    await expect(
      computePqrsdCommandSha256("RESPONSE_REVIEW", second),
    ).resolves.toBe(
      createHash("sha256").update(canonical, "utf8").digest("hex"),
    );
    expect(canonical).not.toContain("payloadSha256");
  });

  test("binds route identity and operation type to the digest", async () => {
    const base = {
      clientRequestId: "123e4567-e89b-42d3-a456-426614174000",
      decision: "APPROVE",
      responseId: "response-a",
    };
    expect(await computePqrsdCommandSha256("RESPONSE_REVIEW", base)).not.toBe(
      await computePqrsdCommandSha256("RESPONSE_REVIEW", {
        ...base,
        responseId: "response-b",
      }),
    );
    expect(await computePqrsdCommandSha256("RESPONSE_REVIEW", base)).not.toBe(
      await computePqrsdCommandSha256("RESPONSE_AUTHORIZE", base),
    );
  });

  test("offers every controlled PQRSD evidence category", () => {
    expect(PQRSD_DOCUMENT_TYPES).toEqual(
      expect.arrayContaining([
        "RECEIPT_ACKNOWLEDGEMENT",
        "TRANSFER_PROOF",
        "EXTENSION_SUPPORT",
        "AUTHORIZATION_ARTIFACT",
        "DELIVERY_PROOF",
        "CLOSURE_SUPPORT",
        "REOPENING_SUPPORT",
      ]),
    );
  });

  test("keeps binaries out of Nest and does not preload universal legal/calendar defaults", () => {
    const page = readFileSync(
      resolve(process.cwd(), "apps/web/app/dashboard/pqrsd/page.tsx"),
      "utf8",
    );
    expect(page).toContain("uploadFileDirectlyWithClientDeclaredHash(");
    expect(page).not.toContain("multipart/form-data");
    expect(page).not.toContain("window.confirm");
    expect(page).not.toContain('name="weekdays" required defaultValue=');
    expect(page).not.toContain('name="durationDays" type="number" value=');
  });
});
