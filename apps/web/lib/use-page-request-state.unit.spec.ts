import { expect, test } from "@playwright/test";
import { createPageRequestState } from "./use-page-request-state";

function deferredRequest<T>() {
  const calls: Array<{
    signal: AbortSignal;
    resolve: (value: T) => void;
    reject: (error: unknown) => void;
  }> = [];
  const request = (signal: AbortSignal) => {
    const deferred = Promise.withResolvers<T>();
    calls.push({ signal, resolve: deferred.resolve, reject: deferred.reject });
    return deferred.promise;
  };
  return { calls, request };
}

test("la lectura inicial publica un resultado real y conserva snapshot estable entre lecturas", async () => {
  const source = deferredRequest<string>();
  const state = createPageRequestState(source.request);
  let notifications = 0;
  const unsubscribe = state.subscribe(() => notifications++);
  const initial = state.getSnapshot();
  expect(initial).toEqual({
    data: null,
    error: null,
    loading: true,
    receivedAt: null,
  });
  expect(state.getSnapshot()).toBe(initial);
  const pending = state.start();
  expect(notifications).toBe(0);
  source.calls[0].resolve("respuesta confirmada");
  await pending;
  expect(state.getSnapshot()).toMatchObject({
    data: "respuesta confirmada",
    error: null,
    loading: false,
  });
  expect(notifications).toBe(1);
  expect(state.getServerSnapshot()).toBe(initial);
  unsubscribe();
  state.stop();
});

test("A → B → A crea snapshots separados y no resucita la primera respuesta A", async () => {
  const sourceA = deferredRequest<string>();
  const sourceB = deferredRequest<string>();
  const firstA = createPageRequestState(sourceA.request);
  const firstPending = firstA.start();
  sourceA.calls[0].resolve("A anterior");
  await firstPending;
  firstA.stop();
  const stateB = createPageRequestState(sourceB.request);
  const pendingB = stateB.start();
  stateB.stop();
  const newA = createPageRequestState(sourceA.request);
  expect(newA.getSnapshot().data).toBeNull();
  const pendingA = newA.start();
  sourceB.calls[0].resolve("B tardío");
  sourceA.calls[1].resolve("A actual");
  await Promise.all([pendingA, pendingB]);
  expect(newA.getSnapshot().data).toBe("A actual");
  expect(stateB.getSnapshot().data).toBeNull();
  newA.stop();
});

test("dos recargas concurrentes abortan la anterior y solo publican la más reciente", async () => {
  const source = deferredRequest<string>();
  const state = createPageRequestState(source.request);
  const initial = state.start();
  const first = state.refresh();
  const second = state.refresh();
  expect(source.calls.map((call) => call.signal.aborted)).toEqual([
    true,
    true,
    false,
  ]);
  source.calls[2].resolve("vigente");
  await second;
  source.calls[0].resolve("inicial vieja");
  source.calls[1].reject(new Error("error viejo"));
  await Promise.all([initial, first]);
  expect(state.getSnapshot()).toMatchObject({
    data: "vigente",
    error: null,
    loading: false,
  });
  state.stop();
});

test("reintentar un error limpia el fallo previo y espera una nueva respuesta", async () => {
  const source = deferredRequest<string>();
  const state = createPageRequestState(source.request);
  const pending = state.start();
  const error = new Error("red caída");
  source.calls[0].reject(error);
  await pending;
  expect(state.getSnapshot().error).toBe(error);
  const retry = state.refresh();
  expect(state.getSnapshot()).toMatchObject({
    data: null,
    error: null,
    loading: true,
  });
  source.calls[1].resolve("recuperado");
  await retry;
  expect(state.getSnapshot()).toMatchObject({
    data: "recuperado",
    error: null,
    loading: false,
  });
  state.stop();
});

test("una excepción síncrona de la API también termina el estado de carga", async () => {
  const error = new Error("parámetro inválido");
  const state = createPageRequestState<string>(() => {
    throw error;
  });
  await state.start();
  expect(state.getSnapshot()).toMatchObject({
    data: null,
    error,
    loading: false,
  });
  state.stop();
});

test("deshabilitar y rehabilitar la misma API requiere otro snapshot y bloquea callbacks antiguos", async () => {
  const source = deferredRequest<string>();
  const old = createPageRequestState(source.request);
  const pending = old.start();
  source.calls[0].resolve("autorización anterior");
  await pending;
  old.stop();
  const disabled = createPageRequestState(source.request, false);
  disabled.start();
  await disabled.refresh();
  disabled.setData("dato no autorizado");
  await old.refresh();
  old.setData("readback tardío");
  expect(source.calls).toHaveLength(1);
  expect(disabled.getSnapshot()).toMatchObject({ data: null, loading: false });
  disabled.stop();
  const enabled = createPageRequestState(source.request, true);
  const reloaded = enabled.start();
  expect(enabled.getSnapshot()).toMatchObject({ data: null, loading: true });
  source.calls[1].resolve("autorización actual");
  await reloaded;
  expect(enabled.getSnapshot().data).toBe("autorización actual");
  enabled.stop();
});

test("el readback de una mutación aborta el GET anterior y no puede ser sobrescrito", async () => {
  const source = deferredRequest<{ version: number }>();
  const state = createPageRequestState(source.request);
  const pending = state.start();
  state.setData({ version: 2 });
  expect(source.calls[0].signal.aborted).toBe(true);
  source.calls[0].resolve({ version: 1 });
  await pending;
  state.setData((previous) => ({ version: (previous?.version ?? 0) + 1 }));
  expect(state.getSnapshot().data).toEqual({ version: 3 });
  state.stop();
});

test("desmontar impide cambios y notificaciones incluso si la red ignora el aborto", async () => {
  const source = deferredRequest<string>();
  const state = createPageRequestState(source.request);
  let notifications = 0;
  state.subscribe(() => notifications++);
  const pending = state.start();
  state.stop();
  expect(source.calls[0].signal.aborted).toBe(true);
  source.calls[0].resolve("fuera del componente");
  await pending;
  state.setData("mutación tardía");
  await state.refresh();
  expect(notifications).toBe(0);
  expect(state.getSnapshot().data).toBeNull();
  expect(source.calls).toHaveLength(1);
});

test("el ciclo de montaje estricto aborta el primer intento y permite suscribirse de nuevo", async () => {
  const source = deferredRequest<string>();
  const state = createPageRequestState(source.request);
  const first = state.start();
  state.stop();
  let notifications = 0;
  state.subscribe(() => notifications++);
  const second = state.start();
  source.calls[0].resolve("abandonado");
  source.calls[1].resolve("montaje vigente");
  await Promise.all([first, second]);
  expect(state.getSnapshot().data).toBe("montaje vigente");
  expect(notifications).toBe(1);
  state.stop();
});

test("el sondeo conserva el último corte solo dentro de su consulta e informa que falló refrescar", async () => {
  const source = deferredRequest<string>();
  const state = createPageRequestState(source.request, true, true);
  const initial = state.start();
  source.calls[0].resolve("último corte confirmado");
  await initial;
  const cut = state.getSnapshot().receivedAt;
  const poll = state.refresh();
  expect(state.getSnapshot()).toMatchObject({
    data: "último corte confirmado",
    loading: true,
    receivedAt: cut,
  });
  const error = new Error("sin red");
  source.calls[1].reject(error);
  await poll;
  expect(state.getSnapshot()).toMatchObject({
    data: "último corte confirmado",
    error,
    loading: false,
    receivedAt: cut,
  });
  state.stop();
  expect(
    createPageRequestState(source.request, true, true).getSnapshot().data,
  ).toBeNull();
});
