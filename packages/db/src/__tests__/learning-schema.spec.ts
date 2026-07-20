import { randomUUID } from "node:crypto";
import type { PrismaClientType } from "../index";

const describeIfDb =
  process.env.PATHWAY_RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip;

let prisma: PrismaClientType;
let reportBundleStatus: typeof import("../index").ReportBundleStatus;

interface LearningFixtures {
  orgId: string;
  tenantId: string;
  userId: string;
  childId: string;
  subjectId: string;
}

async function createFixtures(label: string): Promise<LearningFixtures> {
  const org = await prisma.org.create({
    data: {
      name: `Learning schema ${label}`,
      slug: `learning-schema-${label}-${randomUUID()}`,
      planCode: "trial",
    },
  });
  const tenant = await prisma.tenant.create({
    data: {
      name: `Learning schema ${label}`,
      slug: `learning-schema-${label}-${randomUUID()}`,
      orgId: org.id,
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `learning-schema-${label}-${randomUUID()}@example.test`,
      name: `Learning schema ${label}`,
      tenantId: tenant.id,
    },
  });
  const child = await prisma.child.create({
    data: {
      firstName: "Learning",
      lastName: label,
      tenantId: tenant.id,
    },
  });
  await prisma.siteMembership.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
    },
  });
  const subject = await prisma.subject.create({
    data: {
      tenantId: tenant.id,
      name: `Subject ${label}`,
    },
  });

  return {
    orgId: org.id,
    tenantId: tenant.id,
    userId: user.id,
    childId: child.id,
    subjectId: subject.id,
  };
}

async function deleteFixtures(fixtures: LearningFixtures): Promise<void> {
  await prisma.reportBundle.deleteMany({
    where: {
      OR: [
        { tenantId: fixtures.tenantId },
        { requestedByUserId: fixtures.userId },
      ],
    },
  });
  await prisma.evidence.deleteMany({
    where: {
      OR: [
        { tenantId: fixtures.tenantId },
        { uploadedByUserId: fixtures.userId },
      ],
    },
  });
  await prisma.learningLog.deleteMany({
    where: {
      OR: [
        { tenantId: fixtures.tenantId },
        { loggedByUserId: fixtures.userId },
      ],
    },
  });
  await prisma.subject.deleteMany({ where: { tenantId: fixtures.tenantId } });
  await prisma.child.deleteMany({ where: { tenantId: fixtures.tenantId } });
  await prisma.userTenantRole.deleteMany({ where: { userId: fixtures.userId } });
  await prisma.siteMembership.deleteMany({
    where: {
      OR: [
        { tenantId: fixtures.tenantId },
        { userId: fixtures.userId },
      ],
    },
  });
  await prisma.user.delete({ where: { id: fixtures.userId } });
  await prisma.tenant.delete({ where: { id: fixtures.tenantId } });
  await prisma.org.delete({ where: { id: fixtures.orgId } });
}

