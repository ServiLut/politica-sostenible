import { expect, test } from "@playwright/test";
import {
  getRegistrationPolicy,
  loginWithCredentials,
  logoutAllSessions,
  registerAccount,
  updateOwnOrganization,
} from "./auth-api";

function successful(data: unknown) {
  return new Response(
    JSON.stringify({ statusCode: 200, message: "Success", data }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

test("envia el codigo MFA con el nombre que valida la API", async () => {
  const originalFetch = globalThis.fetch;
  let requestInit: RequestInit | undefined;

  globalThis.fetch = async (_input, init) => {
    requestInit = init;
    return successful({ requiresMfa: true });
  };

  try {
    await expect(
      loginWithCredentials({
        email: "mfa@example.test",
        password: "clave-segura-2026",
        totpCode: "123456",
      }),
    ).resolves.toEqual({ requiresMfa: true });

    expect(JSON.parse(String(requestInit?.body))).toEqual({
      email: "mfa@example.test",
      password: "clave-segura-2026",
      totpCode: "123456",
    });
    expect(JSON.parse(String(requestInit?.body))).not.toHaveProperty("code");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("envia ambas contraseñas en el contrato de registro", async () => {
  const originalFetch = globalThis.fetch;
  let requestInit: RequestInit | undefined;

  globalThis.fetch = async (_input, init) => {
    requestInit = init;
    return successful({
      message: "Cuenta creada",
      tenantId: "tenant-a",
      userId: "user-a",
    });
  };

  try {
    await registerAccount({
      email: "admin@example.test",
      password: "clave-segura-2026",
      passwordConfirmation: "clave-segura-2026",
      name: "Ana Perez",
      organizationName: "Concejo abierto",
      organizationType: "CANDIDACY",
      termsAccepted: true,
      termsVersion: "registro-2026.9",
    });

    expect(requestInit?.method).toBe("POST");
    expect(JSON.parse(String(requestInit?.body))).toMatchObject({
      password: "clave-segura-2026",
      passwordConfirmation: "clave-segura-2026",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("consulta la politica publica de registro sin JWT ni cache", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestInit: RequestInit | undefined;

  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestInit = init;
    return successful({
      enabled: false,
      invitationAcceptanceEnabled: true,
      mode: "CONTROLLED_ACCESS",
      message: "Registro controlado",
      termsVersion: "registro-2026.9",
    });
  };

  try {
    await expect(getRegistrationPolicy()).resolves.toEqual({
      enabled: false,
      invitationAcceptanceEnabled: true,
      mode: "CONTROLLED_ACCESS",
      message: "Registro controlado",
      termsVersion: "registro-2026.9",
    });
    expect(requestedUrl).toBe("/api/auth/registration-policy");
    expect(requestInit?.cache).toBe("no-store");
    expect(new Headers(requestInit?.headers).has("Authorization")).toBe(false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rechaza políticas que no identifican términos vigentes o son incoherentes", async () => {
  const originalFetch = globalThis.fetch;
  const invalidPolicies = [
    {
      enabled: true,
      invitationAcceptanceEnabled: true,
      mode: "SELF_SERVICE",
      message: "Registro habilitado",
    },
    {
      enabled: true,
      invitationAcceptanceEnabled: true,
      mode: "SELF_SERVICE",
      message: "Registro habilitado",
      termsVersion: " version-con-espacios ",
    },
    {
      enabled: true,
      invitationAcceptanceEnabled: true,
      mode: "CONTROLLED_ACCESS",
      message: "Registro habilitado",
      termsVersion: "registro-2026.9",
    },
    {
      enabled: true,
      invitationAcceptanceEnabled: "true",
      mode: "SELF_SERVICE",
      message: "Registro habilitado",
      termsVersion: "registro-2026.9",
    },
  ];

  try {
    for (const policy of invalidPolicies) {
      globalThis.fetch = async () => successful(policy);
      await expect(getRegistrationPolicy()).rejects.toThrow(
        "La política de registro recibida no contiene un contrato legal válido.",
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cierra todas las sesiones con el JWT vigente y keepalive", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const accessToken = "header.logout.signature";
  let requestedUrl = "";
  let requestInit: RequestInit | undefined;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      sessionStorage: {
        getItem: (key: string) =>
          key === "politica-sostenible.auth-session"
            ? JSON.stringify({
                accessToken,
                expiresAt: null,
                tenant: {
                  id: "tenant-logout",
                  name: "Campaña verificable",
                  slug: "campana-verificable",
                  type: "CANDIDACY",
                },
                user: {
                  backendRole: "ADMIN",
                  email: "logout@example.test",
                  id: "user-logout",
                  name: "Dirección",
                  role: "AdminCampana",
                },
              })
            : null,
      },
    },
  });
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestInit = init;
    return successful({ message: "Sesiones cerradas" });
  };

  try {
    await expect(logoutAllSessions()).resolves.toEqual({
      message: "Sesiones cerradas",
    });

    expect(requestedUrl).toBe("/api/auth/logout");
    expect(requestInit?.method).toBe("POST");
    expect(requestInit?.keepalive).toBe(true);
    expect(new Headers(requestInit?.headers).get("Authorization")).toBe(
      `Bearer ${accessToken}`,
    );
    expect(requestInit?.body).toBeUndefined();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});

test("actualiza la organizacion propia sin aceptar un tenant del cliente", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestInit: RequestInit | undefined;

  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestInit = init;
    return successful({
      tenant: {
        id: "tenant-authenticated",
        name: "Movimiento Regi\u00f3n Viva",
        slug: "movimiento-region-viva",
        type: "CANDIDACY",
      },
      changed: true,
    });
  };

  try {
    await expect(
      updateOwnOrganization({
        name: "Movimiento Regi\u00f3n Viva",
        expectedName: "Organizaci\u00f3n anterior",
      }),
    ).resolves.toEqual({
      tenant: {
        id: "tenant-authenticated",
        name: "Movimiento Regi\u00f3n Viva",
        slug: "movimiento-region-viva",
        type: "CANDIDACY",
      },
      changed: true,
    });

    expect(requestedUrl).toBe("/api/auth/organization");
    expect(requestInit?.method).toBe("PATCH");
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      name: "Movimiento Regi\u00f3n Viva",
      expectedName: "Organizaci\u00f3n anterior",
    });
    expect(JSON.parse(String(requestInit?.body))).not.toHaveProperty(
      "tenantId",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
