import { expect, test } from "@playwright/test";
import { allowsLocalEvaluationHttp } from "./local-evaluation-http";

const evaluation = {
  DEPLOYMENT_PROFILE: "evaluation",
  ALLOW_LOCAL_STAGING_BUILD: "true",
  NEXT_PUBLIC_APP_URL: "http://127.0.0.1:5310",
};

test("permite HTTP solo en un origen loopback con ambas opciones de evaluación", () => {
  expect(allowsLocalEvaluationHttp(evaluation)).toBe(true);
  expect(
    allowsLocalEvaluationHttp({
      ...evaluation,
      NEXT_PUBLIC_APP_URL: "http://[::1]:5310",
    }),
  ).toBe(true);
  expect(
    allowsLocalEvaluationHttp({
      ...evaluation,
      DEPLOYMENT_PROFILE: "production",
    }),
  ).toBe(false);
  expect(
    allowsLocalEvaluationHttp({
      ...evaluation,
      ALLOW_LOCAL_STAGING_BUILD: undefined,
    }),
  ).toBe(false);
  expect(allowsLocalEvaluationHttp({})).toBe(false);
});

test("conserva HTTPS para hosts públicos, DNS local ambiguo y orígenes con credenciales o rutas", () => {
  for (const url of [
    "http://example.org",
    "http://localhost:5310",
    "http://192.168.1.2:5310",
    "http://127.0.0.1:5310/path",
    "http://user@127.0.0.1:5310",
    "http://127.0.0.1:5310?query=1",
    "http://127.0.0.1:5310#hash",
    "https://127.0.0.1:5310",
    "invalid",
  ]) {
    expect(
      allowsLocalEvaluationHttp({ ...evaluation, NEXT_PUBLIC_APP_URL: url }),
      url,
    ).toBe(false);
  }
});
