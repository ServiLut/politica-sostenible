import { expect, test } from "@playwright/test";
import { setupMfa } from "./mfa-api";

test("reautentica el enrolamiento MFA sin enviar identidad elegida por el cliente", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestInit: RequestInit | undefined;

  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestInit = init;
    return new Response(
      JSON.stringify({
        statusCode: 200,
        message: "Success",
        data: { qrCodeDataUrl: "data:image/png;base64,qr", secret: "secret" },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    await setupMfa("current-password");

    expect(requestedUrl).toBe("/api/auth/mfa/setup");
    expect(requestInit?.method).toBe("POST");
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      currentPassword: "current-password",
    });
    expect(JSON.parse(String(requestInit?.body))).not.toHaveProperty(
      "tenantId",
    );
    expect(JSON.parse(String(requestInit?.body))).not.toHaveProperty("userId");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
