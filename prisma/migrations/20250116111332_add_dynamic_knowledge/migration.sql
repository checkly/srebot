-- CreateTable
CREATE TABLE "DynamicKnowledge" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DynamicKnowledge_pkey" PRIMARY KEY ("id")
);
