import { PathwayRequestContext } from "@pathway/auth";
import { AccessTagsController } from "../access-tags.controller";
import { AccessTagsService } from "../access-tags.service";

const GRANT_ID = "499aec88-d58d-4dd3-9bbb-a95a1ba4fdf7";
const USER_ID = "5d7a71ba-7335-4aeb-a941-c8d350439f42";
const request = { headers: { "x-request-id": "tag-request-1" } };

function createController() {
  const tags = {
    catalogue: jest.fn().mockReturnValue([{ key: "attendance-recorder" }]),
    list: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    grant: jest.fn().mockResolvedValue({ id: GRANT_ID }),
    revoke: jest
      .fn()
      .mockResolvedValue({ id: GRANT_ID, revokedAt: new Date() }),
  } as unknown as AccessTagsService;
  const requestContext = {
    requireContext: () => ({
      user: { userId: "actor-1" },
      org: { orgId: "org-1" },
      tenant: { tenantId: "site-1" },
      roles: { org: ["org:admin"], tenant: [] },
    }),
  } as unknown as PathwayRequestContext;
  return { tags, controller: new AccessTagsController(tags, requestContext) };
}

describe("AccessTagsController", () => {
  it("returns the fixed catalogue", () => {
    const { controller } = createController();
    expect(controller.catalogue()).toEqual({
      tags: [{ key: "attendance-recorder" }],
    });
  });

  it("derives the organisation and selected site for grants", async () => {
    const { tags, controller } = createController();
    const body = {
      userId: USER_ID,
      tagKey: "attendance-recorder",
      scope: "site",
      startsAt: "2026-10-06T09:00:00.000Z",
      expiresAt: "2026-11-06T09:00:00.000Z",
    };

    await expect(controller.grant(body, request)).resolves.toEqual({
      id: GRANT_ID,
    });
    expect(tags.grant).toHaveBeenCalledWith(
      {
        userId: USER_ID,
        tagKey: "attendance-recorder",
        scope: "site",
        startsAt: new Date(body.startsAt),
        expiresAt: new Date(body.expiresAt),
      },
      {
        orgId: "org-1",
        tenantId: "site-1",
        userId: "actor-1",
        legacyOrgRoles: ["org:admin"],
        requestId: "tag-request-1",
      },
    );
  });

  it("rejects caller-selected tenant and unknown tags", () => {
    const { controller } = createController();
    for (const body of [
      {
        userId: USER_ID,
        tagKey: "attendance-recorder",
        scope: "site",
        tenantId: "other",
      },
      { userId: USER_ID, tagKey: "made-up", scope: "site" },
    ]) {
      expect(() => controller.grant(body, request)).toThrow();
    }
  });

  it("validates list pagination and revoke identifiers", async () => {
    const { tags, controller } = createController();
    await controller.list({ limit: "50", userId: USER_ID }, request);
    expect(tags.list).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "org-1", tenantId: "site-1" }),
      { limit: 50, userId: USER_ID },
    );
    await controller.revoke({ grantId: GRANT_ID }, request);
    expect(tags.revoke).toHaveBeenCalledWith(
      GRANT_ID,
      expect.objectContaining({ orgId: "org-1" }),
    );
    expect(() => controller.list({ limit: "51" }, request)).toThrow();
    expect(() => controller.revoke({ grantId: "wrong" }, request)).toThrow();
  });
});
