import type { Prisma } from "@pathway/db";
import { CAPABILITY_DEFINITIONS } from "../capability-definitions";
import {
  assertPermissionDefinitionsInSync,
  syncPermissionDefinitions,
} from "../permission-definition-sync";

describe("platform permission-definition synchronization", () => {
  it("synchronizes every compile-time capability definition", async () => {
    const inserted: Array<Record<string, unknown>> = [];
    const tx = {
      permissionDefinition: {
        findMany: async () => [],
        createMany: async ({
          data,
        }: {
          data: Array<Record<string, unknown>>;
        }) => {
          inserted.push(...data);
          return { count: data.length };
        },
        update: async () => undefined,
        updateMany: async () => ({ count: 0 }),
      },
    } as unknown as Prisma.TransactionClient;

    const result = await syncPermissionDefinitions(tx);

    expect(result).toEqual({
      inserted: Object.keys(CAPABILITY_DEFINITIONS).length,
      updated: 0,
      deactivated: 0,
    });
    expect(inserted).toContainEqual({
      key: "attendance.read",
      ...CAPABILITY_DEFINITIONS["attendance.read"],
      requiredModule: null,
      requiredVertical: null,
      isActive: true,
    });
  });

  it("checks registry drift without writing permission definitions", async () => {
    const rows = Object.entries(CAPABILITY_DEFINITIONS).map(
      ([key, definition]) => ({
        key,
        ...definition,
        requiredModule: definition.requiredModule ?? null,
        requiredVertical: definition.requiredVertical ?? null,
        isActive: true,
      }),
    );
    let writes = 0;
    const tx = {
      permissionDefinition: {
        findMany: async () => rows,
        createMany: async () => {
          writes += 1;
          return { count: 0 };
        },
        update: async () => {
          writes += 1;
        },
        updateMany: async () => {
          writes += 1;
          return { count: 0 };
        },
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      assertPermissionDefinitionsInSync(tx),
    ).resolves.toBeUndefined();
    expect(writes).toBe(0);
  });
});
