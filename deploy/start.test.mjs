import assert from "node:assert/strict";
import test from "node:test";

import {
  API_READY_URL,
  launchServicesInOrder,
  waitForApiReady,
} from "./start.mjs";

test("espera la salud real de la API antes de continuar", async () => {
  let currentTime = 0;
  let fetchCalls = 0;
  const delays = [];
  const responses = [
    Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" }),
    { ok: false, status: 503 },
    { ok: true, status: 200 },
  ];

  await waitForApiReady({
    timeoutMs: 1_000,
    retryMs: 100,
    fetchImpl: async (url) => {
      assert.equal(url, API_READY_URL);
      const response = responses[fetchCalls++];
      if (response instanceof Error) throw response;
      return response;
    },
    now: () => currentTime,
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
      currentTime += milliseconds;
    },
  });

  assert.equal(fetchCalls, 3);
  assert.deepEqual(delays, [100, 100]);
});

test("la espera de la API termina de forma acotada", async () => {
  let currentTime = 0;
  let fetchCalls = 0;

  await assert.rejects(
    waitForApiReady({
      timeoutMs: 250,
      retryMs: 100,
      fetchImpl: async () => {
        fetchCalls += 1;
        throw Object.assign(new Error("connection refused"), {
          code: "ECONNREFUSED",
        });
      },
      now: () => currentTime,
      sleep: async (milliseconds) => {
        currentTime += milliseconds;
      },
    }),
    /La API no estuvo lista en 250 ms \(ECONNREFUSED\)/,
  );

  assert.equal(fetchCalls, 3);
  assert.equal(currentTime, 250);
});

test("ejecuta migraciones, inicia API, espera readiness y luego inicia web", async () => {
  const order = [];
  const neverExits = new Promise(() => undefined);

  const web = await launchServicesInOrder({
    runMigrations: async () => order.push("migrations"),
    startApi: () => {
      order.push("api");
      return { exited: neverExits };
    },
    awaitApiReady: async () => order.push("ready"),
    startWeb: () => {
      order.push("web");
      return { name: "web" };
    },
  });

  assert.deepEqual(order, ["migrations", "api", "ready", "web"]);
  assert.deepEqual(web, { name: "web" });
});

test("no inicia web cuando la API no alcanza readiness", async () => {
  const order = [];

  await assert.rejects(
    launchServicesInOrder({
      runMigrations: async () => order.push("migrations"),
      startApi: () => {
        order.push("api");
        return { exited: new Promise(() => undefined) };
      },
      awaitApiReady: async () => {
        order.push("ready-failed");
        throw new Error("readiness timeout");
      },
      startWeb: () => order.push("web"),
    }),
    /readiness timeout/,
  );

  assert.deepEqual(order, ["migrations", "api", "ready-failed"]);
});

test("no inicia web cuando la API termina durante la espera", async () => {
  const order = [];

  await assert.rejects(
    launchServicesInOrder({
      runMigrations: async () => order.push("migrations"),
      startApi: () => {
        order.push("api");
        return {
          exited: Promise.resolve({ error: null, code: 1, signal: null }),
        };
      },
      awaitApiReady: () => new Promise(() => undefined),
      startWeb: () => order.push("web"),
    }),
    /La API termino antes de estar lista \(codigo 1\)/,
  );

  assert.deepEqual(order, ["migrations", "api"]);
});

test("no inicia ningun servicio si fallan las migraciones", async () => {
  const order = [];

  await assert.rejects(
    launchServicesInOrder({
      runMigrations: async () => {
        order.push("migrations-failed");
        throw new Error("migration failed");
      },
      startApi: () => order.push("api"),
      awaitApiReady: async () => order.push("ready"),
      startWeb: () => order.push("web"),
    }),
    /migration failed/,
  );

  assert.deepEqual(order, ["migrations-failed"]);
});
