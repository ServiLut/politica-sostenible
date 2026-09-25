import { expect, test } from "@playwright/test";
import {
  getLeaderWhatsAppHref,
  getPublicProfileHref,
} from "./territory-leader-contact";

test("normaliza el contacto de WhatsApp sin duplicar 57 ni adivinar números incompletos", () => {
  for (const phone of ["300 123 4567", "+57 300 123 4567", "573001234567"]) {
    expect(getLeaderWhatsAppHref(phone)).toBe("https://wa.me/573001234567");
  }
  expect(getLeaderWhatsAppHref("+1 (202) 555-0100")).toBe(
    "https://wa.me/12025550100",
  );
  for (const phone of [null, "", "1234567", "300ABC1234567", "+00 12345678"]) {
    expect(getLeaderWhatsAppHref(phone)).toBeNull();
  }
});

test("solo abre perfiles públicos HTTP o HTTPS sin credenciales embebidas", () => {
  expect(getPublicProfileHref("https://example.com/perfil")).toBe(
    "https://example.com/perfil",
  );
  for (const value of [
    null,
    "javascript:alert(1)",
    "data:text/html,hola",
    "//example.com",
    "https://user:password@example.com",
  ]) {
    expect(getPublicProfileHref(value)).toBeNull();
  }
});
