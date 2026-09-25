import { expect, test } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Playwright's TSX loader emits browser-component descriptors. Compile the
// actual component with React's JSX runtime to exercise its server-rendered HTML.
const filename = resolve(process.cwd(), "apps/web/components/ui/UserCombobox.tsx");
const output = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const componentModule = { exports: {} as { UserCombobox: typeof import("./UserCombobox").UserCombobox } };
runInNewContext(`(function(require, module, exports) { ${output}\n})`)(createRequire(filename), componentModule, componentModule.exports);
const { UserCombobox } = componentModule.exports;

const neverFetch = async () => { throw new Error("Un selector cerrado no debe consultar usuarios"); };

test("muestra el nombre del responsable existente sin esperar abrir una búsqueda", () => {
  const html = renderToStaticMarkup(createElement(UserCombobox, {
    value: "responsable-fuera-de-primera-pagina",
    selectedLabel: "Responsable territorial existente",
    allowUnassigned: false,
    onChange: () => {}, fetchItems: neverFetch,
  }));
  expect(html).toContain("Responsable territorial existente");
  expect(html).not.toContain("Por asignar");
  expect(html).not.toContain("responsable-fuera-de-primera-pagina");
});

test("el responsable obligatorio solicita selección y la asignación opcional conserva su estado vacío", () => {
  const common = { value: "", onChange: () => {}, fetchItems: neverFetch };
  expect(renderToStaticMarkup(createElement(UserCombobox, { ...common, allowUnassigned: false }))).toContain("Selecciona un responsable");
  expect(renderToStaticMarkup(createElement(UserCombobox, common))).toContain("Por asignar");
});

test("el selector bloqueado conserva el nombre accesible y deshabilita el control", () => {
  const html = renderToStaticMarkup(createElement(UserCombobox, {
    value: "responsable-final", selectedLabel: "Responsable final",
    ariaLabel: "Responsable de la propuesta finalizada", disabled: true,
    onChange: () => {}, fetchItems: neverFetch,
  }));
  expect(html).toContain('aria-label="Responsable de la propuesta finalizada"');
  expect(html).toContain('disabled=""');
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain("Responsable final");
});
