import assert from "node:assert/strict";
import test from "node:test";

import { publicBuildEnvironmentIssues } from "./public-build-environment.mjs";

const validEnvironment = {
  NEXT_PUBLIC_APP_URL: "https://politica.invalid.co",
  NEXT_PUBLIC_SUPABASE_URL: "https://storage.invalid.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    "sb_publishable_0123456789abcdefghijklmnopqrstuvwxyz",
};

test("acepta únicamente configuración pública utilizable", () => {
  assert.deepEqual(publicBuildEnvironmentIssues(validEnvironment), []);
});

test("rechaza vacíos, HTTP, rutas, placeholders y claves de rol incorrecto", () => {
  assert.equal(publicBuildEnvironmentIssues({}).length, 3);
  assert.equal(
    publicBuildEnvironmentIssues({
      ...validEnvironment,
      NEXT_PUBLIC_APP_URL: "http://politica.invalid.co",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.com/storage",
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        "eyJhbGciOiJub25lIn0.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature",
    }).length,
    3,
  );
});

test("el build local requiere opt-in y evaluation para ambos orígenes loopback", () => {
  const local = {
    ...validEnvironment,
    DEPLOYMENT_PROFILE: "evaluation",
    ALLOW_LOCAL_STAGING_BUILD: "true",
    NEXT_PUBLIC_APP_URL: "http://127.0.0.1:5310",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:5800",
  };
  assert.deepEqual(publicBuildEnvironmentIssues(local), []);
  assert.ok(publicBuildEnvironmentIssues({ ...local, ALLOW_LOCAL_STAGING_BUILD: "false" }).length > 0);
  assert.ok(publicBuildEnvironmentIssues({ ...local, DEPLOYMENT_PROFILE: "production" }).length > 0);
  assert.ok(publicBuildEnvironmentIssues({ ...validEnvironment, ALLOW_LOCAL_STAGING_BUILD: "true" }).length > 0);
  for (const origin of [
    "http://127.0.0.1.evil.invalid:5800", "http://10.0.0.1:5800",
    "https://storage.project.supabase.co", "http://127.0.0.1:5800/storage/v1",
    "http://user:pass@127.0.0.1:5800", "http://127.0.0.1:5800?target=production",
  ]) {
    assert.ok(publicBuildEnvironmentIssues({ ...local, NEXT_PUBLIC_SUPABASE_URL: origin }).length > 0, origin);
  }
});
