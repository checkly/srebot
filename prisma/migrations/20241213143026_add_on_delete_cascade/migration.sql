-- DropForeignKey
ALTER TABLE "AlertContext" DROP CONSTRAINT "AlertContext_alertId_fkey";

-- AddForeignKey
ALTER TABLE "AlertContext" ADD CONSTRAINT "AlertContext_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
