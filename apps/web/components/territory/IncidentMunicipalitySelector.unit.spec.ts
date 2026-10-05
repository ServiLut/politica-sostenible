import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as municipalities from "../../lib/incident-municipalities";
import { startDebouncedRequest } from "../ui/debounced-request";

type Node = { type?: string; props?: Record<string, unknown> & { children?: unknown } };
const filename = resolve(process.cwd(), "apps/web/components/territory/IncidentMunicipalitySelector.tsx");
const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const chosen: municipalities.IncidentMunicipality = {
  id: "municipio-26", name: "ARMENIA", code: "05/059",
  parent: { id: "department-05", name: "ANTIOQUIA", code: "05" },
};
function text(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return text((node as Node).props?.children);
}
function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object") return [];
  return [node as Node, ...nodes((node as Node).props?.children)];
}

// Run the real component and its event/effect callbacks. Only React's host and
// HTTP transport are substituted; query reducer and cancellation are real.
function harness(initial: municipalities.IncidentMunicipality | null = null) {
  const state: unknown[] = [];
  const effects: Array<{ deps: unknown[]; cleanup?: () => void }> = [];
  let cursor = 0;
  let effectCursor = 0;
  let pendingEffects: Array<() => void> = [];
  let tree: unknown;
  let value = initial;
  let disabled = false;
  const calls: Array<{ search: string; page: number; signal: AbortSignal; resolve: (page: municipalities.IncidentMunicipalityPage) => void; reject: (reason: Error) => void }> = [];
  const useState = (initialValue: unknown) => {
    const index = cursor++;
    if (!(index in state)) state[index] = typeof initialValue === "function" ? initialValue() : initialValue;
    return [state[index], (next: unknown) => { state[index] = typeof next === "function" ? next(state[index]) : next; }];
  };
  const nativeRequire = createRequire(filename);
  const componentModule = { exports: {} as { IncidentMunicipalitySelector: (props: unknown) => unknown } };
  runInNewContext(`(function(require,module,exports){${compiled}\n})`)((id: string) => {
    if (id === "react") return {
      useState,
      useReducer: (reducer: (state: unknown, action: unknown) => unknown, initialValue: unknown) => {
        const [current, set] = useState(initialValue);
        return [current, (action: unknown) => (set as (updater: unknown) => void)((old: unknown) => reducer(old, action))];
      },
      useRef: () => useState({ current: { focus: () => {} } })[0],
      useId: () => "municipality-test",
      useEffect: (callback: () => (() => void) | undefined, deps: unknown[]) => {
        const index = effectCursor++;
        const previous = effects[index];
        if (previous && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) return;
        pendingEffects.push(() => {
          previous?.cleanup?.();
          effects[index] = { deps, cleanup: callback() };
        });
      },
    };
    if (id === "../../lib/incident-municipalities") return {
      ...municipalities,
      listIncidentMunicipalities: (search: string, page: number, signal: AbortSignal) =>
        new Promise<municipalities.IncidentMunicipalityPage>((resolve, reject) => calls.push({ search, page, signal, resolve, reject })),
    };
    if (id === "../ui/debounced-request") return {
      startDebouncedRequest: (...args: Parameters<typeof startDebouncedRequest>) => startDebouncedRequest(args[0], args[1], args[2], 0),
    };
    return nativeRequire(id);
  }, componentModule, componentModule.exports);
  function render() {
    cursor = 0; effectCursor = 0; pendingEffects = [];
    tree = componentModule.exports.IncidentMunicipalitySelector({ value, onChange: (next: municipalities.IncidentMunicipality | null) => { value = next; }, disabled, ariaLabel: "Municipio del incidente" });
    pendingEffects.forEach(run => run());
  }
  function find(predicate: (node: Node) => boolean) {
    const found = nodes(tree).find(predicate);
    if (!found) throw new Error("Control esperado ausente");
    return found.props!;
  }
  async function flush() { await new Promise(resolve => setTimeout(resolve, 5)); render(); }
  render();
  return {
    calls, render, flush, get value() { return value; }, get htmlText() { return text(tree); },
    trigger: () => find(node => node.props?.["aria-label"] === "Municipio del incidente"),
    button: (label: string) => find(node => node.type === "button" && text(node) === label),
    search: () => find(node => node.type === "input"),
    root: () => (tree as Node).props!,
    setDisabled(next: boolean) { disabled = next; render(); },
    close() { effects.forEach(effect => effect.cleanup?.()); },
  };
}
const page = (items: municipalities.IncidentMunicipality[], current = 1) => ({ items, pagination: { page: current, limit: 25, total: 26, totalPages: 2 } });
function click(props: Record<string, unknown>) { (props.onClick as () => void)(); }

