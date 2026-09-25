import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import {
  deployMigrationPrefix,
  installPendingPlanSeedGuard,
  pendingPlanSeedCatalogMatches,
  planCatalogMatches,
  prepareSubscriptionPlanSeed,
  runSafeMigrations,
  SUBSCRIPTION_PLAN_SEED_MIGRATION,
  SUBSCRIPTION_PLAN_SEED_SHA256,
} from "./migrate.mjs";

// No DATABASE_URL fallback: this suite creates and drops only its own schemas
// and one uniquely named bootstrap database on explicit local test PostgreSQL.
const testUrl = process.env.TEST_DATABASE_URL?.trim();
const requireFromApi = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
);
const { Client } = requireFromApi("pg");
const seedBytes = await readFile(
  new URL(
    `../apps/api/prisma/migrations/${SUBSCRIPTION_PLAN_SEED_MIGRATION}/migration.sql`,
    import.meta.url,
  ),
);
const planSchema = await readFile(
  new URL(
    "../apps/api/prisma/migrations/20260905130000_subscription_plans/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const seedSql = seedBytes.toString("utf8");

function disposableConnection() {
  const parsed = new URL(testUrl);
  assert.ok(
    ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname),
    "TEST_DATABASE_URL must use local disposable PostgreSQL",
  );
  assert.match(
    decodeURIComponent(parsed.pathname),
    /(?:test|audit|disposable)/i,
  );
  return parsed;
}

async function fixture(t, { fresh = false, isolatedDatabase = false } = {}) {
  const parsed = disposableConnection();
  const schema = `audit_seed_${randomUUID().replaceAll("-", "")}`;
  const admin = new Client({ connectionString: parsed.toString() });
  await admin.connect();
  let client = admin;
  const database = isolatedDatabase
    ? `audit_seed_db_${randomUUID().replaceAll("-", "")}`
    : null;
  let createdDatabase = false;
  let createdSchema = false;
  t.after(async () => {
    assert.match(schema, /^audit_seed_[a-f0-9]{32}$/);
    try {
      await client.query("ROLLBACK");
      if (createdSchema) await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      if (client !== admin) await client.end();
      try {
        if (createdDatabase) {
          assert.match(database, /^audit_seed_db_[a-f0-9]{32}$/);
          await admin.query(`DROP DATABASE "${database}"`);
        }
      } finally {
        await admin.end();
      }
    }
  });
  if (database) {
    const existing = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname=$1",
      [database],
    );
    assert.equal(
      existing.rowCount,
      0,
      "never reuse or drop someone else's database",
    );
    await admin.query(`CREATE DATABASE "${database}"`);
    createdDatabase = true;
    parsed.pathname = `/${database}`;
    client = new Client({ connectionString: parsed.toString() });
    await client.connect();
  }
  await client.query(`CREATE SCHEMA "${schema}"`);
  createdSchema = true;
  await client.query(`SET search_path TO "${schema}", pg_catalog`);
  if (!fresh) {
    await client.query('CREATE TABLE "Tenant" (id text PRIMARY KEY)');
    await client.query(planSchema);
  }
  const connection = new URL(parsed);
  connection.searchParams.set("schema", schema);
  const environment = {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: connection.toString(),
    DIRECT_URL: connection.toString(),
    DATABASE_SCHEMA: schema,
    DATABASE_SSL: "false",
    PGOPTIONS: "-c lock_timeout=10000ms -c statement_timeout=90000ms",
  };
  return { client, schema, environment, parsed };
}

async function rows(client) {
  return (
    await client.query(
      'SELECT to_jsonb(plan) AS row FROM "SubscriptionPlan" plan ORDER BY code',
    )
  ).rows.map(({ row }) => row);
}

const physical = (name, body) =>
  test(name, { skip: !testUrl, timeout: 180000 }, body);

physical(
  "seed PostgreSQL: the published checksum is immutable and the unsafe identity counterexample is real",
  async (t) => {
    assert.equal(
      createHash("sha256").update(seedBytes).digest("hex"),
      SUBSCRIPTION_PLAN_SEED_SHA256,
    );
    const { client } = await fixture(t);
    await client.query(seedSql);
    await client.query(`UPDATE "SubscriptionPlan" SET id='temporary-test-id' WHERE code='FREE';
    UPDATE "SubscriptionPlan" SET id='seed-subscription-plan-free-v1' WHERE code='STARTER';
    UPDATE "SubscriptionPlan" SET id='seed-subscription-plan-starter-v1' WHERE code='FREE'`);
    assert.equal(planCatalogMatches(await rows(client)), true);
    assert.equal(pendingPlanSeedCatalogMatches(await rows(client)), false);
    await client.query(seedSql);
    assert.equal(
      Number(
        (await rows(client)).find((row) => row.code === "FREE").monthlyPriceCop,
      ),
      290000,
    );
    assert.equal(
      Number(
        (await rows(client)).find((row) => row.code === "STARTER")
          .monthlyPriceCop,
      ),
      0,
    );
  },
);

