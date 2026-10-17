import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";

// Use the YAML parser already locked for the API toolchain; no new dependency.
const apiRequire = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { load } = createRequire(apiRequire.resolve("@eslint/eslintrc"))("js-yaml");
const source = await readFile(new URL("../compose.recovery.yml", import.meta.url), "utf8");
const compose = load(source);

function assertRecoveryBudget(config) {
  assert.deepEqual(Object.keys(config.services).sort(), ["app", "redis"]);
  for (const [name, expected] of Object.entries({
    app: { cpus: 2, mem_limit: "2g", pids_limit: 256 },
    redis: { cpus: 0.5, mem_limit: "384m", pids_limit: 64 },
  })) {
    const service = config.services[name];
    for (const [field, value] of Object.entries(expected)) assert.equal(service[field], value);
    assert.ok(Number.isFinite(service.cpus) && service.cpus > 0);
    assert.ok(Number.isInteger(service.pids_limit) && service.pids_limit > 0);
    assert.equal(service.ports, undefined, "No publica puertos del host");
    assert.equal(service.network_mode, undefined, "No usa la red del host u otro contenedor");
    assert.equal(service.privileged, undefined);
    assert.equal(service.devices, undefined);
    assert.equal(service.deploy, undefined, "No introduce una segunda definición contradictoria de límites");
  }

  assert.deepEqual(Object.keys(config.networks).sort(), ["dokploy-network", "private", "supabase-database"]);
  assert.deepEqual(config.networks.private, { internal: true });
  assert.deepEqual(config.services.redis.networks, ["private"]);
  assert.deepEqual(config.services.app.networks, ["private", "dokploy-network", "supabase-database"]);
  assert.deepEqual(config.networks["dokploy-network"], { external: true });
  assert.deepEqual(config.networks["supabase-database"], { external: true, name: "servilution-supabase-wl6nsn" });
  assert.deepEqual(Object.keys(config.volumes), ["redis-data"]);
  assert.equal(config.services.app.volumes, undefined, "La app no monta rutas del host ni volúmenes ajenos");
  assert.deepEqual(config.services.redis.volumes, ["redis-data:/data"]);

  const redis = config.services.redis;
  assert.deepEqual(redis.entrypoint, ["/bin/sh", "-ec"]);
  assert.equal(redis.command.length, 1);
  const script = redis.command[0];
  const configTemplate = script.match(/printf '([^']+)'/u)?.[1];
  assert.ok(configTemplate, "Redis debe recibir su configuración temporal explícita");
  const directives = configTemplate.split("\\n").filter(Boolean);
  assert.deepEqual(directives.filter((line) => line.startsWith("maxmemory ")), ["maxmemory 256mb"]);
  assert.deepEqual(directives.filter((line) => line.startsWith("maxmemory-policy ")), ["maxmemory-policy noeviction"]);
  assert.ok(directives.includes("appendonly yes"), "Se conserva persistencia AOF");
  assert.match(script, /exec redis-server \/tmp\/redis\.conf\s*$/u);

  // Preserve the independently reviewed feature flags while limiting resources.
  assert.equal(config.services.app.environment.PUBLIC_REGISTRATION_ENABLED, "${PUBLIC_REGISTRATION_ENABLED:-false}");
  assert.equal(config.services.app.environment.TEAM_INVITATION_ACCEPTANCE_ENABLED, "${TEAM_INVITATION_ACCEPTANCE_ENABLED:-true}");
}

test("recuperación acota los procesos conjuntos de la app y su Redis privado", () => {
  assertRecoveryBudget(compose);
  assert.match(source, /idle app sample/u);
  assert.match(source, /not\s*# a load-capacity certification/u);
});

test("el contrato rechaza límites ilimitados, pérdida de persistencia y expansión hacia otros servicios", () => {
  const mutations = [
    (config) => { delete config.services.app.mem_limit; },
    (config) => { config.services.app.cpus = 0; },
    (config) => { config.services.redis.cpus = 0; },
    (config) => { config.services.app.pids_limit = -1; },
    (config) => { config.services.redis.pids_limit = 0; },
    (config) => { config.services.redis.mem_limit = "0"; },
    (config) => { config.services.redis.command[0] = config.services.redis.command[0].replace("maxmemory 256mb", "maxmemory 0"); },
    (config) => { config.services.redis.command[0] = config.services.redis.command[0].replace("noeviction", "allkeys-lru"); },
    (config) => { config.services.redis.command[0] = config.services.redis.command[0].replace("appendonly yes", "appendonly no"); },
    (config) => { config.services.redis.command[0] += "\nexec redis-server --maxmemory 0\n"; },
    (config) => { config.services.redis.networks.push("dokploy-network"); },
    (config) => { config.networks.private.internal = false; },
    (config) => { config.services.redis.ports = ["6379:6379"]; },
    (config) => { config.services.app.network_mode = "host"; },
    (config) => { config.services.app.volumes = ["/var/run/docker.sock:/var/run/docker.sock"]; },
    (config) => { config.services.other = { image: "unrelated" }; },
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(compose);
    mutate(candidate);
    assert.throws(() => assertRecoveryBudget(candidate));
  }
});
