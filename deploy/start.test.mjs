import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  API_READY_URL,
  SUPERVISOR_SHUTDOWN_GRACE_MS,
  assertCombinedRuntimeBoundary,
  buildChildEnvironment,
  clearSupervisorSupplementaryGroups,
  launchServicesInOrder,
  resolveCombinedRuntimeIdentities,
  resolveSupervisorShutdownGraceMs,
  scrubSupervisorSecrets,
  stopChildrenGracefully,
  waitForApiReady,
} from "./start.mjs";

test("separa secretos de API y web en el supervisor combinado", () => {
  const source = {
    PATH: "/usr/bin",
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://runtime-secret",
    DIRECT_URL: "postgresql://migration-secret",
    JWT_SECRET: "jwt-secret",
    SUPABASE_SERVICE_ROLE_KEY: "storage-secret",
    NEXT_PUBLIC_APP_URL: "https://politica.invalid",
    NEXT_PUBLIC_SUPABASE_URL: "https://storage.invalid",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon",
    NESTJS_API_URL: "http://127.0.0.1:4000",
  };

  const api = buildChildEnvironment("api", source, { PORT: "4000" });
  const web = buildChildEnvironment("web", source, { PORT: "3000" });

  assert.equal(api.DATABASE_URL, source.DATABASE_URL);
  assert.equal(api.JWT_SECRET, source.JWT_SECRET);
  assert.equal(api.DIRECT_URL, undefined);
  assert.equal(web.NESTJS_API_URL, source.NESTJS_API_URL);
  assert.equal(web.NEXT_PUBLIC_SUPABASE_ANON_KEY, "public-anon");
  assert.equal(web.DATABASE_URL, undefined);
  assert.equal(web.JWT_SECRET, undefined);
  assert.equal(web.SUPABASE_SERVICE_ROLE_KEY, undefined);
});

test("borra secretos del supervisor después de iniciar la API", () => {
  const environment = {
    DATABASE_URL: "database-secret",
    DIRECT_URL: "migration-secret",
    POSTGRES_PASSWORD: "postgres-secret",
    JWT_SECRET: "jwt-secret",
    MFA_TOTP_ENCRYPTION_KEY: "mfa-secret",
    SUPABASE_SERVICE_ROLE_KEY: "storage-secret",
    NEXT_PUBLIC_APP_URL: "https://politica.invalid",
  };

  scrubSupervisorSecrets(environment);

  assert.deepEqual(environment, {
    NEXT_PUBLIC_APP_URL: "https://politica.invalid",
  });
});

test("exige identidades Unix distintas para API y web en el contenedor combinado", () => {
  const environment = {
    API_PROCESS_UID: "1001",
    API_PROCESS_GID: "1001",
    WEB_PROCESS_UID: "1002",
    WEB_PROCESS_GID: "1002",
  };

  assert.deepEqual(
    resolveCombinedRuntimeIdentities(environment, {
      platform: "linux",
      supervisorUid: 0,
    }),
    {
      api: { uid: 1001, gid: 1001 },
      web: { uid: 1002, gid: 1002 },
    },
  );
  assert.throws(
    () =>
      resolveCombinedRuntimeIdentities(
        { ...environment, WEB_PROCESS_UID: "1001" },
        { platform: "linux", supervisorUid: 0 },
      ),
    /UID y GID distintos/,
  );
  assert.throws(
    () =>
      resolveCombinedRuntimeIdentities(environment, {
        platform: "linux",
        supervisorUid: 1001,
      }),
    /supervisor root en Linux/,
  );
  assert.throws(
    () =>
      resolveCombinedRuntimeIdentities(
        { NODE_ENV: "production" },
        { platform: "linux", supervisorUid: 0 },
      ),
    /exige UID y GID separados/,
  );
});

