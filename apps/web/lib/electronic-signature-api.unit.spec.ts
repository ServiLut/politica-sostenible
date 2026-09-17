import { expect, test } from "@playwright/test";
import {
  listSigningCandidates,
  signElectronicDocument,
  verifyElectronicSignature,
} from "./electronic-signature-api";

function successful(data: unknown) {
  return new Response(
    JSON.stringify({ statusCode: 200, message: "Success", data }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

test("lists bounded signing candidates without accepting tenant identity", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestInit = init;
    return successful({ items: [], limit: 100, truncated: false });
  };

  try {
    await listSigningCandidates("finance");
    expect(requestedUrl).toBe(
      "/api/electronic-signature/candidates?module=finance",
    );
    expect(requestedUrl).not.toContain("tenant");
    expect(requestInit?.cache).toBe("no-store");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("signs only the selected server candidate with a six-digit OTP", async () => {
  const originalFetch = globalThis.fetch;
  let requestInit: RequestInit | undefined;
  globalThis.fetch = async (_input, init) => {
    requestInit = init;
    return successful({
      id: "signature-a",
      module: "e14",
      resourceType: "WitnessReport",
      signedAt: "2026-09-09T12:00:00.000Z",
    });
  };

  try {
    await signElectronicDocument({
      documentId: "document-a",
      module: "e14",
      resourceId: "report-a",
      otpCode: "123456",
    });
    expect(requestInit?.method).toBe("POST");
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      documentId: "document-a",
      module: "e14",
      resourceId: "report-a",
      otpCode: "123456",
    });
    expect(JSON.parse(String(requestInit?.body))).not.toHaveProperty(
      "tenantId",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("verifies a signature against its exact module and linked resource", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestInit = init;
    return successful({
      id: "signature-a",
      valid: true,
      module: "finance",
      resourceType: "FinancialEntry",
      signedAt: "2026-09-09T12:00:00.000Z",
    });
  };

  try {
    await verifyElectronicSignature({
      id: "signature-a",
      module: "finance",
      resourceId: "finance-a",
    });
    expect(requestedUrl).toBe(
      "/api/electronic-signature/signature-a/verify?module=finance&resourceId=finance-a",
    );
    expect(requestedUrl).not.toContain("tenantId");
    expect(requestInit?.cache).toBe("no-store");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
