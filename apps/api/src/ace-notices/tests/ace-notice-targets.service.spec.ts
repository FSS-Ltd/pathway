import { withTenantRlsContext } from "@pathway/db";
import { AceNoticeTargetsService } from "../ace-notice-targets.service";

jest.mock("@pathway/db", () => ({ withTenantRlsContext: jest.fn() }));

const actor = { tenantId: "site-a", orgId: "org-a", userId: "manager-a" };

function setup(vertical: string | null = "ACE_SCHOOL") {
  const tx = {
    tenant: {
      findFirst: jest.fn().mockResolvedValue({
        org: { parentPortalEnabled: true, orgVertical: { vertical } },
      }),
    },
    siteMembership: {
      findFirst: jest.fn().mockResolvedValue({ id: "member-a" }),
    },
    studentIdentity: { findFirst: jest.fn().mockResolvedValue(null) },
    aceYearBand: {
      findMany: jest.fn().mockResolvedValue([{ id: "band-a", name: "Year 4" }]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    group: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
    child: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
  };
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_site, _org, fn) => fn(tx as never));
  return { service: new AceNoticeTargetsService(), tx };
}

describe("AceNoticeTargetsService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns bounded active year bands from the selected ACE site", async () => {
    const { service, tx } = setup();
    await expect(
      service.list(
        { scope: "YEAR_BAND", search: "Year", selectedId: undefined },
        actor,
      ),
    ).resolves.toEqual({
      available: true,
      items: [{ id: "band-a", label: "Year 4" }],
    });
    expect(withTenantRlsContext).toHaveBeenCalledWith(
      actor.tenantId,
      actor.orgId,
      expect.any(Function),
    );
    expect(tx.aceYearBand.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: actor.tenantId,
          isActive: true,
        }),
        take: 25,
      }),
    );
  });

  it("does not expose school targets to another site model", async () => {
    const { service, tx } = setup("CLUB");
    await expect(
      service.list(
        { scope: "YEAR_BAND", search: "", selectedId: undefined },
        actor,
      ),
    ).resolves.toEqual({ available: false, items: [] });
    expect(tx.aceYearBand.findMany).not.toHaveBeenCalled();
  });

  it("never includes a selected child from another site", async () => {
    const { service, tx } = setup();
    tx.child.findFirst.mockResolvedValue(null);
    await expect(
      service.list(
        { scope: "CHILD", search: "Ada", selectedId: "foreign-id" },
        actor,
      ),
    ).resolves.toEqual({ available: true, items: [] });
    expect(tx.child.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "foreign-id", tenantId: actor.tenantId, isGuest: false },
      }),
    );
  });
});
