import "reflect-metadata";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
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
    behaviourReviewRequest: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
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
        take: 21,
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
        take: 51,
      }),
    );
  });

  it("continues past the first page using a scoped review cursor", async () => {
    const { tx, service } = arrange({ head: true });
    const requestedAt = new Date("2026-10-09T12:00:00.000Z");
    const firstId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const secondId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const thirdId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    tx.behaviourReviewRequest.findMany.mockResolvedValueOnce([
      { id: firstId, requestedAt },
      { id: secondId, requestedAt },
      { id: thirdId, requestedAt: new Date("2026-10-08T12:00:00.000Z") },
    ]);
    await expect(service.list(actor, { limit: 2 })).resolves.toEqual({
      items: [
        { id: firstId, requestedAt },
        { id: secondId, requestedAt },
      ],
      nextCursor: secondId,
    });

    tx.behaviourReviewRequest.findFirst.mockResolvedValue({
      id: secondId,
      requestedAt,
    });
    tx.behaviourReviewRequest.findMany.mockResolvedValueOnce([
      { id: thirdId, requestedAt: new Date("2026-10-08T12:00:00.000Z") },
    ]);
    await expect(
      service.list(actor, { limit: 2, cursor: secondId }),
    ).resolves.toEqual({
      items: [
        { id: thirdId, requestedAt: new Date("2026-10-08T12:00:00.000Z") },
      ],
      nextCursor: null,
    });
    expect(tx.behaviourReviewRequest.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: actor.tenantId,
        id: secondId,
      }),
      select: { id: true, requestedAt: true },
    });
    expect(tx.behaviourReviewRequest.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { requestedAt: { lt: requestedAt } },
            { requestedAt, id: { lt: secondId } },
          ],
        }),
        take: 3,
      }),
    );
  });

  it("rejects a cursor outside the visible site and role scope", async () => {
    const { tx, service } = arrange({ lead: true });
    await expect(
      service.list(actor, {
        cursor: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.behaviourReviewRequest.findMany).not.toHaveBeenCalled();
  });
});
