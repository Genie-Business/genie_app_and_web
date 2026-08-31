-- CreateEnum
CREATE TYPE "EventRecurrence" AS ENUM ('ONE_OFF', 'ANNUAL');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "recurrence" "EventRecurrence" NOT NULL DEFAULT 'ONE_OFF';
