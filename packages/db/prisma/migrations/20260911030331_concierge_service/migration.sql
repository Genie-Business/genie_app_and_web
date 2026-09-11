-- CreateEnum
CREATE TYPE "ConciergeRequestStatus" AS ENUM ('NEW', 'IN_REVIEW', 'ACTIVE', 'REJECTED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "AdminRole" ADD VALUE 'CONCIERGE';

-- DropForeignKey
ALTER TABLE "PaymentIntent" DROP CONSTRAINT "PaymentIntent_userId_fkey";

-- CreateTable
CREATE TABLE "ConciergeRequest" (
    "id" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "wishlistItemId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "estimatedPriceKobo" BIGINT,
    "status" "ConciergeRequestStatus" NOT NULL DEFAULT 'NEW',
    "productId" TEXT NOT NULL,
    "claimedByAdminId" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConciergeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConciergeRequest_wishlistItemId_key" ON "ConciergeRequest"("wishlistItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ConciergeRequest_productId_key" ON "ConciergeRequest"("productId");

-- CreateIndex
CREATE INDEX "ConciergeRequest_status_idx" ON "ConciergeRequest"("status");

-- CreateIndex
CREATE INDEX "ConciergeRequest_requestedByUserId_idx" ON "ConciergeRequest"("requestedByUserId");

-- AddForeignKey
ALTER TABLE "ConciergeRequest" ADD CONSTRAINT "ConciergeRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConciergeRequest" ADD CONSTRAINT "ConciergeRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
