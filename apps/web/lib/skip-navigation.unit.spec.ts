import { expect, test } from "@playwright/test";
import {
  getSkipNavigationTarget,
  isDashboardPath,
} from "./skip-navigation";

test.describe("navegacion para saltar al contenido", () => {
  test("usa el contenido publico para rutas publicas y de autenticacion", () => {
    for (const pathname of [
      "/",
      "/iniciar-sesion",
      "/registro",
      "/aceptar-invitacion",
      "/privacidad",
    ]) {
      expect(isDashboardPath(pathname)).toBe(false);
      expect(getSkipNavigationTarget(pathname)).toBe("#main-content");
    }
  });

  test("usa el contenido del panel solo para el segmento dashboard", () => {
    for (const pathname of [
      "/dashboard",
      "/dashboard/profile",
      "/dashboard/votantes/nuevo",
    ]) {
      expect(isDashboardPath(pathname)).toBe(true);
      expect(getSkipNavigationTarget(pathname)).toBe("#dashboard-content");
    }

    expect(isDashboardPath("/dashboard-interno")).toBe(false);
  });
});
