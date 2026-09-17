import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const webRoot = resolve(__dirname, "..");

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
