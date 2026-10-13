const siteFindFirst = jest.fn();
const childFindFirst = jest.fn();
const relationshipFindFirst = jest.fn();
const studentFindUnique = jest.fn();
const enrollmentFindFirst = jest.fn();
const yearFindFirst = jest.fn();
const tx = {
  child: { findFirst: childFindFirst },
  guardianChildRelationship: { findFirst: relationshipFindFirst },
  studentIdentity: { findUnique: studentFindUnique },
  aceSchoolEnrollment: { findFirst: enrollmentFindFirst },
  academicYear: { findFirst: yearFindFirst },
};

jest.mock("@pathway/db", () => ({
  prisma: { tenant: { findFirst: siteFindFirst } },
  withTenantRlsContext: jest.fn(
    (_siteId: string, _orgId: string, read: (client: typeof tx) => unknown) =>
      read(tx),
  ),
}));

jest.mock("../student-overview-sections", () => ({
  readOverviewSection: jest.fn(
    async (_name: string, read: () => Promise<unknown>) => {
      try {
        return await read();
      } catch {
        return { status: "error" };
      }
    },
  ),
  readAttendance: jest.fn(async () => ({ status: "empty" })),
  readAcademics: jest.fn(async () => ({ status: "empty" })),
  readPace: jest.fn(async () => ({ status: "empty" })),
  readBehaviour: jest.fn(async () => ({
    behaviour: { status: "empty" },
    merits: { status: "empty" },
  })),
  readDiscipline: jest.fn(async () => ({ status: "empty" })),
}));

import { NotFoundException } from "@nestjs/common";
import type { EffectivePermissionsService } from "../../access-control/effective-permissions.service";
import { StudentOverviewService } from "../student-overview.service";

const child = {
  id: "child-a",
  firstName: "Ava",
  lastName: "Brown",
  preferredName: null,
  yearGroup: "Y7",
  group: { name: "Falcon" },
};
const site = {
  id: "site-a",
  orgId: "org-a",
  timezone: "Europe/London",
  org: {
    sector: "SCHOOL",
    parentPortalEnabled: true,
    orgVertical: { vertical: "ACE_SCHOOL" },
  },
};

describe("StudentOverviewService", () => {
  const listForUser = jest.fn();
  let service: StudentOverviewService;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ACE_FAMILY_FACADE_ATTENDANCE_ENABLED;
    siteFindFirst.mockResolvedValue(site);
    childFindFirst.mockResolvedValue(child);
    relationshipFindFirst.mockResolvedValue({ child });
    studentFindUnique.mockResolvedValue(null);
    enrollmentFindFirst.mockResolvedValue({ id: "enrolment-a" });
    yearFindFirst.mockResolvedValue(null);
    listForUser.mockResolvedValue(["ace.parent.progress.read"]);
    service = new StudentOverviewService({
      listForUser,
    } as unknown as EffectivePermissionsService);
  });

  it("denies an unlinked or cross-site child before reading any summary", async () => {
    relationshipFindFirst.mockResolvedValue(null);
    await expect(
      service.parent("site-a", "other-child", "guardian-a"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(relationshipFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "site-a",
          childId: "other-child",
          legalAccess: "FULL",
          endedAt: null,
          revokedAt: null,
          guardianIdentity: expect.objectContaining({ userId: "guardian-a" }),
        }),
      }),
    );
    expect(listForUser).not.toHaveBeenCalled();
  });

  it("shows the generic parent identity and attendance without ACE tabs", async () => {
    siteFindFirst.mockResolvedValue({
      ...site,
      org: { ...site.org, sector: "CLUB", orgVertical: { vertical: "CLUB" } },
    });
    const response = await service.parent("site-a", "child-a", "guardian-a");
    expect(response.tabs).toEqual(["overview", "attendance"]);
    expect(response.identity.status).toBe("unknown");
    expect(response.actions).toEqual([]);
  });

  it("shows ACE family progress only with current enrollment and permission", async () => {
    const response = await service.parent("site-a", "child-a", "guardian-a");
    expect(response.tabs).toEqual([
      "overview",
      "attendance",
      "pace",
      "behaviour",
      "merits",
    ]);
    expect(response.actions).toEqual([]);
    expect(response.tabs).not.toContain("academics");
    expect(response.tabs).not.toContain("notes");
    expect(relationshipFindFirst).toHaveBeenCalledTimes(2);
  });

  it("hides ACE family progress from a same-site student identity", async () => {
    studentFindUnique.mockResolvedValue({ id: "student-a" });
    const response = await service.parent("site-a", "child-a", "guardian-a");
    expect(response.tabs).toEqual(["overview", "attendance"]);
    expect(response.sections.pace.status).toBe("unavailable");
    expect(response.sections.behaviour.status).toBe("unavailable");
  });

  it("hides ACE family progress when the active enrollment has ended", async () => {
    enrollmentFindFirst.mockResolvedValue(null);
    const response = await service.parent("site-a", "child-a", "guardian-a");
    expect(response.tabs).toEqual(["overview", "attendance"]);
  });

  it("hides ACE family progress when the permission is absent", async () => {
    listForUser.mockResolvedValue([]);
    const response = await service.parent("site-a", "child-a", "guardian-a");
    expect(response.tabs).toEqual(["overview", "attendance"]);
    expect(response.sections.pace.status).toBe("unavailable");
  });

  it("respects the ACE family attendance release switch", async () => {
    process.env.ACE_FAMILY_FACADE_ATTENDANCE_ENABLED = "false";
    const response = await service.parent("site-a", "child-a", "guardian-a");
    expect(response.tabs).not.toContain("attendance");
    expect(response.sections.attendance.status).toBe("unavailable");
  });

  it("preserves identity and other sections when optional PACE loading fails", async () => {
    const sections = jest.requireMock("../student-overview-sections") as {
      readPace: jest.Mock;
    };
    sections.readPace.mockRejectedValueOnce(new Error("temporary failure"));
    const response = await service.parent("site-a", "child-a", "guardian-a");
    expect(response.identity.id).toBe("child-a");
    expect(response.sections.pace.status).toBe("error");
    expect(response.sections.attendance.status).toBe("empty");
  });

  it("scopes staff site lookup and child read to the active org and site", async () => {
    listForUser.mockResolvedValue(["attendance.read", "ace.pace.read"]);
    const response = await service.staff("child-a", {
      siteId: "site-a",
      orgId: "org-a",
      userId: "staff-a",
      isSiteAdmin: false,
    });
    expect(siteFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "site-a", orgId: "org-a" } }),
    );
    expect(childFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "child-a", tenantId: "site-a", isGuest: false },
      }),
    );
    expect(response.tabs).toContain("pace");
    expect(response.tabs).not.toContain("behaviour");
  });
});
