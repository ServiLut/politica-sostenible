import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import { expect, test } from "@playwright/test";
import ts from "typescript";
import { ApiError } from "../../lib/api-client";
import type { PlanCapabilityView } from "../../lib/plan-capabilities";

const code = ts.transpileModule(
  readFileSync(resolve(__dirname, "ExportButton.tsx"), "utf8"),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText;

// Execute the real component and its event handlers; only hook storage, the
// capability snapshot and the network/download boundary are provided by the test.
function harness(
  capability: Omit<PlanCapabilityView, "planName">,
  exportCsv: (module: string) => Promise<void> = async () => undefined,
) {
  const values: unknown[] = [];
  let cursor = 0;
  let refreshCalls = 0;
  const exports: { ExportButton?: unknown } = {};
  runInNewContext(code, {
    exports,
    Error,
    require: (name: string) => {
      switch (name) {
        case "react/jsx-runtime": return jsxRuntime;
        case "lucide-react": return icons;
        case "react": return {
          useId: () => "export-plan-reason",
          useState: (initial: unknown) => {
            const index = cursor++;
            if (values.length <= index) values.push(initial);
            return [values[index], (value: unknown) => { values[index] = value; }];
          },
        };
        case "@/context/auth": return {
          usePlanCapability: (feature: string) => {
            expect(feature).toBe("export");
            return { planName: null, ...capability, refresh: () => { refreshCalls += 1; } };
          },
        };
        case "@/lib/api-client": return { ApiError };
        case "@/lib/export-api": return { exportModuleAsCsv: exportCsv };
        default: throw new Error(`Unexpected import: ${name}`);
      }
    },
  });
  const component = exports.ExportButton as
    (props: { moduleName: string }) => ReactElement<{ children: ReactNode }>;
  function render() {
    cursor = 0;
    const tree = component({ moduleName: "events" });
    const button = Children.toArray(tree.props.children).find(
      (child) => isValidElement(child) && child.type === "button",
    ) as ReactElement<{ onClick: () => Promise<void>; disabled: boolean }>;
    return { tree, button, html: renderToStaticMarkup(tree) };
  }
  return { render, refreshCalls: () => refreshCalls };
}

test("el control y el motivo forman un único grupo con etiqueta y contraste propio", async () => {
  let downloads = 0;
  const model = harness({ status: "unavailable", enabled: false, reason: "Tu plan no incluye exportaciones." }, async () => { downloads += 1; });
  const view = model.render();
  expect(view.tree.type).toBe("div");
  expect(view.html).toContain('role="group"');
  expect(view.html).toContain("Tu plan no incluye exportaciones.");
  expect(view.html).toContain('aria-describedby="export-plan-reason"');
  expect(view.html).toMatch(/<p[^>]*bg-slate-50[^>]*text-slate-700/);
  expect(view.button.props.disabled).toBe(true);
  await view.button.props.onClick();
  expect(downloads).toBe(0);
});

test("la consulta del plan no apunta a una descripción todavía ausente", () => {
  const model = harness({ status: "checking", enabled: false, reason: "Consultando plan" });
  const view = model.render();
  expect(view.button.props.disabled).toBe(true);
  expect(view.html).toContain("Validando plan…");
  expect(view.html).not.toContain("aria-describedby=");
  expect(view.html).toContain('aria-busy="true"');
});

test("la exportación habilitada sin aviso no reclama una fila completa del encabezado", () => {
  const model = harness({ status: "available", enabled: true, reason: null });
  const view = model.render();
  const groupClass = (view.tree.props as { className?: string }).className ?? "";
  expect(groupClass.split(/\s+/)).toContain("w-auto");
  expect(groupClass.split(/\s+/)).not.toContain("w-full");
  expect(view.button.props.disabled).toBe(false);
});

test("fallo del plan conserva razón legible y un reintento real", () => {
  const model = harness({ status: "error", enabled: false, reason: "No pudimos validar tu plan." });
  const view = model.render();
  expect(view.html).toContain("No pudimos validar tu plan.");
  expect(view.html).toMatch(/<p[^>]*bg-red-50[^>]*text-red-900[^>]*role="alert"/);
  const reason = Children.toArray(view.tree.props.children).find(
    (child) => isValidElement(child) && child.type === "p",
  ) as ReactElement<{ children: ReactNode }>;
  const retry = Children.toArray(reason.props.children).find(
    (child) => isValidElement(child) && child.type === "button",
  ) as ReactElement<{ onClick: () => void }>;
  retry.props.onClick();
  expect(model.refreshCalls()).toBe(1);
});

test("403 al exportar revalida el plan y conserva el error junto al botón", async () => {
  const calls: string[] = [];
  const response = Promise.withResolvers<void>();
  const model = harness({ status: "available", enabled: true, reason: null }, async (module) => {
    calls.push(module);
    return response.promise;
  });
  const pending = model.render().button.props.onClick();
  expect(model.render().button.props.disabled).toBe(true);
  response.reject(new ApiError("La exportación ya no está autorizada.", 403));
  await pending;
  const view = model.render();
  expect(calls).toEqual(["events"]);
  expect(model.refreshCalls()).toBe(1);
  expect(view.html).toContain("La exportación ya no está autorizada.");
  expect(view.html).toContain('aria-describedby="export-plan-reason-export-error"');
  expect(view.html).toContain('role="alert"');
});

test("un reintento exitoso libera la carga y elimina sólo el error de exportación", async () => {
  let attempts = 0;
  const model = harness({ status: "available", enabled: true, reason: null }, async () => {
    if (attempts++ === 0) throw new Error("Descarga interrumpida");
  });
  await model.render().button.props.onClick();
  expect(model.render().html).toContain("Descarga interrumpida");
  await model.render().button.props.onClick();
  expect(attempts).toBe(2);
  expect(model.render().button.props.disabled).toBe(false);
  expect(model.render().html).not.toContain("Descarga interrumpida");
  expect(model.refreshCalls()).toBe(0);
});
