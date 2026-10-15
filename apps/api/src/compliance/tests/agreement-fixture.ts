import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { prisma, withTenantRlsContext } from "@pathway/db";
import { seedE2eAuthUser, seedE2eTypedRole } from "../../../test-helpers.e2e";
import { AppModule } from "../../app.module";
import { SupabaseStorageService } from "../../common/storage/supabase-storage.service";
export async function agreementFixture() {
  const orgId = randomUUID(),
    siteId = randomUUID(),
    otherSiteId = randomUUID(),
    foreignOrgId = randomUUID(),
    foreignSiteId = randomUUID();
  for (const id of [orgId, foreignOrgId]) {
    await prisma.org.create({
      data: {
        id,
        name: "Agreement test",
        slug: `agreement-${id}`,
        planCode: "trial",
      },
    });
    await prisma.orgVertical.create({
      data: { orgId: id, vertical: "ACE_LEARNING_CENTRE" },
    });
  }
  await prisma.tenant.createMany({
    data: [siteId, otherSiteId, foreignSiteId].map((id) => ({
      id,
      orgId: id === foreignSiteId ? foreignOrgId : orgId,
      name: "Agreement site",
      slug: `agreement-${id}`,
      timezone: "Europe/London",
    })),
  });
  async function user(
    tenantId: string,
    permissions: readonly (
      | "compliance.agreements.read"
      | "compliance.agreements.manage"
    )[] = [],
  ) {
    const userId = randomUUID(),
      userOrgId = tenantId === foreignSiteId ? foreignOrgId : orgId;
    const auth = await seedE2eAuthUser({
      subject: `agreement-${userId}`,
      userId,
      tenantId,
      orgId: userOrgId,
      siteRole: "STAFF",
      orgRole: "ORG_MEMBER",
      name: "Agreement adult",
    });
    if (permissions.length)
      await seedE2eTypedRole({
        orgId: userOrgId,
        tenantId,
        userId,
        scope: "site",
        permissionKeys: permissions,
      });
    return auth;
  }
  const manager = await user(siteId, [
      "compliance.agreements.read",
      "compliance.agreements.manage",
    ]),
    reader = await user(siteId, ["compliance.agreements.read"]),
    recipient = await user(siteId),
    stranger = await user(siteId),
    minor = await user(siteId),
    linkedMinor = await user(siteId),
    otherManager = await user(otherSiteId, [
      "compliance.agreements.read",
      "compliance.agreements.manage",
    ]),
    foreignManager = await user(foreignSiteId, [
      "compliance.agreements.read",
      "compliance.agreements.manage",
    ]);
  await prisma.user.update({
    where: { id: minor.userId },
    data: { dateOfBirth: new Date("2020-01-01") },
  });
  await withTenantRlsContext(siteId, orgId, async (tx) => {
    await tx.studentPortalPolicy.create({
      data: { tenantId: siteId, studentPortalEnabled: true },
    });
    const child = await tx.child.create({
      data: {
        tenantId: siteId,
        firstName: "Linked",
        lastName: "Minor",
        dateOfBirth: new Date("2020-01-01"),
      },
    });
    const identity = await tx.studentIdentity.create({
      data: { tenantId: siteId, userId: linkedMinor.userId },
    });
    await tx.studentIdentityLink.create({
      data: {
        tenantId: siteId,
        studentIdentityId: identity.id,
        childId: child.id,
      },
    });
  });
  const objects = new Map<string, Buffer>();
  const upload = jest.fn(async (input: { key: string; body: Buffer }) => {
    objects.set(input.key, input.body);
    return { bucket: "agreement-private", key: input.key };
  });
  const download = jest.fn(
    async (_bucket: string, key: string) => objects.get(key) ?? null,
  );
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SupabaseStorageService)
    .useValue({ uploadObject: upload, downloadObject: download })
    .compile();
  const app = module.createNestApplication();
  await app.init();
  return {
    app,
    orgId,
    siteId,
    otherSiteId,
    foreignOrgId,
    foreignSiteId,
    manager,
    reader,
    recipient,
    stranger,
    minor,
    linkedMinor,
    otherManager,
    foreignManager,
    objects,
    upload,
    download,
    user,
  };
}
export type AgreementFixture = Awaited<ReturnType<typeof agreementFixture>>;
