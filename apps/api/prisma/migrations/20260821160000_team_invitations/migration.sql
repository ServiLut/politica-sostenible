CREATE TABLE "TeamInvitation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "invitedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TeamInvitation_tokenHash_key"
ON "TeamInvitation"("tokenHash");

CREATE UNIQUE INDEX "TeamInvitation_id_tenantId_key"
ON "TeamInvitation"("id", "tenantId");

CREATE INDEX "TeamInvitation_tenantId_email_acceptedAt_expiresAt_idx"
ON "TeamInvitation"("tenantId", "email", "acceptedAt", "expiresAt");

CREATE INDEX "TeamInvitation_tenantId_invitedById_createdAt_idx"
ON "TeamInvitation"("tenantId", "invitedById", "createdAt");

ALTER TABLE "TeamInvitation"
ADD CONSTRAINT "TeamInvitation_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TeamInvitation"
ADD CONSTRAINT "TeamInvitation_invitedById_tenantId_fkey"
FOREIGN KEY ("invitedById", "tenantId") REFERENCES "User"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;
