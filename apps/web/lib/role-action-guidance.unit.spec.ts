import { expect, test } from "@playwright/test";
import {
  getActivationStepGuidance,
  getHandoverActionGuidance,
} from "./role-action-guidance";

test("un gerente no recibe una acción territorial que solo puede ejecutar Administración", () => {
  expect(
    getActivationStepGuidance("TERRITORY_BASE", false, "CAMPAIGN_MANAGER"),
  ).toEqual({
    linkLabel: null,
    advice: "Solicita a Administración que cargue la base territorial.",
  });
  expect(
    getActivationStepGuidance("TERRITORY_BASE", false, "ADMIN"),
  ).toEqual({ linkLabel: "Configurar", advice: null });
});

test("cumplimiento y auditoría reciben acciones de cierre acordes con Nest", () => {
  expect(
    getHandoverActionGuidance("FINANCE_NOT_CLOSED", "COMPLIANCE_OFFICER"),
  ).toEqual({ linkLabel: "Resolver", advice: null });
  expect(
    getHandoverActionGuidance("FINANCE_NOT_CLOSED", "AUDITOR"),
  ).toMatchObject({ linkLabel: null });
  expect(
    getHandoverActionGuidance("NO_ACTIVE_PRIVACY_NOTICE", "AUDITOR"),
  ).toEqual({
    linkLabel: null,
    advice:
      "Solicita a Administración que active el aviso; Cumplimiento puede verificarlo, pero no reemplazarlo.",
  });
});

test("la evidencia sin mutación directa se presenta como revisión y los códigos nuevos fallan cerrados", () => {
  expect(
    getHandoverActionGuidance("E14_REJECTED_EVIDENCE", "AUDITOR"),
  ).toEqual({ linkLabel: "Revisar", advice: null });
  expect(getHandoverActionGuidance("FUTURE_ACTION", "ADMIN")).toMatchObject({
    linkLabel: null,
  });
  expect(
    getActivationStepGuidance("FUTURE_STEP", false, "ADMIN"),
  ).toMatchObject({ linkLabel: null });
});
