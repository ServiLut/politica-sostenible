import { ApiError } from "./api-client";

// These are the two current API contracts for an absent operational profile.
// A permission, connection or unrelated conflict must keep its real error UI.
export function isOperationProfileRequired(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 409) return false;
  const payload = error.payload;
  return (
    (typeof payload === "object" && payload !== null && "code" in payload &&
      payload.code === "OPERATION_STAGE_NOT_CONFIGURED") ||
    error.message === "Configure el perfil de operacion antes de usar logistica electoral" ||
    error.message === "Configura o adopta el perfil electoral antes de planificar testigos"
  );
}
