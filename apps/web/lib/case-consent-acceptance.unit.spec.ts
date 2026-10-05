import { expect, test } from "@playwright/test";
import { getConsentNoticePresentationKey } from "./consent-notices-api";
import {
  getCaseConsentAcceptanceKey,
  hasCurrentCaseConsentAcceptance,
} from "./case-consent-acceptance";

const presentation = {
  caseId: "case-synthetic-1",
  reloadVersion: 2,
  notice: { id: "notice-synthetic-1", version: "QA-1" },
};

test("la clave aceptada por el checkbox habilita el mismo aviso al enviarlo", () => {
  const acceptedKey = getCaseConsentAcceptanceKey(presentation);
  expect(acceptedKey).not.toBeNull();
  expect(hasCurrentCaseConsentAcceptance({ ...presentation, accepted: true, acceptedKey })).toBe(true);
  expect(hasCurrentCaseConsentAcceptance({ ...presentation, accepted: false, acceptedKey })).toBe(false);
});

test("una clave de aviso sin caso y generación no sirve como autorización del formulario", () => {
  const bareNoticeKey = getConsentNoticePresentationKey(presentation.notice);
  expect(hasCurrentCaseConsentAcceptance({ ...presentation, accepted: true, acceptedKey: bareNoticeKey })).toBe(false);
});

for (const [name, next] of [
  ["otro caso", { ...presentation, caseId: "case-synthetic-2" }],
  ["recarga de la misma versión", { ...presentation, reloadVersion: 3 }],
  ["otra versión", { ...presentation, notice: { ...presentation.notice, version: "QA-2" } }],
  ["otro aviso con la misma versión", { ...presentation, notice: { ...presentation.notice, id: "notice-synthetic-2" } }],
  ["aviso eliminado", { ...presentation, notice: null }],
] as const) {
  test(`invalida la aceptación anterior cuando se presenta ${name}`, () => {
    expect(hasCurrentCaseConsentAcceptance({ ...next, accepted: true, acceptedKey: getCaseConsentAcceptanceKey(presentation) })).toBe(false);
  });
}

test("permite aceptar de nuevo la presentación vigente después de cambiar caso o recargar", () => {
  const next = { ...presentation, caseId: "case-synthetic-2", reloadVersion: 3 };
  expect(hasCurrentCaseConsentAcceptance({ ...next, accepted: true, acceptedKey: getCaseConsentAcceptanceKey(next) })).toBe(true);
  expect(hasCurrentCaseConsentAcceptance({ ...presentation, notice: null, accepted: true, acceptedKey: null })).toBe(false);
});
