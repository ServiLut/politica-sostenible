import assert from "node:assert/strict";
import test from "node:test";

import {
  APPLICATION_SOURCE,
  artifactMetadataIssues,
} from "./artifact-metadata.mjs";

const REVISION = "0123456789abcdef0123456789abcdef01234567";

test("produccion exige y acepta un SHA Git completo", () => {
  assert.deepEqual(
    artifactMetadataIssues({
      DEPLOYMENT_PROFILE: "production",
      APP_REVISION: REVISION,
      APP_SOURCE: APPLICATION_SOURCE,
    }),
    [],
  );

  for (const revision of [undefined, "", "unknown", REVISION.slice(0, 12)]) {
    assert.match(
      artifactMetadataIssues({
        DEPLOYMENT_PROFILE: "production",
        APP_REVISION: revision,
        APP_SOURCE: APPLICATION_SOURCE,
      }).join("\n"),
      /SHA Git completo/,
    );
  }
  assert.match(
    artifactMetadataIssues({
      APP_REVISION: "unknown",
      APP_SOURCE: APPLICATION_SOURCE,
    }).join("\n"),
    /SHA Git completo/,
  );
});

test("evaluation permite unknown sin relajar el origen del artefacto", () => {
  assert.deepEqual(
    artifactMetadataIssues({
      DEPLOYMENT_PROFILE: "evaluation",
      APP_REVISION: "unknown",
      APP_SOURCE: APPLICATION_SOURCE,
    }),
    [],
  );
  assert.match(
    artifactMetadataIssues({
      DEPLOYMENT_PROFILE: "evaluation",
      APP_REVISION: "unknown",
      APP_SOURCE: "https://example.invalid/fork",
    }).join("\n"),
    /repositorio canonico/,
  );
});

test("rechaza perfiles y revisiones ambiguas", () => {
  const issues = artifactMetadataIssues({
    DEPLOYMENT_PROFILE: "staging",
    APP_REVISION: "main",
    APP_SOURCE: APPLICATION_SOURCE,
  });

  assert.ok(issues.some((issue) => issue.includes("DEPLOYMENT_PROFILE")));
  assert.ok(issues.some((issue) => issue.includes("APP_REVISION")));
});
