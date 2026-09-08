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
