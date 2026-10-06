import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "@playwright/test";
import ts from "typescript";
import { getActivationStepGuidance } from "@/lib/role-action-guidance";
import type { ActivationBriefing, ActivationChecklistProps } from "./ActivationChecklist";

function renderChecklist(briefing: ActivationBriefing, role: string) {
  const filename = resolve(__dirname, "ActivationChecklist.tsx");
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const componentModule = {
    exports: {} as {
      ActivationChecklist: (props: ActivationChecklistProps) => React.ReactNode;
    },
  };
  const realRequire = createRequire(filename);
  const scopedRequire = (name: string) => {
    if (name === "@/context/auth") {
      return { useAuth: () => ({ user: { backendRole: role } }) };
    }
    if (name === "@/lib/role-action-guidance") {
      return { getActivationStepGuidance };
    }
    return realRequire(name);
  };
  runInNewContext(`(function(require, module, exports) { ${output}\n})`)(
    scopedRequire,
    componentModule,
    componentModule.exports,
  );
  return renderToStaticMarkup(
    createElement(componentModule.exports.ActivationChecklist, { briefing }),
  );
}

const briefing: ActivationBriefing = {
  tenant: { mode: "CAMPAIGN" },
  activation: {
    ready: false,
    completedSteps: 1,
    totalSteps: 2,
    steps: [
      {
        code: "TEAM_READY",
        title: "Equipo configurado",
        detail: "Responsables asignados.",
        href: "/dashboard/team",
        complete: true,
      },
      {
        code: "TERRITORY_BASE",
        title: "Base territorial pendiente",
        detail: "Carga la base de la organización.",
        href: "/dashboard/territory",
        complete: false,
      },
    ],
  },
};

test("los pendientes aparecen primero y los pasos completos siguen consultables sin duplicarse", () => {
  const html = renderChecklist(briefing, "ADMIN");
  expect(html.indexOf("Base territorial pendiente")).toBeLessThan(
    html.indexOf("Ver pasos completados"),
  );
  expect(html.match(/Equipo configurado/g)).toHaveLength(1);
  expect(html).toMatch(/<details[^>]*>.*Equipo configurado.*<\/details>/);
  expect(html).toContain('href="/dashboard/territory"');
  expect(html).toContain('href="/dashboard/team"');
  expect(html).toContain('aria-valuenow="50"');
});

test("agrupar la guía no concede un enlace de configuración a Gerencia", () => {
  const html = renderChecklist(briefing, "CAMPAIGN_MANAGER");
  expect(html).toContain("Solicita a Administración que cargue la base territorial.");
  expect(html).not.toContain('href="/dashboard/territory"');
  expect(html).toContain("Base territorial pendiente");
});

test("una configuración completa conserva los pasos y no afirma certificación electoral", () => {
  const completed: ActivationBriefing = {
    ...briefing,
    activation: {
      ...briefing.activation,
      ready: true,
      completedSteps: 2,
      steps: briefing.activation.steps.map((step) => ({ ...step, complete: true })),
    },
  };
  const html = renderChecklist(completed, "ADMIN");
  expect(html).toContain("Configuración inicial completa");
  expect(html).toContain("alistamiento antes de cambiar de etapa");
  expect(html.match(/Equipo configurado/g)).toHaveLength(1);
  expect(html.match(/Base territorial pendiente/g)).toHaveLength(1);
  expect(html).toContain("Ver pasos completados (2)");
});
