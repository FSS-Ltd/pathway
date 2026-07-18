-- CreateTable
CREATE TABLE "OrgVertical" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "vertical" "Vertical" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgVertical_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgModule" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "module" "Module" NOT NULL,
    "status" "ModuleStatus" NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgModule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgVertical_orgId_key" ON "OrgVertical"("orgId");

-- CreateIndex
CREATE INDEX "OrgModule_orgId_idx" ON "OrgModule"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgModule_orgId_module_key" ON "OrgModule"("orgId", "module");

-- AddForeignKey
ALTER TABLE "OrgVertical" ADD CONSTRAINT "OrgVertical_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgModule" ADD CONSTRAINT "OrgModule_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
