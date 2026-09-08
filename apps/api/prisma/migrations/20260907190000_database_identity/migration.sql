-- A singleton, database-generated identity lets the deploy guard prove that
-- DIRECT_URL and DATABASE_URL reach the same application database even when a
-- pooler gives them different hostnames. It is system metadata, not tenant data.
BEGIN;

CREATE TABLE "SystemDatabaseIdentity" (
    "id" VARCHAR(32) NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemDatabaseIdentity_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SystemDatabaseIdentity_singleton_check" CHECK ("id" = 'primary')
);

CREATE UNIQUE INDEX "SystemDatabaseIdentity_fingerprint_key"
ON "SystemDatabaseIdentity"("fingerprint");

INSERT INTO "SystemDatabaseIdentity" ("id", "fingerprint")
VALUES (
    'primary',
    md5(
        random()::text
        || clock_timestamp()::text
        || pg_backend_pid()::text
        || current_database()
    )
);

COMMIT;
