import "reflect-metadata";
import { ForbiddenException } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import type { EffectivePermissionsService } from "../../access-control/effective-permissions.service";
import { BehaviourReviewService } from "../behaviour-review.service";

jest.mock("@pathway/db", () => ({
  ...jest.requireActual("@pathway/db"),
  prisma: {
    user: { findUnique: jest.fn().mockResolvedValue({ isActive: true }) },
  },
  withTenantRlsContext: jest.fn(),
}));

const actor = { tenantId: "site-1", orgId: "org-1", userId: "reviewer-1" };

function arrange(
  options: { sensitive?: boolean; head?: boolean; lead?: boolean } = {},
) {
  const tx = {
    tenant: { findFirst: jest.fn().mockResolvedValue({ id: actor.tenantId }) },
    orgVertical: {
      findFirst: jest.fn().mockResolvedValue({ orgId: actor.orgId }),
    },
    child: { findFirst: jest.fn().mockResolvedValue({ id: "child-1" }) },
    $queryRaw: jest
      .fn()
      .mockImplementation(({ values }: { values: unknown[] }) => {
        const eligible = values[2] === "HEAD" ? options.head : options.lead;
        return eligible ? [{ userId: actor.userId }] : [];
      }),
    behaviourReviewRequest: { findMany: jest.fn().mockResolvedValue([]) },
  };
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_tenantId, _orgId, callback) =>
      callback(tx as never),
    );
  const permissions = {
    resolve: jest
      .fn()
      .mockResolvedValue({ allowed: options.sensitive !== false }),
  };
  const service = new BehaviourReviewService(
    permissions as unknown as EffectivePermissionsService,
  );
  return { tx, service };
}

describe("BehaviourReviewService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("denies review reads without Sensitive permission", async () => {
    const { tx, service } = arrange({ sensitive: false, head: true });
    await expect(service.list(actor, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(tx.behaviourReviewRequest.findMany).not.toHaveBeenCalled();
  });

  it("denies a tag-only actor without a fixed Head or Lead role", async () => {
    const { tx, service } = arrange();
    await expect(service.list(actor, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(tx.behaviourReviewRequest.findMany).not.toHaveBeenCalled();
  });

  it("limits a Lead to site review requests", async () => {
    const { tx, service } = arrange({ lead: true });
    await service.list(actor, { childId: "child-1", limit: 20 });
    expect(tx.behaviourReviewRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: actor.tenantId,
          child: { isGuest: false },
          kind: { in: ["SITE"] },
          childId: "child-1",
        },
        take: 20,
      }),
    );
  });

  it("allows a Head to read both site and Head requests within the active site", async () => {
    const { tx, service } = arrange({ head: true });
    await service.list(actor, {});
    expect(tx.behaviourReviewRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: actor.tenantId,
          child: { isGuest: false },
          kind: { in: ["SITE", "HEAD"] },
        },
        take: 50,
      }),
    );
  });
});
