-- CreateEnum
CREATE TYPE "ProposalCategory" AS ENUM ('EDUCATION', 'HEALTH', 'INFRASTRUCTURE', 'SECURITY', 'ECONOMY', 'ENVIRONMENT', 'CULTURE', 'SOCIAL', 'GOVERNANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'PROPOSED', 'IN_PROGRESS', 'COMPLETED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "PoliticalProposal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "referenceCode" VARCHAR(20) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "category" "ProposalCategory" NOT NULL,
    "targetGroup" VARCHAR(200),
    "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "territory" VARCHAR(200),
    "estimatedCost" DECIMAL(15,2),
    "sourceUrl" VARCHAR(500),
    "ownerId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PoliticalProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PoliticalProposal_tenantId_category_status_idx" ON "PoliticalProposal"("tenantId", "category", "status");

-- CreateIndex
CREATE INDEX "PoliticalProposal_tenantId_isPublic_idx" ON "PoliticalProposal"("tenantId", "isPublic");

-- CreateIndex
CREATE UNIQUE INDEX "PoliticalProposal_id_tenantId_key" ON "PoliticalProposal"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PoliticalProposal_referenceCode_tenantId_key" ON "PoliticalProposal"("referenceCode", "tenantId");

-- AddForeignKey
ALTER TABLE "PoliticalProposal" ADD CONSTRAINT "PoliticalProposal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoliticalProposal" ADD CONSTRAINT "PoliticalProposal_ownerId_tenantId_fkey" FOREIGN KEY ("ownerId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoliticalProposal" ADD CONSTRAINT "PoliticalProposal_createdById_tenantId_fkey" FOREIGN KEY ("createdById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoliticalProposal" ADD CONSTRAINT "PoliticalProposal_updatedById_tenantId_fkey" FOREIGN KEY ("updatedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
