-- CreateTable
CREATE TABLE "UserContext" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,

    CONSTRAINT "UserContext_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserContext_username_key" ON "UserContext"("username");
