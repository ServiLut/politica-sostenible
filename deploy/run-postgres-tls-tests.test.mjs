import assert from "node:assert/strict";
import test from "node:test";
import { assertTlsTapResult, POSTGRES_TLS_IMAGE, tlsContainerArgs } from "./run-postgres-tls-tests.mjs";

function completeResult() {
  const cases = ["pg", "prisma-native"].flatMap((client) =>
    ["trusted-localhost", "untrusted-ca", "wrong-hostname"].map((scenario) => `${client}: ${scenario}`));
  return { code: 0, stdout: [
    ...cases.map((name, index) => `    ok ${index + 1} - ${name}`),
    "# tests 7", "# pass 7", "# fail 0", "# cancelled 0", "# skipped 0", "# todo 0",
  ].join("\n") + "\n" };
}

test("TLS runner sólo acepta las seis comprobaciones físicas sin omisiones", () => {
  assert.doesNotThrow(() => assertTlsTapResult(completeResult()));
  for (const mutate of [
    (value) => { value.code = 1; },
    (value) => { value.stdout = value.stdout.replace("# skipped 0", "# skipped 1"); },
    (value) => { value.stdout = value.stdout.replace("# tests 7", "# tests 1"); },
    (value) => { value.stdout = value.stdout.replace("# pass 7", "# pass 6"); },
    (value) => { value.stdout = value.stdout.replace("# fail 0", "# fail 1"); },
    (value) => { value.stdout = value.stdout.replace("# cancelled 0", "# cancelled 1"); },
    (value) => { value.stdout = value.stdout.replace("# todo 0", "# todo 1"); },
    (value) => { value.stdout = value.stdout.replace("pg: wrong-hostname", "pg: trusted-localhost"); },
    (value) => { value.stdout = value.stdout.replace("    ok 6 - prisma-native: wrong-hostname", ""); },
    (value) => { value.stdout += "# pass 7\n"; },
  ]) {
    const changed = completeResult(); mutate(changed);
    assert.throws(() => assertTlsTapResult(changed));
  }
});

test("fixture Docker TLS fija imagen, recursos, puerto loopback y almacenamiento efímero", () => {
  const args = tlsContainerArgs("ps-tls-0123456789abcdef", "/tmp/ps-tls-ci-example/server");
  const option = (name) => args[args.indexOf(name) + 1];
  assert.equal(option("--publish"), "127.0.0.1::5432");
  assert.equal(option("--cpus"), "1");
  assert.equal(option("--memory"), "512m");
  assert.equal(option("--pids-limit"), "128");
  assert.equal(option("--label"), "com.politica-sostenible.tls-test=ps-tls-0123456789abcdef");
  assert.equal(option("--tmpfs"), "/var/lib/postgresql/data:rw,noexec,nosuid,size=256m");
  assert.equal(option("--mount"), "type=bind,source=/tmp/ps-tls-ci-example/server,target=/tls-fixture,readonly");
  assert.match(POSTGRES_TLS_IMAGE, /^postgres:16-alpine@sha256:[a-f0-9]{64}$/u);
  assert.ok(args.includes(POSTGRES_TLS_IMAGE));
  assert.ok(!args.includes("--privileged") && !args.includes("--network") && !args.includes("--pid"));
  assert.match(args.at(-1), /ssl=on.*ssl_min_protocol_version=TLSv1\.2/u);
  assert.throws(() => tlsContainerArgs("existing-production", "/tmp/fixture"));
  assert.throws(() => tlsContainerArgs("ps-tls-0123456789abcdef", "/tmp/fixture,readonly=false"));
});
