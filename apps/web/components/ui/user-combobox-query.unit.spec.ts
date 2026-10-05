import { expect, test } from "@playwright/test";
import {
  handleUserComboboxSearchKeyDown,
  userComboboxQueryReducer,
} from "./user-combobox-query";

test("Enter en la búsqueda cancela el envío implícito y no activa el formulario padre", () => {
  const calls: string[] = [];
  handleUserComboboxSearchKeyDown({
    key: "Enter",
    nativeEvent: { isComposing: false },
    preventDefault: () => calls.push("preventDefault"),
    stopPropagation: () => calls.push("stopPropagation"),
  });
  expect(calls).toEqual(["preventDefault", "stopPropagation"]);
});

test("la búsqueda conserva Tab, Escape y la confirmación del teclado de composición", () => {
  for (const [key, isComposing] of [
    ["Tab", false],
    ["Escape", false],
    ["a", false],
    ["Enter", true],
  ] as const) {
    const calls: string[] = [];
    handleUserComboboxSearchKeyDown({
      key,
      nativeEvent: { isComposing },
      preventDefault: () => calls.push("preventDefault"),
      stopPropagation: () => calls.push("stopPropagation"),
    });
    expect(calls).toEqual([]);
  }
});

test("buscar después de navegar reinicia la página sin mutar la consulta anterior", () => {
  const previous = { search: "Ana", page: 8, revision: 0 };
  const next = userComboboxQueryReducer(previous, {
    type: "search",
    value: "Luz",
  });
  expect(next).toEqual({ search: "Luz", page: 1, revision: 0 });
  expect(previous).toEqual({ search: "Ana", page: 8, revision: 0 });
});

test("reintentar conserva página y búsqueda pero cambia la identidad para descartar respuestas anteriores", () => {
  const failed = { search: "Andrés", page: 3, revision: 4 };
  const next = userComboboxQueryReducer(failed, { type: "retry" });
  expect(next).toEqual({ search: "Andrés", page: 3, revision: 5 });
  expect(next).not.toBe(failed);
});

test("la navegación conserva la búsqueda y rechaza páginas no válidas", () => {
  const initial = { search: "Equipo", page: 1, revision: 0 };
  expect(userComboboxQueryReducer(initial, { type: "page", value: 2 })).toEqual(
    { ...initial, page: 2 },
  );
  for (const value of [0, -1, 1.5, Infinity, NaN]) {
    expect(userComboboxQueryReducer(initial, { type: "page", value })).toBe(
      initial,
    );
  }
});
