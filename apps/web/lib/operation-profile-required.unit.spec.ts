import { expect, test } from "@playwright/test";
import { ApiError } from "./api-client";
import { isOperationProfileRequired } from "./operation-profile-required";

test("reconoce los contratos actuales de perfil pendiente", () => {
  expect(isOperationProfileRequired(new ApiError("Perfil pendiente", 409, { code: "OPERATION_STAGE_NOT_CONFIGURED" }))).toBe(true);
  expect(isOperationProfileRequired(new ApiError("Configure el perfil de operacion antes de usar logistica electoral", 409))).toBe(true);
  expect(isOperationProfileRequired(new ApiError("Configura o adopta el perfil electoral antes de planificar testigos", 409))).toBe(true);
});

test("no convierte errores de permiso, red u otros conflictos en alistamiento pendiente", () => {
  for (const status of [0, 401, 403, 500, 503]) {
    expect(isOperationProfileRequired(new ApiError("Perfil pendiente", status, { code: "OPERATION_STAGE_NOT_CONFIGURED" }))).toBe(false);
  }
  expect(isOperationProfileRequired(new ApiError("No se puede despachar en esta etapa", 409, { code: "INVENTORY_STAGE_BLOCKED" }))).toBe(false);
  expect(isOperationProfileRequired(new Error("Configure el perfil de operacion antes de usar logistica electoral"))).toBe(false);
});
