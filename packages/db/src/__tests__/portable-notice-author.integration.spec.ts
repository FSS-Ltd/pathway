import { randomUUID } from "node:crypto";
import { applyTenantContext, prisma, type Prisma } from "../index";

const describeIfDb =
  process.env.PATHWAY_RUN_DB_INTEGRATION_TESTS === "1"
    ? describe
    : describe.skip;

async function seedNoticeUsers(
  tx: Prisma.TransactionClient,
  orgId: string,
  tenantId: string,
  userIds: string[],
): Promise<void> {
  await tx.org.create({
    data: {
      id: orgId,
      name: "Notice author lifecycle probe",
      slug: `notice-author-${orgId}`,
      planCode: "trial",
    },
  });
  await tx.tenant.create({
    data: {
      id: tenantId,
      orgId,
      name: "Notice author site",
      slug: `notice-author-${tenantId}`,
    },
  });
  await tx.user.createMany({
    data: userIds.map((id) => ({
      id,
      email: `${id}@example.test`,
      tenantId,
    })),
  });
}

describeIfDb("notice author guard in the configured identity schema", () => {
  beforeAll(() => {
    const hostname = new URL(process.env.DATABASE_URL ?? "").hostname;
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      throw new Error(
        "Notice author tests require a disposable local database",
      );
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("allows an issued notice to be withdrawn after its author leaves the site", async () => {
    const rollback = new Error("rollback notice author lifecycle probe");
    const orgId = randomUUID();
    const tenantId = randomUUID();
    const authorId = randomUUID();
    const recipientId = randomUUID();

    await expect(
      prisma.$transaction(
        async (tx) => {
          await seedNoticeUsers(tx, orgId, tenantId, [authorId, recipientId]);
          await tx.siteMembership.createMany({
            data: [authorId, recipientId].map((userId) => ({
              tenantId,
              userId,
            })),
          });
          await applyTenantContext(tx, tenantId, orgId);
          const notice = await tx.aceNotice.create({
            data: {
              tenantId,
              createdByUserId: authorId,
              title: "Site notice",
              body: "Notice for current staff",
              audience: "STAFF",
            },
          });
          await tx.aceNoticeAudienceMember.create({
            data: {
              tenantId,
              noticeId: notice.id,
              recipientUserId: recipientId,
              recipientKind: "STAFF",
            },
          });
          const publishedAt = new Date();
          await tx.aceNotice.update({
            where: { id: notice.id },
            data: { publishedAt },
          });
          await tx.siteMembership.delete({
            where: { tenantId_userId: { tenantId, userId: authorId } },
          });
          const withdrawn = await tx.aceNotice.update({
            where: { id: notice.id },
            data: {
              withdrawnAt: new Date(
                Math.max(Date.now(), publishedAt.getTime()),
              ),
            },
          });
          expect(withdrawn.createdByUserId).toBe(authorId);
          expect(withdrawn.withdrawnAt).not.toBeNull();
          throw rollback;
        },
        { timeout: 30_000 },
      ),
    ).rejects.toBe(rollback);
  });

  it("still rejects a draft author without current site membership", async () => {
    const orgId = randomUUID();
    const tenantId = randomUUID();
    const authorId = randomUUID();

    await expect(
      prisma.$transaction(async (tx) => {
        await seedNoticeUsers(tx, orgId, tenantId, [authorId]);
        await applyTenantContext(tx, tenantId, orgId);
        await tx.aceNotice.create({
          data: {
            tenantId,
            createdByUserId: authorId,
            title: "Invalid draft",
            body: "Author has no site membership",
            audience: "STAFF",
          },
        });
      }),
    ).rejects.toThrow("ACE notice authors require a current site membership");
  });

  it("still rejects a student author with site membership", async () => {
    const orgId = randomUUID();
    const tenantId = randomUUID();
    const authorId = randomUUID();

    await expect(
      prisma.$transaction(async (tx) => {
        await seedNoticeUsers(tx, orgId, tenantId, [authorId]);
        await tx.siteMembership.create({
          data: { tenantId, userId: authorId },
        });
        await tx.studentIdentity.create({
          data: { tenantId, userId: authorId },
        });
        await applyTenantContext(tx, tenantId, orgId);
        await tx.aceNotice.create({
          data: {
            tenantId,
            createdByUserId: authorId,
            title: "Invalid draft",
            body: "Student has site membership",
            audience: "STAFF",
          },
        });
      }),
    ).rejects.toThrow("Students cannot author ACE notices");
  });
});