test("cerrado no solicita catálogo, pagina al abrir y conserva elección fuera de resultados", async () => {
  const h = harness();
  try {
    await h.flush(); expect(h.calls).toHaveLength(0);
    click(h.trigger()); h.render(); await h.flush();
    expect(h.calls[0]).toMatchObject({ page: 1, search: "" });
    h.calls[0].resolve(page([])); await h.flush();
    click(h.button("Municipios siguientes")); h.render(); await h.flush();
    expect(h.calls[1].page).toBe(2);
    h.calls[1].resolve(page([chosen], 2)); await h.flush();
    click(h.button("ARMENIA · ANTIOQUIA · 05/059")); h.render();
    expect(h.value).toEqual(chosen);
    expect(text({ props: h.trigger() })).toContain("ARMENIA · ANTIOQUIA · 05/059");
    click(h.trigger()); h.render(); await h.flush();
    (h.search().onChange as (event: unknown) => void)({ target: { value: "Medellín" } }); h.render(); await h.flush();
    expect(h.calls.at(-1)).toMatchObject({ page: 1, search: "Medellín" });
    h.calls.at(-1)!.resolve({ items: [{ id: "medellin", name: "MEDELLÍN" }], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } }); await h.flush();
    expect(h.htmlText).toContain("Página 1 de 1 · 1 municipio");
    expect(h.htmlText).not.toContain("1 municipios");
    expect(h.value?.id).toBe(chosen.id);
    expect(text({ props: h.trigger() })).toContain("ANTIOQUIA");
  } finally { h.close(); }
});

test("error y reintento conservan municipio; un resultado obsoleto o deshabilitado no lo sustituye", async () => {
  const h = harness(chosen);
  try {
    click(h.trigger()); h.render(); await h.flush();
    const stale = h.calls[0];
    (h.search().onChange as (event: unknown) => void)({ target: { value: "Bello" } }); h.render(); await h.flush();
    expect(stale.signal.aborted).toBe(true);
    h.calls[1].reject(new Error("HTTP503")); await h.flush();
    expect(h.htmlText).toContain("La selección se conserva");
    expect(h.value).toEqual(chosen);
    stale.resolve(page([{ id: "old", name: "Respuesta obsoleta" }])); await h.flush();
    expect(h.htmlText).not.toContain("Respuesta obsoleta");
    click(h.button("Reintentar municipios")); h.render(); await h.flush();
    expect(h.calls[2]).toMatchObject({ search: "Bello", page: 1 });
    h.setDisabled(true);
    expect(h.calls[2].signal.aborted).toBe(true);
    expect(h.trigger().disabled).toBe(true);
    expect(h.trigger()["aria-expanded"]).toBe(false);
    h.calls[2].resolve(page([])); await h.flush();
    expect(h.value).toEqual(chosen);
  } finally { h.close(); }
});

test("Enter en búsqueda no envía el formulario y Escape cierra sólo el selector; quitar vínculo es explícito", async () => {
  const h = harness(chosen);
  try {
    click(h.trigger()); h.render(); await h.flush();
    let prevented = 0; let stopped = 0;
    (h.search().onKeyDown as (event: unknown) => void)({ key: "Enter", nativeEvent: { isComposing: false }, preventDefault: () => prevented++, stopPropagation: () => stopped++ });
    expect([prevented, stopped]).toEqual([1, 1]);
    (h.root().onKeyDown as (event: unknown) => void)({ key: "Escape", preventDefault: () => prevented++, stopPropagation: () => stopped++ }); h.render();
    expect(h.trigger()["aria-expanded"]).toBe(false);
    expect(h.value).toEqual(chosen);
    expect([prevented, stopped]).toEqual([2, 2]);
    click(h.trigger()); h.render();
    click(h.button("Sin municipio vinculado")); h.render();
    expect(h.value).toBeNull();
  } finally { h.close(); }
});
