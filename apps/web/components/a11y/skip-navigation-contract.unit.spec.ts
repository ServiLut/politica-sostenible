import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const repositoryRoot = resolve(__dirname, "../../../..");

function read(relativePath: string): string {
  return readFileSync(resolve(repositoryRoot, relativePath), "utf8");
}

test("todas las rutas publicas y de autenticacion exponen un destino enfocable", () => {
  const pages = [
    "apps/web/app/page.tsx",
    "apps/web/app/(auth)/iniciar-sesion/page.tsx",
    "apps/web/app/(auth)/olvide-mi-contrasena/page.tsx",
    "apps/web/app/(auth)/reiniciar-contrasena/page.tsx",
    "apps/web/app/aceptar-invitacion/page.tsx",
    "apps/web/app/privacidad/page.tsx",
    "apps/web/app/terminos/page.tsx",
    "apps/web/app/not-found.tsx",
  ];

  for (const page of pages) {
    const source = read(page);
    expect(source, page).toContain('id="main-content"');
    expect(source, page).toContain("tabIndex={-1}");
  }

  const registerPage = read("apps/web/app/(auth)/registro/page.tsx");
  // Loading/controlled access, successful creation and the open form are
  // mutually exclusive render branches; each preserves the skip destination.
  expect(registerPage.match(/id="main-content"/g)).toHaveLength(3);
  expect(registerPage.match(/tabIndex=\{-1\}/g)).toHaveLength(3);
});

test("dashboard conserva un solo skip-link global y destinos en todos sus estados", () => {
  const skipLink = read("apps/web/components/a11y/SkipNavLink.tsx");
  const dashboardLayout = read("apps/web/app/dashboard/layout.tsx");

  expect(skipLink).toContain("getSkipNavigationTarget(pathname)");
  expect(dashboardLayout).not.toContain('href="#dashboard-content"');
  expect(dashboardLayout).not.toContain("Saltar al contenido");
  expect(dashboardLayout.match(/id="dashboard-content"/g)).toHaveLength(4);
  expect(dashboardLayout.match(/tabIndex=\{-1\}/g)).toHaveLength(4);
});

test("la pantalla global de error mantiene el destino correcto por ruta", () => {
  const errorBoundary = read("apps/web/app/error.tsx");

  expect(errorBoundary).toContain("isDashboardPath(pathname)");
  expect(errorBoundary).toContain("DASHBOARD_CONTENT_ID");
  expect(errorBoundary).toContain("MAIN_CONTENT_ID");
  expect(errorBoundary).toContain("tabIndex={-1}");
});
