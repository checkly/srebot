-- CreateTable
CREATE TABLE "RawRelease" (
    "id" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "releaseId" TEXT NOT NULL,

    CONSTRAINT "RawRelease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RawRelease_releaseId_key" ON "RawRelease"("releaseId");

-- AddForeignKey
ALTER TABLE "RawRelease" ADD CONSTRAINT "RawRelease_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;
