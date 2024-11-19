-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "context" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);