describeIfDb("Learning schema constraints", () => {
  const fixtures: LearningFixtures[] = [];

  beforeAll(async () => {
    const hostname = new URL(process.env.DATABASE_URL ?? "").hostname;
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      throw new Error(
        `Refusing to run: DATABASE_URL host "${hostname}" is not local. ` +
          "Set DATABASE_URL to the docker-compose db before running this suite.",
      );
    }

    const db = await import("../index");
    prisma = db.prisma;
    reportBundleStatus = db.ReportBundleStatus;
  });

  afterEach(async () => {
    for (const fixture of fixtures.splice(0)) {
      await deleteFixtures(fixture);
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("enforces each model's required parent foreign keys", async () => {
    const fixture = await createFixtures("foreign-keys");
    fixtures.push(fixture);

    await expect(
      prisma.subject.create({
        data: { tenantId: randomUUID(), name: "Missing tenant" },
      }),
    ).rejects.toMatchObject({ code: "P2003" });

    await expect(
      prisma.learningLog.create({
        data: {
          tenantId: fixture.tenantId,
          childId: randomUUID(),
          loggedByUserId: fixture.userId,
          activityDate: new Date("2026-07-20"),
          title: "Missing child",
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });

    await expect(
      prisma.learningLog.create({
        data: {
          tenantId: fixture.tenantId,
          childId: fixture.childId,
          subjectId: randomUUID(),
          loggedByUserId: fixture.userId,
          activityDate: new Date("2026-07-20"),
          title: "Missing subject",
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });

    await expect(
      prisma.learningLog.create({
        data: {
          tenantId: fixture.tenantId,
          childId: fixture.childId,
          loggedByUserId: randomUUID(),
          activityDate: new Date("2026-07-20"),
          title: "Missing logging user",
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });

    await expect(
      prisma.evidence.create({
        data: {
          tenantId: fixture.tenantId,
          childId: randomUUID(),
          title: "Missing child",
          storageKey: "learning/test/missing-child.txt",
          mimeType: "text/plain",
          byteSize: 1,
          uploadedByUserId: fixture.userId,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });

    await expect(
      prisma.evidence.create({
        data: {
          tenantId: fixture.tenantId,
          childId: fixture.childId,
          learningLogId: randomUUID(),
          title: "Missing learning log",
          storageKey: "learning/test/missing-log.txt",
          mimeType: "text/plain",
          byteSize: 1,
          uploadedByUserId: fixture.userId,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });

    await expect(
      prisma.evidence.create({
        data: {
          tenantId: fixture.tenantId,
          childId: fixture.childId,
          title: "Missing upload user",
          storageKey: "learning/test/missing-upload-user.txt",
          mimeType: "text/plain",
          byteSize: 1,
          uploadedByUserId: randomUUID(),
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });

    await expect(
      prisma.reportBundle.create({
        data: {
          tenantId: fixture.tenantId,
          requestedByUserId: randomUUID(),
          periodStart: new Date("2026-07-01"),
          periodEnd: new Date("2026-07-20"),
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });

    await expect(
      prisma.reportBundle.create({
        data: {
          tenantId: fixture.tenantId,
          childId: randomUUID(),
          requestedByUserId: fixture.userId,
          periodStart: new Date("2026-07-01"),
          periodEnd: new Date("2026-07-20"),
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("supports every report status, defaults to PENDING, and allows unlinked evidence", async () => {
    const fixture = await createFixtures("states");
    fixtures.push(fixture);

    const evidence = await prisma.evidence.create({
      data: {
        tenantId: fixture.tenantId,
        childId: fixture.childId,
        title: "General work sample",
        storageKey: "learning/test/general-work-sample.txt",
        mimeType: "text/plain",
        byteSize: 1,
        uploadedByUserId: fixture.userId,
      },
    });
    expect(evidence.learningLogId).toBeNull();

    const pendingBundle = await prisma.reportBundle.create({
      data: {
        tenantId: fixture.tenantId,
        childId: fixture.childId,
        requestedByUserId: fixture.userId,
        periodStart: new Date("2026-07-01"),
        periodEnd: new Date("2026-07-20"),
      },
    });
    expect(pendingBundle.status).toBe(reportBundleStatus.PENDING);

    await Promise.all(
      Object.values(reportBundleStatus)
        .filter((status) => status !== reportBundleStatus.PENDING)
        .map((status) =>
          prisma.reportBundle.create({
            data: {
              tenantId: fixture.tenantId,
              requestedByUserId: fixture.userId,
              periodStart: new Date("2026-07-01"),
              periodEnd: new Date("2026-07-20"),
              status,
            },
          }),
        ),
    );

    const statuses = await prisma.reportBundle.findMany({
      where: { tenantId: fixture.tenantId },
      select: { status: true },
    });
    expect(new Set(statuses.map((bundle) => bundle.status))).toEqual(
      new Set(Object.values(reportBundleStatus)),
    );
  });

  it("rejects tenant-scoped links to another tenant's records", async () => {
    const tenantA = await createFixtures("tenant-a");
    const tenantB = await createFixtures("tenant-b");
    fixtures.push(tenantA, tenantB);

    await expect(
      prisma.learningLog.create({
        data: {
          tenantId: tenantA.tenantId,
          childId: tenantB.childId,
          loggedByUserId: tenantA.userId,
          activityDate: new Date("2026-07-20"),
          title: "Cross-tenant learning log",
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("requires learning actors to belong to the active tenant", async () => {
    const tenantA = await createFixtures("membership-a");
    const tenantB = await createFixtures("membership-b");
    fixtures.push(tenantA, tenantB);

    await expect(
      prisma.learningLog.create({
        data: {
          tenantId: tenantB.tenantId,
          childId: tenantB.childId,
          loggedByUserId: tenantA.userId,
          activityDate: new Date("2026-07-20"),
          title: "Unauthorised learning log",
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });

    await expect(
      prisma.evidence.create({
        data: {
          tenantId: tenantB.tenantId,
          childId: tenantB.childId,
          title: "Unauthorised evidence",
          storageKey: "learning/test/unauthorised-evidence.txt",
          mimeType: "text/plain",
          byteSize: 1,
          uploadedByUserId: tenantA.userId,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });

    await expect(
      prisma.reportBundle.create({
        data: {
          tenantId: tenantB.tenantId,
          childId: tenantB.childId,
          requestedByUserId: tenantA.userId,
          periodStart: new Date("2026-07-01"),
          periodEnd: new Date("2026-07-20"),
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("allows multi-site actors through either supported membership model", async () => {
    const tenantA = await createFixtures("multi-site-a");
    const tenantB = await createFixtures("multi-site-b");
    fixtures.push(tenantA, tenantB);

    await prisma.siteMembership.create({
      data: {
        tenantId: tenantB.tenantId,
        userId: tenantA.userId,
      },
    });
    const siteMemberLog = await prisma.learningLog.create({
      data: {
        tenantId: tenantB.tenantId,
        childId: tenantB.childId,
        loggedByUserId: tenantA.userId,
        activityDate: new Date("2026-07-20"),
        title: "Multi-site membership learning log",
      },
    });
    expect(siteMemberLog.loggedByUserId).toBe(tenantA.userId);

    const roleOnlyUser = await prisma.user.create({
      data: {
        email: `learning-schema-role-${randomUUID()}@example.test`,
        name: "Learning schema role member",
        tenantId: tenantA.tenantId,
      },
    });
    let roleMemberLogId: string | undefined;
    try {
      await prisma.userTenantRole.create({
        data: {
          tenantId: tenantB.tenantId,
          userId: roleOnlyUser.id,
          role: "TEACHER",
        },
      });
      const roleMemberLog = await prisma.learningLog.create({
        data: {
          tenantId: tenantB.tenantId,
          childId: tenantB.childId,
          loggedByUserId: roleOnlyUser.id,
          activityDate: new Date("2026-07-20"),
          title: "Role membership learning log",
        },
      });
      roleMemberLogId = roleMemberLog.id;
      expect(roleMemberLog.loggedByUserId).toBe(roleOnlyUser.id);
    } finally {
      if (roleMemberLogId) {
        await prisma.learningLog.delete({ where: { id: roleMemberLogId } });
      }
      await prisma.userTenantRole.deleteMany({
        where: { userId: roleOnlyUser.id },
      });
      await prisma.user.delete({ where: { id: roleOnlyUser.id } });
    }
  });
});
