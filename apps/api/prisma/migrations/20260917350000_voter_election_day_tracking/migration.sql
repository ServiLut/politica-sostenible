-- CreateEnum
CREATE TYPE "VotingStatus" AS ENUM ('PENDING', 'VOTED', 'NEEDS_TRANSPORT', 'NO_SHOW');

-- AlterTable
ALTER TABLE "Voter" ADD COLUMN "votingStatus" "VotingStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "votedAt" TIMESTAMP(3),
ADD COLUMN "votedConfirmedBy" TEXT;

-- CreateIndex
CREATE INDEX "Voter_tenantId_votingStatus_idx" ON "Voter"("tenantId", "votingStatus");
