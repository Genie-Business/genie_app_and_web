-- DropForeignKey
ALTER TABLE "PaymentIntent" DROP CONSTRAINT "PaymentIntent_userId_fkey";

-- AlterTable: PaymentIntent may now be a guest checkout (no genie account)
ALTER TABLE "PaymentIntent"
  ALTER COLUMN "userId" DROP NOT NULL,
  ADD COLUMN "guestName" TEXT,
  ADD COLUMN "guestEmail" TEXT,
  ADD COLUMN "guestPhone" TEXT;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: remember a guest gifter's name for the reveal
ALTER TABLE "Gift" ADD COLUMN "giftedByName" TEXT;