for (const [name, assignment] of [
  ["alternative id", "id = 'custom-plan-id'"],
  ["name", "name = 'Acuerdo particular'"],
  ["description", "description = 'Terminos originales'"],
  ["monthly price", '"monthlyPriceCop" = 1'],
  ["yearly price", '"yearlyPriceCop" = 1'],
  ["limits", '"maxUsers" = 4, "maxVoters" = 600, "maxStorageMb" = 60'],
]) {
  physical(
    `seed PostgreSQL: preflight preserves a custom ${name}`,
    async (t) => {
      const { client, schema } = await fixture(t);
      await client.query(seedSql);
      await client.query(
        `UPDATE "SubscriptionPlan" SET ${assignment} WHERE code='FREE'`,
      );
      const original = await rows(client);
      await assert.rejects(
        installPendingPlanSeedGuard(client, schema),
        /identidad y terminos canonicos/,
      );
      assert.deepEqual(await rows(client), original);
    },
  );
}

physical(
  "seed PostgreSQL: swapped ids fail closed without rewriting either plan",
  async (t) => {
    const { client, schema } = await fixture(t);
    await client.query(seedSql);
    await client.query(`UPDATE "SubscriptionPlan" SET id='temporary-test-id' WHERE code='FREE';
    UPDATE "SubscriptionPlan" SET id='seed-subscription-plan-free-v1' WHERE code='STARTER';
    UPDATE "SubscriptionPlan" SET id='seed-subscription-plan-starter-v1' WHERE code='FREE'`);
    const original = await rows(client);
    await assert.rejects(
      installPendingPlanSeedGuard(client, schema),
      /identidad y terminos canonicos/,
    );
    assert.deepEqual(await rows(client), original);
  },
);

physical(
  "seed PostgreSQL: idempotent guard and seed preserve every row and subscription reference",
  async (t) => {
    const { client, schema } = await fixture(t);
    await client.query(seedSql);
    await client.query(`INSERT INTO "Tenant" VALUES ('tenant-test');
    INSERT INTO "TenantSubscription" (id,"tenantId","planId","currentPeriodStart","currentPeriodEnd","updatedAt")
    VALUES ('subscription-test','tenant-test','seed-subscription-plan-free-v1',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+INTERVAL '1 month',CURRENT_TIMESTAMP)`);
    const original = await rows(client);
    await installPendingPlanSeedGuard(client, schema);
    await client.query(seedSql);
    await installPendingPlanSeedGuard(client, schema);
    await client.query(seedSql);
    assert.deepEqual(
      await rows(client),
      original,
      "even updatedAt must remain unchanged",
    );
    assert.equal(
      (await client.query('SELECT "planId" FROM "TenantSubscription"')).rows[0]
        .planId,
      "seed-subscription-plan-free-v1",
    );
    for (const [column, value] of [
      ["id", "different-id"],
      ["code", "STARTER"],
      ["name", "different"],
      ["description", "different"],
      ["maxUsers", 4],
      ["maxVoters", 501],
      ["maxStorageMb", 51],
      ["includesExport", true],
      ["includesImport", true],
      ["includesMfa", true],
      ["includesApi", true],
      ["monthlyPriceCop", 1],
      ["yearlyPriceCop", 1],
      ["isActive", false],
      ["sortOrder", 2],
      ["createdAt", "2020-01-01T00:00:00Z"],
    ]) {
      await assert.rejects(
        client.query(
          `UPDATE "SubscriptionPlan" SET "${column}"=$1 WHERE code='FREE'`,
          [value],
        ),
        { code: "55000" },
      );
    }
    await assert.rejects(client.query('DELETE FROM "SubscriptionPlan"'), {
      code: "55000",
    });
    await assert.rejects(client.query('TRUNCATE "SubscriptionPlan" CASCADE'), {
      code: "55000",
    });
    assert.deepEqual(await rows(client), original);
  },
);

