import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const contextSource = readFileSync(
  resolve(__dirname, "confirmation.tsx"),
  "utf8",
);
const layoutSource = readFileSync(
  resolve(__dirname, "../app/layout.tsx"),
  "utf8",
);

test("la confirmación global contiene foco y resuelve una única decisión", () => {
  expect(contextSource).toContain("useAccessibleDialog");
  expect(contextSource).toContain("initialFocusRef: cancelButtonRef");
  expect(contextSource).toContain("if (resolverRef.current)");
  expect(contextSource).toContain("resolve?.(confirmed)");
  expect(contextSource).toContain("resolverRef.current?.(false)");
  expect(layoutSource).toContain("<ConfirmationProvider>");
});

test("las confirmaciones destructivas no se descartan con Escape", () => {
  expect(contextSource).toContain(
    "closeOnEscape: request?.destructive !== true",
  );
  expect(contextSource).toContain('role={request.destructive ? "alertdialog"');
  expect(contextSource).toContain(
    'variant={request.destructive ? "destructive"',
  );
});
