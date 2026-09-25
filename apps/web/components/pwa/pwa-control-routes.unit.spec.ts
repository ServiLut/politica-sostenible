import { expect, test } from "@playwright/test";
import { showsPwaWorkspaceControls } from "./pwa-control-routes";

test("conserva la recuperación offline sin sesión en el lanzador y los controles de trabajo", () => {
  for (const route of [
    "/aplicacion",
    "/dashboard",
    "/dashboard/captura-territorial",
    "/dashboard/profile",
  ]) {
    expect(showsPwaWorkspaceControls(route), route).toBe(true);
  }
});

test("los controles flotantes no cubren registro, acceso, invitaciones ni páginas públicas", () => {
  for (const route of [
    null,
    "/",
    "/registro",
    "/iniciar-sesion",
    "/aceptar-invitacion",
    "/olvide-mi-contrasena",
    "/reiniciar-contrasena",
    "/privacidad",
    "/terminos",
    "/dashboard-falso",
  ]) {
    expect(showsPwaWorkspaceControls(route), route ?? "sin ruta").toBe(false);
  }
});
