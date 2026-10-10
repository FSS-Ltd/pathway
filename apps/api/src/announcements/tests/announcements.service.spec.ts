import { GoneException, NotFoundException } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { AnnouncementsService } from "../announcements.service";

jest.mock("@pathway/db", () => ({ withTenantRlsContext: jest.fn() }));

const tenantId = "11111111-1111-1111-1111-111111111111";
const orgId = "22222222-2222-2222-2222-222222222222";
const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const historical = {
  id,
  title: "Welcome",
  body: "Site update",
  audience: "PARENTS_AND_STAFF",
  publishedAt: new Date("2026-01-01T00:00:00.000Z"),
  withdrawnAt: null,
  legacyImportedAt: new Date("2026-10-10T00:00:00.000Z"),
  createdAt: new Date("2025-12-31T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function setup() {
  const tx = {
    aceNotice: {
      findMany: jest.fn().mockResolvedValue([historical]),
      findFirst: jest.fn().mockResolvedValue(historical),
    },
  };
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_tenant, _org, fn) => fn(tx as never));
  return { service: new AnnouncementsService(), tx };
}

describe("AnnouncementsService canonical read adapter", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lists site records from AceNotice and preserves legacy audience/status", async () => {
    const { service, tx } = setup();
    const rows = await service.findAll({ tenantId, orgId, audience: "ALL" });
    expect(withTenantRlsContext).toHaveBeenCalledWith(
      tenantId,
      orgId,
      expect.any(Function),
    );
    expect(tx.aceNotice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId, audience: "PARENTS_AND_STAFF" },
      }),
    );
    expect(rows[0]).toMatchObject({
      id,
      audience: "ALL",
      status: "sent",
      legacyImportedAt: historical.legacyImportedAt,
    });
  });

  it("limits detail to the selected site", async () => {
    const { service, tx } = setup();
    await service.findOne(id, tenantId, orgId);
    expect(tx.aceNotice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id, tenantId } }),
    );
    tx.aceNotice.findFirst.mockResolvedValue(null);
    await expect(service.findOne(id, tenantId, orgId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("retires the direct legacy write path", () => {
    const { service } = setup();
    expect(() => service.retiredWrite()).toThrow(GoneException);
  });
});
