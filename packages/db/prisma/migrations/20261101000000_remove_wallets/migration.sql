-- genie no longer holds money for users: payments go through Paystack and merchants are paid
-- from orders after delivery. Nothing references wallets any more (production holds two empty
-- wallet rows, no ledger entries and no transactions).

-- DropForeignKey
ALTER TABLE "WalletAccount" DROP CONSTRAINT "WalletAccount_userId_fkey";
-- DropForeignKey
ALTER TABLE "LedgerEntry" DROP CONSTRAINT "LedgerEntry_walletId_fkey";
-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_walletId_fkey";
-- DropIndex
DROP INDEX "Transaction_walletId_idx";
-- AlterTable
ALTER TABLE "Transaction" DROP COLUMN "walletId";
-- DropTable
DROP TABLE "WalletAccount";
-- DropTable
DROP TABLE "LedgerEntry";
-- DropEnum
DROP TYPE "WalletStatus";
-- DropEnum
DROP TYPE "LedgerDirection";
-- DropEnum
DROP TYPE "LedgerReason";
