/*
  Warnings:

  - You are about to drop the column `context` on the `Alert` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "Source" AS ENUM ('custom', 'checkly', 'github');

-- AlterTable
ALTER TABLE "Alert" DROP COLUMN "context";

-- CreateTable
CREATE TABLE "AlertContext" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "source" "Source" NOT NULL DEFAULT 'custom',
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertContext_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AlertContext" ADD CONSTRAINT "AlertContext_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
