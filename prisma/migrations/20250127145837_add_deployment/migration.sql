-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL,
    "org" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "repoUrl" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "sha" TEXT NOT NULL,
    "deploymentUrl" TEXT NOT NULL,
    "diffUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawEvent" JSONB NOT NULL,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);
