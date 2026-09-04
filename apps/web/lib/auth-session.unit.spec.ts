import { expect, test } from "@playwright/test";
import { createAuthSession } from "./auth-session";

const backendUser = {
  id: "member-a",
  email: "member@example.test",
  name: "Miembro",
  role: "VOLUNTEER" as const,
  tenant: {
    id: "tenant-a",
    name: "Campaña A",
    slug: "campana-a",
    type: "CANDIDACY" as const,
  },
};

test("preserva el cambio obligatorio y su vencimiento en la sesión", () => {
  const expiresAt = "2026-09-03T18:30:00.000Z";

  expect(
    createAuthSession("header.payload.signature", {
      ...backendUser,
      mustChangePassword: true,
      temporaryPasswordExpiresAt: expiresAt,
    }).user,
  ).toMatchObject({
    mustChangePassword: true,
    temporaryPasswordExpiresAt: expiresAt,
  });
});

test("rechaza una sesión temporal sin un vencimiento verificable", () => {
  expect(() =>
    createAuthSession("header.payload.signature", {
      ...backendUser,
      mustChangePassword: true,
      temporaryPasswordExpiresAt: null,
    }),
  ).toThrow("credencial temporal sin vencimiento válido");
});

test("normaliza cuentas ordinarias sin estado temporal", () => {
  expect(createAuthSession("header.payload.signature", backendUser).user).toMatchObject(
    {
      mustChangePassword: false,
      temporaryPasswordExpiresAt: null,
    },
  );
});
