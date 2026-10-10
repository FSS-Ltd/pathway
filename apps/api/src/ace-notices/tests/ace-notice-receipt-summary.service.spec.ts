import { NotFoundException } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { AceNoticeReceiptSummaryService } from "../ace-notice-receipt-summary.service";

jest.mock("@pathway/db", () => ({ withTenantRlsContext: jest.fn() }));

const actor = { tenantId: "site-a", orgId: "org-a", userId: "staff-a" };

function setup() {
  const tx = {
    tenant: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ org: { parentPortalEnabled: true } }),
    },
    siteMembership: {
      findFirst: jest.fn().mockResolvedValue({ id: "member-a" }),
    },
    studentIdentity: { findFirst: jest.fn().mockResolvedValue(null) },
    aceNotice: {
      findFirst: jest.fn().mockResolvedValue({ requiresAcknowledgement: true }),
    },
    aceNoticeAudienceMember: { count: jest.fn().mockResolvedValue(3) },
    aceNoticeReceipt: {
      count: jest
        .fn()
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1),
    },
  };
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_site, _org, fn) => fn(tx as never));
  return { service: new AceNoticeReceiptSummaryService(), tx };
}

describe("AceNoticeReceiptSummaryService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns only aggregate receipt counts for the active site's publication", async () => {
    const { service, tx } = setup();
    await expect(service.get("notice-a", actor)).resolves.toEqual({
      recipientCount: 3,
      deliveredCount: 3,
      readCount: 2,
      acknowledgedCount: 1,
      requiresAcknowledgement: true,
    });
    expect(tx.aceNotice.findFirst).toHaveBeenCalledWith({
      where: {
        id: "notice-a",
        tenantId: actor.tenantId,
        publishedAt: { not: null },
        legacyImportedAt: null,
      },
      select: { requiresAcknowledgement: true },
    });
    expect(tx.aceNoticeReceipt.count).toHaveBeenCalledWith({
      where: {
        tenantId: actor.tenantId,
        audienceMember: { tenantId: actor.tenantId, noticeId: "notice-a" },
        acknowledgedAt: { not: null },
      },
    });
  });

  it("does not invent receipt totals for historical or other-site notices", async () => {
    const { service, tx } = setup();
    tx.aceNotice.findFirst.mockResolvedValue(null);
    await expect(service.get("notice-a", actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.aceNoticeReceipt.count).not.toHaveBeenCalled();
  });
});
