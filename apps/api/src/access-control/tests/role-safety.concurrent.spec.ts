import type { Prisma } from "@pathway/db";
import {
  RoleSafetyService,
  type RoleMutationCommand,
} from "../role-safety.service";

const actor = {
  actorUserId: "actor-1",
  orgId: "org-1",
  requestId: "role-safety-request-1",
};

function commandWith(
  headCount: number,
  managementPermissionCount: number,
): {
  command: RoleMutationCommand;
  mutate: jest.Mock<Promise<void>, []>;
  querySnapshot: jest.Mock;
} {
  const mutate = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
  const querySnapshot = jest.fn().mockResolvedValue([
    {
      activeHeadCount: headCount,
      managementPermissionCount,
    },
  ]);
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: querySnapshot,
  } as unknown as Prisma.TransactionClient;

  return {
    command: {
      ...actor,
      tx,
      mutate,
    },
    mutate,
    querySnapshot,
  };
}

describe("RoleSafetyService", () => {
  const service = new RoleSafetyService();

  it("rejects a mutation whose post-state has no active organisation head", async () => {
    const { command } = commandWith(0, 2);

    await expect(
      service.assertHeadAndSelfLockoutSafe(command),
    ).rejects.toMatchObject({
      response: {
        statusCode: 409,
        code: "LAST_HEAD_PROTECTED",
        requestId: actor.requestId,
      },
    });
  });

  it("rejects same-request self-lockout when legacy bootstrap is the actor's only remaining authority", async () => {
    const { command } = commandWith(1, 0);

    await expect(
      service.assertHeadAndSelfLockoutSafe(command),
    ).rejects.toMatchObject({
      response: {
        statusCode: 409,
        code: "SELF_LOCKOUT_PROTECTED",
        requestId: actor.requestId,
      },
    });
  });

  it("rejects an actor whose active typed roles retain only roles.manage", async () => {
    const { command } = commandWith(1, 1);

    await expect(
      service.assertHeadAndSelfLockoutSafe(command),
    ).rejects.toMatchObject({
      response: {
        statusCode: 409,
        code: "SELF_LOCKOUT_PROTECTED",
        requestId: actor.requestId,
      },
    });
  });

  it("rejects an actor whose active typed roles retain only assignments.manage", async () => {
    const { command } = commandWith(1, 1);

    await expect(
      service.assertHeadAndSelfLockoutSafe(command),
    ).rejects.toMatchObject({
      response: {
        statusCode: 409,
        code: "SELF_LOCKOUT_PROTECTED",
        requestId: actor.requestId,
      },
    });
  });

  it("allows a mutation when both typed management permissions remain", async () => {
    const { command, mutate, querySnapshot } = commandWith(1, 2);

    await expect(
      service.assertHeadAndSelfLockoutSafe(command),
    ).resolves.toBeUndefined();
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(querySnapshot).toHaveBeenCalledTimes(1);
  });
});