test("el fallback combinado exige no-new-privileges y /app de solo lectura", () => {
  const identities = {
    api: { uid: 1001, gid: 1001 },
    web: { uid: 1002, gid: 1002 },
  };
  assert.doesNotThrow(() =>
    assertCombinedRuntimeBoundary(identities, {
      readStatus: () => "Name:\tnode\nNoNewPrivs:\t1\n",
      openProbe: () => {
        throw Object.assign(new Error("read-only"), { code: "EROFS" });
      },
    }),
  );
  assert.throws(
    () =>
      assertCombinedRuntimeBoundary(identities, {
        readStatus: () => "NoNewPrivs:\t0\n",
      }),
    /no-new-privileges/,
  );
  assert.throws(
    () =>
      assertCombinedRuntimeBoundary(identities, {
        readStatus: () => "NoNewPrivs:\t1\n",
        openProbe: () => 7,
        closeProbe: () => undefined,
        removeProbe: () => undefined,
        probePath: "/app/probe",
      }),
    /filesystem \/app de solo lectura/,
  );
});

test("limpia grupos suplementarios antes de crear API y web", () => {
  const calls = [];
  clearSupervisorSupplementaryGroups(
    { api: { uid: 1001, gid: 1001 }, web: { uid: 1002, gid: 1002 } },
    (groups) => calls.push(groups),
  );
  assert.deepEqual(calls, [[]]);
});

test("valida una gracia de apagado configurable antes de iniciar", () => {
  assert.equal(resolveSupervisorShutdownGraceMs({}), 30_000);
  assert.equal(
    resolveSupervisorShutdownGraceMs({
      SUPERVISOR_SHUTDOWN_GRACE_MS: "45000",
    }),
    45_000,
  );
  for (const invalid of ["5000", "120001", "30s", "1.5"]) {
    assert.throws(
      () =>
        resolveSupervisorShutdownGraceMs({
          SUPERVISOR_SHUTDOWN_GRACE_MS: invalid,
        }),
      /SUPERVISOR_SHUTDOWN_GRACE_MS/,
    );
  }
});

test("propaga SIGTERM y espera el cierre ordenado de todos los hijos", async () => {
  const signals = [];
  const processExits = [];
  let scheduledGrace;
  let timerCleared = false;
  const children = ["api", "web"].map((name) => {
    const child = new EventEmitter();
    child.exitCode = null;
    child.signalCode = null;
    child.kill = (signal) => {
      signals.push([name, signal]);
      child.signalCode = signal;
      child.emit("exit", null, signal);
      return true;
    };
    return child;
  });

  const result = await stopChildrenGracefully(children, {
    exitCode: 0,
    exitProcess: (code) => processExits.push(code),
    setTimer: (_callback, milliseconds) => {
      scheduledGrace = milliseconds;
      return { unref() {} };
    },
    clearTimer: () => {
      timerCleared = true;
    },
  });

  assert.equal(result, "graceful");
  assert.equal(scheduledGrace, SUPERVISOR_SHUTDOWN_GRACE_MS);
  assert.ok(scheduledGrace > 5_000);
  assert.deepEqual(signals, [
    ["api", "SIGTERM"],
    ["web", "SIGTERM"],
  ]);
  assert.equal(timerCleared, true);
  assert.deepEqual(processExits, [0]);
});

test("solo fuerza SIGKILL despues de agotar la gracia del supervisor", async () => {
  const signals = [];
  const processExits = [];
  let forceExit;
  let scheduledGrace;
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.kill = (signal) => {
    signals.push(signal);
    return true;
  };

  const stopped = stopChildrenGracefully([child], {
    exitCode: 1,
    exitProcess: (code) => processExits.push(code),
    setTimer: (callback, milliseconds) => {
      forceExit = callback;
      scheduledGrace = milliseconds;
      return { unref() {} };
    },
  });

  assert.deepEqual(signals, ["SIGTERM"]);
  assert.deepEqual(processExits, []);
  assert.equal(scheduledGrace, SUPERVISOR_SHUTDOWN_GRACE_MS);
  forceExit();
  assert.equal(await stopped, "forced");
  assert.deepEqual(signals, ["SIGTERM", "SIGKILL"]);
  assert.deepEqual(processExits, [1]);
});

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
