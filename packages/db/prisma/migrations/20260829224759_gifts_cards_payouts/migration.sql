-- CreateTable
CREATE TABLE "SavedCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'anchor',
    "providerToken" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "brand" TEXT,
    "expMonth" INTEGER,
    "expYear" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedCard_userId_idx" ON "SavedCard"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedCard_userId_providerToken_key" ON "SavedCard"("userId", "providerToken");

-- AddForeignKey
ALTER TABLE "SavedCard" ADD CONSTRAINT "SavedCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