physical(
  "seed PostgreSQL: a concurrent insert after preflight cannot be overwritten, including on retry",
  async (t) => {
    const { client, schema, parsed } = await fixture(t);
    await installPendingPlanSeedGuard(client, schema);
    const writer = new Client({ connectionString: parsed.toString() });
    await writer.connect();
    try {
      await writer.query(`SET search_path TO "${schema}", pg_catalog`);
      await writer.query(`INSERT INTO "SubscriptionPlan" (id,name,code,description,"maxUsers","maxVoters","maxStorageMb","monthlyPriceCop","yearlyPriceCop","updatedAt")
      VALUES ('seed-subscription-plan-free-v1','Acuerdo concurrente','FREE','Original',7,700,70,700,8400,CURRENT_TIMESTAMP)`);
      const original = await rows(client);
      await assert.rejects(client.query(seedSql), { code: "55000" });
      assert.deepEqual(await rows(client), original);
      await assert.rejects(
        installPendingPlanSeedGuard(client, schema),
        /identidad y terminos canonicos/,
      );
      await assert.rejects(client.query(seedSql), { code: "55000" });
      assert.deepEqual(await rows(client), original);
    } finally {
      await writer.end();
    }
  },
);

physical(
  "seed PostgreSQL: a writer after preflight cannot change an existing contract",
  async (t) => {
    const { client, schema, parsed } = await fixture(t);
    await client.query(seedSql);
    await installPendingPlanSeedGuard(client, schema);
    const original = await rows(client);
    const writer = new Client({ connectionString: parsed.toString() });
    await writer.connect();
    try {
      await assert.rejects(
        writer.query(
          `UPDATE "${schema}"."SubscriptionPlan" SET "monthlyPriceCop"=1 WHERE code='FREE'`,
        ),
        { code: "55000" },
      );
      await client.query(seedSql);
      assert.deepEqual(await rows(client), original);
    } finally {
      await writer.end();
    }
  },
);

physical(
  "seed PostgreSQL: missing table with completed table migration fails closed",
  async (t) => {
    const { client, schema, environment } = await fixture(t, { fresh: true });
    await assert.rejects(
      prepareSubscriptionPlanSeed({
        client,
        schema,
        environment,
        rows: [
          {
            migration_name: "20260905130000_subscription_plans",
            finished_at: new Date(),
            rolled_back_at: null,
          },
        ],
      }),
      /falta aunque su migracion esta aplicada/,
    );
    assert.equal(
      (
        await client.query(
          "SELECT count(*)::int AS count FROM pg_tables WHERE schemaname=$1",
          [schema],
        )
      ).rows[0].count,
      0,
    );
  },
);

physical(
  "seed PostgreSQL: real guarded Prisma bootstrap records canonical checksums, removes the guard and retries safely",
  async (t) => {
    const { client, schema, environment } = await fixture(t, {
      fresh: true,
      isolatedDatabase: true,
    });
    await runSafeMigrations(environment);
    const original = await rows(client);
    assert.equal(pendingPlanSeedCatalogMatches(original), true);
    assert.equal(original.length, 4);
    const history = await client.query(
      'SELECT checksum, finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name=$1',
      [SUBSCRIPTION_PLAN_SEED_MIGRATION],
    );
    assert.equal(history.rows[0].checksum, SUBSCRIPTION_PLAN_SEED_SHA256);
    assert.ok(history.rows[0].finished_at);
    assert.equal(history.rows[0].rolled_back_at, null);
    const guardCount = await client.query(
      "SELECT count(*)::int AS count FROM pg_trigger WHERE tgrelid=$1::regclass AND tgname LIKE 'SubscriptionPlan_pending_seed%'",
      [`"${schema}"."SubscriptionPlan"`],
    );
    assert.equal(guardCount.rows[0].count, 0);
    await runSafeMigrations(environment);
    assert.deepEqual(await rows(client), original);
  },
);

physical(
  "seed PostgreSQL: the real migration runner rejects custom text after an interrupted prefix",
  async (t) => {
    const { client, schema, environment } = await fixture(t, {
      fresh: true,
      isolatedDatabase: true,
    });
    await deployMigrationPrefix(SUBSCRIPTION_PLAN_SEED_MIGRATION, environment);
    await client.query(seedSql);
    await client.query(
      `UPDATE "SubscriptionPlan" SET name='Contrato anterior' WHERE code='FREE'`,
    );
    const original = await rows(client);
    await assert.rejects(
      runSafeMigrations(environment),
      /identidad y terminos canonicos/,
    );
    assert.deepEqual(await rows(client), original);
    const attempts = await client.query(
      'SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE migration_name=$1',
      [SUBSCRIPTION_PLAN_SEED_MIGRATION],
    );
    assert.equal(
      attempts.rows[0].count,
      0,
      "reject before Prisma writes even a failed seed attempt",
    );
  },
);
