import { expect, test } from "@playwright/test";
import { getConsentNoticePresentationKey } from "./consent-notices-api";

test("liga una confirmacion al id y la version exactos del aviso mostrado", () => {
  const firstKey = getConsentNoticePresentationKey({
    id: "notice-1",
    version: "campaign-2026-v1",
  });

  expect(firstKey).not.toBeNull();
  expect(
    getConsentNoticePresentationKey({
      id: "notice-2",
      version: "campaign-2026-v1",
    }),
  ).not.toBe(firstKey);
  expect(
    getConsentNoticePresentationKey({
      id: "notice-1",
      version: "campaign-2026-v2",
    }),
  ).not.toBe(firstKey);
});

test("no produce una clave aceptable cuando no hay aviso", () => {
  expect(getConsentNoticePresentationKey(null)).toBeNull();
  expect(getConsentNoticePresentationKey(undefined)).toBeNull();
});
