BEGIN;

ALTER TABLE "User"
ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastTotpTimeStep" INTEGER;

ALTER TABLE "User"
ADD CONSTRAINT "User_authVersion_non_negative_check"
CHECK ("authVersion" >= 0),
ADD CONSTRAINT "User_lastTotpTimeStep_non_negative_check"
CHECK ("lastTotpTimeStep" IS NULL OR "lastTotpTimeStep" >= 0);

COMMIT;
