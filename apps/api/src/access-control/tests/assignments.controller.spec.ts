import { PathwayRequestContext } from "@pathway/auth";
import { AssignmentsController } from "../assignments.controller";
import { AssignmentsService } from "../assignments.service";

const roleDefinitionId = "5d7a71ba-7335-4aeb-a941-c8d350439f42";
const assignmentId = "499aec88-d58d-4dd3-9bbb-a95a1ba4fdf7";

function createController() {
  const assignments = {
    assign: jest.fn().mockResolvedValue([
      { id: "assignment-1" },
      { id: "assignment-2" },
    ]),
    list: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    revoke: jest.fn().mockResolvedValue({ id: assignmentId }),
  } as unknown as AssignmentsService;
  const requestContext = {
    requireContext: () => ({
      user: { userId: "actor-1" },
      org: { orgId: "org-1" },
      tenant: { tenantId: "site-1" },
      roles: { org: ["org:admin"], tenant: [] },
    }),
  } as unknown as PathwayRequestContext;

  return {
    assignments,
    controller: new AssignmentsController(assignments, requestContext),
  };
}

describe("AssignmentsController", () => {
  it("derives organisation and selected site for a single assignment", async () => {
    const { assignments, controller } = createController();
    const request = { headers: { "x-request-id": "assignment-request-1" } };

    await expect(
      controller.assign(
        {
          userId: "user-1",
          roleDefinitionId,
          startsAt: "2026-07-30T09:00:00.000Z",
          expiresAt: "2026-08-30T09:00:00.000Z",
        },
        request,
      ),
    ).resolves.toEqual({ id: "assignment-1" });

    expect(assignments.assign).toHaveBeenCalledWith(
      [
        {
          userId: "user-1",
          roleDefinitionId,
          orgId: "org-1",
          tenantId: "site-1",
          startsAt: new Date("2026-07-30T09:00:00.000Z"),
          expiresAt: new Date("2026-08-30T09:00:00.000Z"),
        },
      ],
      {
        orgId: "org-1",
        tenantId: "site-1",
        userId: "actor-1",
        legacyOrgRoles: ["org:admin"],
        requestId: "assignment-request-1",
      },
    );
  });

  it("passes a non-empty assignment array through one atomic service call", async () => {
    const { assignments, controller } = createController();
    const request = { headers: { "x-request-id": "assignment-request-2" } };

    await expect(
      controller.assign(
        [
          {
            userId: "user-1",
            roleDefinitionId,
            startsAt: "2026-07-30T09:00:00.000Z",
          },
          {
            userId: "user-2",
            roleDefinitionId,
            startsAt: "2026-07-31T09:00:00.000Z",
          },
        ],
        request,
      ),
    ).resolves.toEqual([
      { id: "assignment-1" },
      { id: "assignment-2" },
    ]);

    expect(assignments.assign).toHaveBeenCalledTimes(1);
    expect(assignments.assign).toHaveBeenCalledWith(
      [
        expect.objectContaining({ userId: "user-1", orgId: "org-1" }),
        expect.objectContaining({ userId: "user-2", orgId: "org-1" }),
      ],
      expect.objectContaining({ requestId: "assignment-request-2" }),
    );
  });

  it("accepts an atomic bulk assignment of 50 commands", async () => {
    const { assignments, controller } = createController();

    await controller.assign(
      Array.from({ length: 50 }, (_, index) => ({
        userId: `user-${index}`,
        roleDefinitionId,
        startsAt: "2026-07-30T09:00:00.000Z",
      })),
      { headers: { "x-request-id": "assignment-request-50" } },
    );

    expect(assignments.assign).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ userId: "user-0" }),
        expect.objectContaining({ userId: "user-49" }),
      ]),
      expect.objectContaining({ requestId: "assignment-request-50" }),
    );
    expect((assignments.assign as jest.Mock).mock.calls[0][0]).toHaveLength(50);
  });

  it.each([
    ["an empty bulk request", []],
    [
      "a bulk request larger than 50 assignments",
      Array.from({ length: 51 }, (_, index) => ({
        userId: `user-${index}`,
        roleDefinitionId,
        startsAt: "2026-07-30T09:00:00.000Z",
      })),
    ],
    [
      "caller-controlled organisation context",
      {
        userId: "user-1",
        roleDefinitionId,
        startsAt: "2026-07-30T09:00:00.000Z",
        orgId: "attacker-org",
      },
    ],
    [
      "caller-controlled site context",
      {
        userId: "user-1",
        roleDefinitionId,
        startsAt: "2026-07-30T09:00:00.000Z",
        tenantId: "attacker-site",
      },
    ],
    [
      "a malformed date",
      {
        userId: "user-1",
        roleDefinitionId,
        startsAt: "not-a-date",
      },
    ],
    [
      "a null date",
      {
        userId: "user-1",
        roleDefinitionId,
        startsAt: null,
      },
    ],
    [
      "a boolean date",
      {
        userId: "user-1",
        roleDefinitionId,
        startsAt: true,
      },
    ],
    [
      "a numeric date",
      {
        userId: "user-1",
        roleDefinitionId,
        startsAt: 1_785_402_000_000,
      },
    ],
  ])("returns a safe validation envelope for %s", async (_name, body) => {
    const { assignments, controller } = createController();

    await expect(
      controller.assign(body, {
        headers: { "x-request-id": "assignment-request-invalid" },
      }),
    ).rejects.toMatchObject({
      response: {
        statusCode: 400,
        code: "INVALID_ASSIGNMENT_REQUEST",
        message: "The assignment request is invalid.",
        requestId: "assignment-request-invalid",
      },
    });
    expect(assignments.assign).not.toHaveBeenCalled();
  });

  it("passes default and maximum R09 pagination through trusted actor context", async () => {
    const { assignments, controller } = createController();
    const request = { headers: { "x-request-id": "assignment-request-3" } };

    await controller.list({}, request);
    await controller.list({ limit: "50" }, request);
    await controller.revoke({ assignmentId }, request);

    const actor = {
      orgId: "org-1",
      tenantId: "site-1",
      userId: "actor-1",
      legacyOrgRoles: ["org:admin"],
      requestId: "assignment-request-3",
    };
    expect(assignments.list).toHaveBeenNthCalledWith(1, actor, {});
    expect(assignments.list).toHaveBeenNthCalledWith(2, actor, { limit: 50 });
    expect(assignments.revoke).toHaveBeenCalledWith(assignmentId, actor);
  });

  it.each([["0"], ["51"], ["01"], ["1.5"]])(
    "returns a safe validation envelope for an invalid R09 page limit of %s",
    async (limit) => {
      const { assignments, controller } = createController();
      const request = {
        headers: { "x-request-id": "assignment-request-invalid-page" },
      };

      await expect(controller.list({ limit }, request)).rejects.toMatchObject({
        response: {
          statusCode: 400,
          code: "INVALID_ASSIGNMENT_REQUEST",
          requestId: "assignment-request-invalid-page",
        },
      });
      expect(assignments.list).not.toHaveBeenCalled();
    },
  );
});
