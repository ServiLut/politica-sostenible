import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { dialogTabDestination, moveDialogTabFocus } from "./use-accessible-dialog";

const webRoot = resolve(__dirname, "..");

test("Tab recorre los controles y contiene el foco en ambos extremos del diálogo", () => {
  expect(dialogTabDestination(3, 0, false)).toBeNull();
  expect(dialogTabDestination(3, 1, false)).toBeNull();
  expect(dialogTabDestination(3, 2, false)).toBe(0);
  expect(dialogTabDestination(3, 0, true)).toBe(2);
  expect(dialogTabDestination(3, 1, true)).toBeNull();
  expect(dialogTabDestination(3, -1, false)).toBe(0);
  expect(dialogTabDestination(3, -1, true)).toBe(2);
  expect(dialogTabDestination(0, -1, false)).toBe(-1);
  expect(dialogTabDestination(1, 0, false)).toBe(0);
  expect(dialogTabDestination(1, 0, true)).toBe(0);
});

test("el recorrido circular permite al navegador revelar el botón fuera del área visible", () => {
  const calls: unknown[] = [];
  const target = (name: string) => ({
    focus: (options?: FocusOptions) => calls.push({ target: name, options }),
  });
  const controls = [target("cerrar"), target("nombre"), target("crear borrador")];
  const container = target("dialogo");
  const event = (shiftKey: boolean) => ({
    shiftKey,
    preventDefault: () => calls.push("preventDefault"),
  });

  moveDialogTabFocus(controls, container, 0, event(true));
  expect(calls).toEqual(["preventDefault", { target: "crear borrador", options: undefined }]);
  calls.length = 0;
  moveDialogTabFocus(controls, container, 2, event(false));
  expect(calls).toEqual(["preventDefault", { target: "cerrar", options: undefined }]);
  calls.length = 0;
  moveDialogTabFocus(controls, container, 1, event(false));
  expect(calls).toEqual([]);
  moveDialogTabFocus([], container, -1, event(false));
  expect(calls).toEqual(["preventDefault", { target: "dialogo", options: undefined }]);
});

test("el diálogo compartido contiene foco, respeta stack y restaura el disparador", () => {
  const source = readFileSync(
    resolve(webRoot, "lib/use-accessible-dialog.ts"),
    "utf8",
  );

  expect(source).toContain("DIALOG_STACK.at(-1)?.token !== token");
  expect(source).toContain("remainingDialog.contains(previousFocus)");
  expect(source).toContain('event.key === "Escape"');
  expect(source).toContain('event.key !== "Tab"');
  expect(source).toContain("activeIndex <= 0");
  expect(source).toContain("previousFocus?.isConnected");
  expect(source).toContain('document.body.style.overflow = "hidden"');
});

test("las pantallas con modales propios usan el comportamiento accesible común", () => {
  const pages = [
    "app/dashboard/events/page.tsx",
    "app/dashboard/incidents/page.tsx",
    "app/dashboard/cases/page.tsx",
    "app/dashboard/tasks/page.tsx",
    "app/dashboard/communications/page.tsx",
    "app/dashboard/votantes/page.tsx",
    "app/dashboard/proposals/page.tsx",
    "app/dashboard/finance/page.tsx",
  ];

  for (const page of pages) {
    expect(readFileSync(resolve(webRoot, page), "utf8"), page).toContain(
      "useAccessibleDialog",
    );
  }
});

test("una confirmación destructiva no se descarta con Escape", () => {
  const proposals = readFileSync(
    resolve(webRoot, "app/dashboard/proposals/page.tsx"),
    "utf8",
  );
  const voters = readFileSync(
    resolve(webRoot, "app/dashboard/votantes/page.tsx"),
    "utf8",
  );

  expect(proposals).toMatch(
    /open: deleteTarget !== null,[\s\S]*?closeOnEscape: false/u,
  );
  expect(voters).toMatch(
    /open: revokeTarget !== null,[\s\S]*?closeOnEscape: false/u,
  );
});
