import { expect, test } from "@playwright/test";
import { ApiError } from "./api-client";
import {
  getBillingCapabilities,
  isBillingCapabilities,
} from "./billing-api";

function successful(data: unknown) {
  return new Response(
    JSON.stringify({ statusCode: 200, message: "Success", data }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

test("consulta el snapshot autenticado sin enviar tenant ni datos personales", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  let requestedUrl = "";
  let requestInit: RequestInit | undefined;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      sessionStorage: {
        getItem: (key: string) =>
          key === "politica-sostenible.auth-session"
            ? JSON.stringify({
                accessToken: "header.capabilities.signature",
                expiresAt: null,
                tenant: {
                  id: "tenant-session",
                  name: "Organización",
                  slug: "organizacion",
                  type: "CANDIDACY",
                },
                user: {
                  backendRole: "VOLUNTEER",
                  email: "volunteer@example.test",
                  id: "user-session",
                  name: "Voluntariado",
                  role: "Voluntario",
                },
              })
            : null,
      },
    },
  });

  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestInit = init;
    return successful({
      plan: { code: "STARTER", name: "Inicial" },
      features: { export: true, import: false, mfa: false },
    });
  };

  try {
    await expect(getBillingCapabilities()).resolves.toEqual({
      plan: { code: "STARTER", name: "Inicial" },
      features: { export: true, import: false, mfa: false },
    });
    expect(requestedUrl).toBe("/api/billing/capabilities");
    expect(requestInit?.method).toBe("GET");
    expect(requestInit?.body).toBeUndefined();
    expect(new Headers(requestInit?.headers).get("Authorization")).toBe(
      "Bearer header.capabilities.signature",
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});

test("falla cerrado si falta una capacidad o el contrato cambia", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    successful({
      plan: { code: "FREE", name: "Gratuito" },
      features: { export: false, import: false },
    });

  try {
    await expect(getBillingCapabilities()).rejects.toBeInstanceOf(ApiError);
  } finally {
    globalThis.fetch = originalFetch;
  }

  expect(
    isBillingCapabilities({
      plan: { code: "PROFESSIONAL", name: "Profesional" },
      features: { export: true, import: true, mfa: true },
    }),
  ).toBe(true);
  expect(
    isBillingCapabilities({
      plan: { code: "PROFESSIONAL", name: "Profesional" },
      features: { export: "yes", import: true, mfa: true },
    }),
  ).toBe(false);
  expect(
    isBillingCapabilities({
      plan: { code: "FREE", name: "Gratuito" },
      features: { export: false, import: false, mfa: false },
      tenantId: "tenant-should-never-be-exposed",
    }),
  ).toBe(false);
});
