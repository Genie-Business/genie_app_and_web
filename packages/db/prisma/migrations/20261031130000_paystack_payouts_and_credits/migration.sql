-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "merchantNetKobo" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "payoutId" TEXT;
-- AlterTable
ALTER TABLE "PaymentIntent" ADD COLUMN     "checkoutUrl" TEXT,
ADD COLUMN     "discountKobo" BIGINT NOT NULL DEFAULT 0;
-- CreateTable
CREATE TABLE "DiscountCredit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountKobo" BIGINT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'REFERRAL',
    "referralId" TEXT,
    "reservedIntentId" TEXT,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiscountCredit_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "DiscountCredit_userId_usedAt_idx" ON "DiscountCredit"("userId", "usedAt");
-- CreateIndex
CREATE UNIQUE INDEX "DiscountCredit_referralId_userId_key" ON "DiscountCredit"("referralId", "userId");
-- CreateIndex
CREATE INDEX "Order_payoutId_idx" ON "Order"("payoutId");
-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "DiscountCredit" ADD CONSTRAINT "DiscountCredit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: what each existing order owes its merchant (subtotal minus commission).
UPDATE "Order" SET "merchantNetKobo" = "subtotalKobo" - "commissionKobo" WHERE "merchantNetKobo" = 0;
