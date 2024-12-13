-- CreateTable
CREATE TABLE "Release" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "org" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "repoUrl" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "releaseUrl" TEXT NOT NULL,
    "diffUrl" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "authors" TEXT[],
    "summary" TEXT NOT NULL,

    CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);
