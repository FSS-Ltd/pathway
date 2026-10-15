import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { prisma } from "@pathway/db";
import { seedE2eAuthUser, seedE2eTypedRole } from "../../../test-helpers.e2e";
import { AppModule } from "../../app.module";
import { SupabaseStorageService } from "../../common/storage/supabase-storage.service";
import { TrackerCatalogueService } from "../catalogue/catalogue.service";
import { TrackerProfileService } from "../tracker-profile.service";
import { testProfile, trackerFixture } from "./tracker-fixture";

export async function trackerEvidenceFixture() {
  const orgId = randomUUID(),
    siteId = randomUUID(),
    otherSiteId = randomUUID(),
    foreignOrgId = randomUUID(),
    foreignSiteId = randomUUID();
  for (const id of [orgId, foreignOrgId]) {
    await prisma.org.create({
      data: {
        id,
        name: "Evidence test",
        slug: `evidence-${id}`,
        planCode: "trial",
      },
    });
    await prisma.orgVertical.create({
      data: { orgId: id, vertical: "ACE_SCHOOL" },
    });
  }
  await prisma.tenant.createMany({
    data: [siteId, otherSiteId, foreignSiteId].map((id) => ({
      id,
      orgId: id === foreignSiteId ? foreignOrgId : orgId,
      name: "Evidence site",
      slug: `evidence-${id}`,
      timezone: "Europe/London",
    })),
  });
  async function user(tenantId: string, permissionKeys: string[]) {
    const userId = randomUUID(),
      scopeOrg = tenantId === foreignSiteId ? foreignOrgId : orgId;
    const auth = await seedE2eAuthUser({
      subject: `evidence-${userId}`,
      userId,
      tenantId,
      orgId: scopeOrg,
      siteRole: "STAFF",
      orgRole: "ORG_MEMBER",
      name: "Evidence tester",
    });
    if (permissionKeys.length)
      await seedE2eTypedRole({
        orgId: scopeOrg,
        tenantId,
        userId,
        scope: "site",
        permissionKeys,
      });
    return { ...auth, userId };
  }
  const manager = await user(siteId, [
    "compliance.tracker.read",
    "compliance.tracker.manage",
  ]);
  const reader = await user(siteId, ["compliance.tracker.read"]);
  const ordinary = await user(siteId, []);
  const other = await user(otherSiteId, [
    "compliance.tracker.read",
    "compliance.tracker.manage",
  ]);
  const foreign = await user(foreignSiteId, [
    "compliance.tracker.read",
    "compliance.tracker.manage",
  ]);
  const objects = new Map<string, Buffer>();
  const upload = jest.fn(
    async (input: {
      bucket: string;
      key: string;
      body: Buffer;
      contentType: string;
    }) => {
      objects.set(input.key, Buffer.from(input.body));
      return { bucket: input.bucket, key: input.key };
    },
  );
  const download = jest.fn(
    async (_bucket: string, key: string) => objects.get(key) ?? null,
  );
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TrackerCatalogueService)
    .useValue({ catalogue: trackerFixture() })
    .overrideProvider(SupabaseStorageService)
    .useValue({
      uploadObject: upload,
      downloadObject: download,
      isConfigured: () => true,
    })
    .compile();
  const app = module.createNestApplication();
  await app.init();
  await app
    .get(TrackerProfileService)
    .save(
      { orgId, tenantId: siteId, userId: manager.userId },
      { expectedVersion: 0, profile: testProfile },
    );
  return {
    app,
    orgId,
    siteId,
    manager,
    reader,
    ordinary,
    other,
    foreign,
    user,
    objects,
    upload,
    download,
  };
}
export type TrackerEvidenceFixture = Awaited<
  ReturnType<typeof trackerEvidenceFixture>
>;
