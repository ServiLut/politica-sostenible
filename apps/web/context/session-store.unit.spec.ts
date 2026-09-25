import { expect, test } from "@playwright/test";
import { createSessionStore } from "./session-store";

test("hidrata sin lectura durante render y publica login/salida con snapshot estable", () => {
  const events = new EventTarget();
  let session: { token: string } | null = { token: "initial" };
  let reads = 0;
  const store = createSessionStore(() => { reads += 1; return session && { ...session }; }, (changed) => {
    events.addEventListener("changed", changed);
    return () => events.removeEventListener("changed", changed);
  });
  expect(store.getServerSnapshot()).toBeUndefined();
  expect(store.getSnapshot()).toBeUndefined();
  expect(reads).toBe(0);
  const seen: unknown[] = [];
  const unsubscribe = store.subscribe(() => seen.push(store.getSnapshot()));
  const snapshot = store.getSnapshot();
  expect(snapshot).toEqual({ token: "initial" });
  expect(store.getSnapshot()).toBe(snapshot);
  expect(reads).toBe(1);
  session = { token: "new" };
  events.dispatchEvent(new Event("changed"));
  session = null;
  events.dispatchEvent(new Event("changed"));
  expect(seen).toEqual([{ token: "initial" }, { token: "new" }, null]);
  unsubscribe();
  events.dispatchEvent(new Event("changed"));
  expect(reads).toBe(3);
  expect(store.getSnapshot()).toBeUndefined();
});

test("limpiar una sesión inválida durante lectura no genera recursión ni retiene el token", () => {
  const events = new EventTarget();
  let reads = 0;
  const store = createSessionStore(() => {
    reads += 1;
    events.dispatchEvent(new Event("changed"));
    return null;
  }, (changed) => {
    events.addEventListener("changed", changed);
    return () => events.removeEventListener("changed", changed);
  });
  let updates = 0;
  const unsubscribe = store.subscribe(() => { updates += 1; });
  expect(reads).toBe(1);
  expect(updates).toBe(1);
  expect(store.getSnapshot()).toBeNull();
  unsubscribe();
});

test("mantiene la suscripción externa hasta que sale el último consumidor", () => {
  const events = new EventTarget();
  let connections = 0;
  let disconnections = 0;
  let session = "first";
  const store = createSessionStore(() => session, (changed) => {
    connections += 1;
    events.addEventListener("changed", changed);
    return () => { disconnections += 1; events.removeEventListener("changed", changed); };
  });
  const offA = store.subscribe(() => {});
  let updates = 0;
  const offB = store.subscribe(() => { updates += 1; });
  expect(connections).toBe(1);
  offA();
  session = "second";
  events.dispatchEvent(new Event("changed"));
  expect(store.getSnapshot()).toBe("second");
  expect(updates).toBe(2);
  expect(disconnections).toBe(0);
  offB();
  expect(disconnections).toBe(1);
});
