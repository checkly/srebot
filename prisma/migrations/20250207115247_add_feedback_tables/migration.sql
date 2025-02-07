-- CreateTable
CREATE TABLE "BotResponse" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "slackMessageUrl" TEXT,
    "slackMessageTs" TEXT NOT NULL,
    "alertId" TEXT,
    "releaseId" TEXT,
    "deploymentId" TEXT,

    CONSTRAINT "BotResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "categories" TEXT[],
    "score" INTEGER NOT NULL,
    "botResponseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_botResponseId_key" ON "Feedback"("botResponseId");

-- AddForeignKey
ALTER TABLE "BotResponse" ADD CONSTRAINT "BotResponse_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotResponse" ADD CONSTRAINT "BotResponse_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotResponse" ADD CONSTRAINT "BotResponse_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_botResponseId_fkey" FOREIGN KEY ("botResponseId") REFERENCES "BotResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
