-- CreateTable
CREATE TABLE "AutomationApiToken" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "AutomationApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationBlogPublishAudit" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "tokenName" TEXT NOT NULL,
    "blogPostId" TEXT NOT NULL,
    "blogSlug" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationBlogPublishAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AutomationApiToken_tokenHash_key" ON "AutomationApiToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AutomationApiToken_revokedAt_expiresAt_idx" ON "AutomationApiToken"("revokedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "AutomationApiToken_createdAt_idx" ON "AutomationApiToken"("createdAt");

-- CreateIndex
CREATE INDEX "AutomationBlogPublishAudit_tokenId_createdAt_idx" ON "AutomationBlogPublishAudit"("tokenId", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationBlogPublishAudit_blogPostId_idx" ON "AutomationBlogPublishAudit"("blogPostId");

-- AddForeignKey
ALTER TABLE "AutomationBlogPublishAudit" ADD CONSTRAINT "AutomationBlogPublishAudit_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "AutomationApiToken"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
