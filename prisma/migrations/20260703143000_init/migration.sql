-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" DATETIME,
    "image" TEXT
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SplitRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sourcePlaylistId" TEXT NOT NULL,
    "sourcePlaylistName" TEXT NOT NULL,
    "prompt" TEXT,
    "mode" TEXT NOT NULL,
    "duplicatePolicy" TEXT NOT NULL,
    "playlistPrefix" TEXT NOT NULL DEFAULT 'Splitify - ',
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SplitRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SplitCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "splitRunId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL,
    "spotifyPlaylistId" TEXT,
    "spotifyUrl" TEXT,
    CONSTRAINT "SplitCategory_splitRunId_fkey" FOREIGN KEY ("splitRunId") REFERENCES "SplitRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SplitAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "splitRunId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "trackUri" TEXT NOT NULL,
    "trackName" TEXT NOT NULL,
    "artists" TEXT NOT NULL,
    "album" TEXT,
    "durationMs" INTEGER,
    "sourceOrder" INTEGER NOT NULL,
    "categoryOrder" INTEGER NOT NULL,
    "trackMetadata" TEXT NOT NULL,
    CONSTRAINT "SplitAssignment_splitRunId_fkey" FOREIGN KEY ("splitRunId") REFERENCES "SplitRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SplitAssignment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SplitCategory" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "SplitRun_userId_createdAt_idx" ON "SplitRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SplitCategory_splitRunId_order_idx" ON "SplitCategory"("splitRunId", "order");

-- CreateIndex
CREATE INDEX "SplitAssignment_splitRunId_sourceOrder_idx" ON "SplitAssignment"("splitRunId", "sourceOrder");

-- CreateIndex
CREATE INDEX "SplitAssignment_categoryId_categoryOrder_idx" ON "SplitAssignment"("categoryId", "categoryOrder");
