import { BadRequestException, NotFoundException } from "@nestjs/common";
import { audienceVersion, resolveNoticeAudience } from "../ace-notice-audience";
import { noticeLocalDate } from "../ace-notice-school-audience";

const siteId = "site-a";
const bandId = "3b91e28c-b4e2-478e-96ec-f22643e96791";
const childA = "2cb8861b-e1fc-492d-85d4-d39e6109364c";
const childB = "d92aa53b-94bf-4967-bc3b-f25493930ba6";
const now = new Date("2026-10-10T12:00:00.000Z");

function transaction() {
  return {
    tenant: { findFirst: jest.fn().mockResolvedValue({ id: siteId }) },
    aceYearBand: { findFirst: jest.fn().mockResolvedValue({ id: bandId }) },
    aceSchoolEnrollment: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ childId: childA }, { childId: childB }]),
    },
    group: { findFirst: jest.fn().mockResolvedValue({ id: bandId }) },
    child: {
      findFirst: jest.fn().mockResolvedValue({ id: childA }),
      findMany: jest.fn().mockResolvedValue([{ id: childA }]),
    },
    aceStaffYearBandAssignment: {
      findMany: jest.fn().mockResolvedValue([{ userId: "staff-a" }]),
    },
    siteMembership: {
      findMany: jest.fn().mockResolvedValue([{ userId: "staff-a" }]),
    },
    permissionDefinition: {
      findUnique: jest.fn().mockResolvedValue({ isActive: true }),
    },
    guardianChildRelationship: {
      findMany: jest.fn().mockResolvedValue([
        {
          childId: childA,
          guardianIdentity: { id: "guardian-id", userId: "parent-a" },
        },
        {
          childId: childB,
          guardianIdentity: { id: "guardian-id", userId: "parent-a" },
        },
      ]),
    },
  };
}

describe("school notice audience resolution", () => {
  it("uses the school's local date for current enrolment and assignments", () => {
    expect(
      noticeLocalDate(
        new Date("2026-07-01T23:30:00.000Z"),
        "Europe/London",
      ).toISOString(),
    ).toBe("2026-07-02T00:00:00.000Z");
  });
  it("freezes current class staff and eligible guardians with their target children", async () => {
    const tx = transaction();
    const target = {
      audienceScope: "YEAR_BAND" as const,
      audienceTargetId: bandId,
    };
    const recipients = await resolveNoticeAudience(
      tx as never,
      siteId,
      "PARENTS_AND_STAFF",
      true,
      now,
      target,
    );

    expect(recipients).toEqual([
      {
        recipientUserId: "parent-a",
        recipientKind: "GUARDIAN",
        guardianIdentityId: "guardian-id",
        targetedChildIds: [childA, childB].sort(),
      },
      {
        recipientUserId: "staff-a",
        recipientKind: "STAFF",
        guardianIdentityId: null,
      },
    ]);
    expect(tx.aceSchoolEnrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: siteId,
          yearBandId: bandId,
        }),
      }),
    );
    expect(tx.guardianChildRelationship.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: siteId,
          childId: { in: [childA, childB] },
          legalAccess: "FULL",
          endedAt: null,
          revokedAt: null,
        }),
      }),
    );
    expect(audienceVersion(siteId, "notice-a", recipients)).not.toBe(
      audienceVersion(siteId, "notice-a", [
        { ...recipients[0], targetedChildIds: [childA] },
        recipients[1],
      ]),
    );
  });

  it("uses only the selected group's current child roster for guardian delivery", async () => {
    const tx = transaction();
    const recipients = await resolveNoticeAudience(
      tx as never,
      siteId,
      "PARENTS",
      true,
      now,
      { audienceScope: "GROUP", audienceTargetId: bandId },
    );
    expect(tx.child.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: siteId, groupId: bandId, isGuest: false },
      }),
    );
    expect(tx.aceStaffYearBandAssignment.findMany).not.toHaveBeenCalled();
    expect(recipients).toHaveLength(1);
    expect(recipients[0].recipientKind).toBe("GUARDIAN");
  });

  it("rejects a non-ACE site, a foreign target, and staff delivery to one child", async () => {
    const tx = transaction();
    tx.tenant.findFirst.mockResolvedValueOnce(null);
    await expect(
      resolveNoticeAudience(tx as never, siteId, "PARENTS", true, now, {
        audienceScope: "CHILD",
        audienceTargetId: childA,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    tx.child.findFirst.mockResolvedValueOnce(null);
    await expect(
      resolveNoticeAudience(tx as never, siteId, "PARENTS", true, now, {
        audienceScope: "CHILD",
        audienceTargetId: childA,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      resolveNoticeAudience(tx as never, siteId, "STAFF", true, now, {
        audienceScope: "CHILD",
        audienceTargetId: childA,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
