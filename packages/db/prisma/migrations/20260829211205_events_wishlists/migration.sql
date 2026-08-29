-- DropIndex
DROP INDEX "Event_userId_name_key";

-- CreateIndex
CREATE INDEX "Event_userId_name_idx" ON "Event"("userId", "name");
