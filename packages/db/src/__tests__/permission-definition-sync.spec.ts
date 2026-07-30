import {
  assertPermissionDefinitionRecordsInSync,
  syncPermissionDefinitionRecords,
  type PermissionDefinitionRecord,
  type PermissionDefinitionTransaction,
  type StoredPermissionDefinition,
} from "../permission-definition-sync";

const ATTENDANCE_READ: PermissionDefinitionRecord = {
  key: "attendance.read",
  label: "View attendance",
  description: "View attendance records for the active site",
  scope: "site",
  sensitivity: "standard",
  delegable: true,
  requiredModule: null,
  requiredVertical: null,
};

const BEHAVIOUR_READ: PermissionDefinitionRecord = {
  ...ATTENDANCE_READ,
  key: "behaviour.read",
  label: "View behaviour",
  description: "View behaviour records for the active site",
};

class InMemoryPermissionDefinitionTransaction implements PermissionDefinitionTransaction {
  readonly rows = new Map<string, StoredPermissionDefinition>();
  readonly writes: Array<{ action: "create" | "update"; key: string }> = [];
  readonly delegateCalls: Array<
    "create" | "createMany" | "update" | "updateMany"
  > = [];

  readonly permissionDefinition = {
    findMany: async (): Promise<StoredPermissionDefinition[]> => [
      ...this.rows.values(),
    ],
    create: async ({
      data,
    }: {
      data: PermissionDefinitionRecord & { isActive: boolean };
    }): Promise<void> => {
      this.delegateCalls.push("create");
      this.rows.set(data.key, data);
      this.writes.push({ action: "create", key: data.key });
    },
    createMany: async ({
      data,
    }: {
      data: Array<PermissionDefinitionRecord & { isActive: boolean }>;
    }): Promise<{ count: number }> => {
      this.delegateCalls.push("createMany");
      for (const definition of data) {
        this.rows.set(definition.key, definition);
        this.writes.push({ action: "create", key: definition.key });
      }
      return { count: data.length };
    },
    update: async ({
      where,
      data,
    }: {
      where: { key: string };
      data: Partial<StoredPermissionDefinition>;
    }): Promise<void> => {
      this.delegateCalls.push("update");
      const row = this.rows.get(where.key);
      if (!row) {
        throw new Error(`Missing permission definition: ${where.key}`);
      }
      this.rows.set(where.key, { ...row, ...data });
      this.writes.push({ action: "update", key: where.key });
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { key: { in: string[] }; isActive: boolean };
      data: { isActive: boolean };
    }): Promise<{ count: number }> => {
      this.delegateCalls.push("updateMany");
      let count = 0;
      for (const key of where.key.in) {
        const row = this.rows.get(key);
        if (row?.isActive === where.isActive) {
          this.rows.set(key, { ...row, ...data });
          this.writes.push({ action: "update", key });
          count += 1;
        }
      }
      return { count };
    },
  };
}

describe("permission-definition synchronization", () => {
  it("inserts missing definitions with one bulk write", async () => {
    const tx = new InMemoryPermissionDefinitionTransaction();

    const result = await syncPermissionDefinitionRecords(tx, [
      ATTENDANCE_READ,
      BEHAVIOUR_READ,
    ]);

    expect(result).toEqual({ inserted: 2, updated: 0, deactivated: 0 });
    expect(tx.delegateCalls).toEqual(["createMany"]);
  });

  it("bounds bulk inserts while preserving the exact inserted count", async () => {
    const tx = new InMemoryPermissionDefinitionTransaction();
    const definitions = Array.from({ length: 101 }, (_, index) => ({
      ...ATTENDANCE_READ,
      key: `permission.${index}`,
    }));

    const result = await syncPermissionDefinitionRecords(tx, definitions);

    expect(result).toEqual({ inserted: 101, updated: 0, deactivated: 0 });
    expect(tx.delegateCalls).toEqual(["createMany", "createMany"]);
  });

  it("inserts a missing registry definition as active", async () => {
    const tx = new InMemoryPermissionDefinitionTransaction();

    const result = await syncPermissionDefinitionRecords(tx, [ATTENDANCE_READ]);

    expect(result).toEqual({ inserted: 1, updated: 0, deactivated: 0 });
    expect(tx.rows.get(ATTENDANCE_READ.key)).toEqual({
      ...ATTENDANCE_READ,
      isActive: true,
    });
  });

  it("updates changed metadata for a known definition", async () => {
    const tx = new InMemoryPermissionDefinitionTransaction();
    tx.rows.set(ATTENDANCE_READ.key, {
      ...ATTENDANCE_READ,
      label: "Stale label",
      description: "Stale description",
      scope: "organisation",
      sensitivity: "protected",
      delegable: false,
      requiredModule: "FINANCE",
      requiredVertical: "ACE_SCHOOL",
      isActive: true,
    });

    const result = await syncPermissionDefinitionRecords(tx, [ATTENDANCE_READ]);

    expect(result).toEqual({ inserted: 0, updated: 1, deactivated: 0 });
    expect(tx.rows.get(ATTENDANCE_READ.key)).toEqual({
      ...ATTENDANCE_READ,
      isActive: true,
    });
  });

  it("deactivates an active database-only definition", async () => {
    const tx = new InMemoryPermissionDefinitionTransaction();
    tx.rows.set("legacy.execute", {
      ...ATTENDANCE_READ,
      key: "legacy.execute",
      isActive: true,
    });

    const result = await syncPermissionDefinitionRecords(tx, [ATTENDANCE_READ]);

    expect(result).toEqual({ inserted: 1, updated: 0, deactivated: 1 });
    expect(tx.rows.get("legacy.execute")?.isActive).toBe(false);
  });

  it("deactivates database-only definitions with one bulk write", async () => {
    const tx = new InMemoryPermissionDefinitionTransaction();
    tx.rows.set(ATTENDANCE_READ.key, {
      ...ATTENDANCE_READ,
      isActive: true,
    });
    tx.rows.set("legacy.execute", {
      ...ATTENDANCE_READ,
      key: "legacy.execute",
      isActive: true,
    });
    tx.rows.set("retired.manage", {
      ...ATTENDANCE_READ,
      key: "retired.manage",
      isActive: true,
    });

    const result = await syncPermissionDefinitionRecords(tx, [ATTENDANCE_READ]);

    expect(result).toEqual({ inserted: 0, updated: 0, deactivated: 2 });
    expect(tx.delegateCalls).toEqual(["updateMany"]);
  });

  it("bounds bulk deactivation while preserving the exact count", async () => {
    const tx = new InMemoryPermissionDefinitionTransaction();
    tx.rows.set(ATTENDANCE_READ.key, {
      ...ATTENDANCE_READ,
      isActive: true,
    });
    for (let index = 0; index < 101; index += 1) {
      tx.rows.set(`retired.${index}`, {
        ...ATTENDANCE_READ,
        key: `retired.${index}`,
        isActive: true,
      });
    }

    const result = await syncPermissionDefinitionRecords(tx, [ATTENDANCE_READ]);

    expect(result).toEqual({ inserted: 0, updated: 0, deactivated: 101 });
    expect(tx.delegateCalls).toEqual(["updateMany", "updateMany"]);
  });

  it("rejects active database-only definitions during read-only drift validation", async () => {
    const tx = new InMemoryPermissionDefinitionTransaction();
    tx.rows.set(ATTENDANCE_READ.key, {
      ...ATTENDANCE_READ,
      isActive: true,
    });
    tx.rows.set("legacy.execute", {
      ...ATTENDANCE_READ,
      key: "legacy.execute",
      isActive: true,
    });

    await expect(
      assertPermissionDefinitionRecordsInSync(tx, [ATTENDANCE_READ]),
    ).rejects.toThrow("active database-only keys: legacy.execute");
    expect(tx.writes).toEqual([]);
  });

  it("rejects missing registry definitions during read-only drift validation", async () => {
    const tx = new InMemoryPermissionDefinitionTransaction();

    await expect(
      assertPermissionDefinitionRecordsInSync(tx, [ATTENDANCE_READ]),
    ).rejects.toThrow("missing keys: attendance.read");
    expect(tx.writes).toEqual([]);
  });

  it("rejects inactive registry definitions during read-only drift validation", async () => {
    const tx = new InMemoryPermissionDefinitionTransaction();
    tx.rows.set(ATTENDANCE_READ.key, {
      ...ATTENDANCE_READ,
      isActive: false,
    });

    await expect(
      assertPermissionDefinitionRecordsInSync(tx, [ATTENDANCE_READ]),
    ).rejects.toThrow("inactive keys: attendance.read");
    expect(tx.writes).toEqual([]);
  });

  it("rejects metadata mismatches during read-only drift validation", async () => {
    const tx = new InMemoryPermissionDefinitionTransaction();
    tx.rows.set(ATTENDANCE_READ.key, {
      ...ATTENDANCE_READ,
      description: "Stale description",
      isActive: true,
    });

    await expect(
      assertPermissionDefinitionRecordsInSync(tx, [ATTENDANCE_READ]),
    ).rejects.toThrow("metadata mismatches: attendance.read");
    expect(tx.writes).toEqual([]);
  });

  it("reactivates a known inactive definition", async () => {
    const tx = new InMemoryPermissionDefinitionTransaction();
    tx.rows.set(ATTENDANCE_READ.key, {
      ...ATTENDANCE_READ,
      isActive: false,
    });

    const result = await syncPermissionDefinitionRecords(tx, [ATTENDANCE_READ]);

    expect(result).toEqual({ inserted: 0, updated: 1, deactivated: 0 });
    expect(tx.rows.get(ATTENDANCE_READ.key)?.isActive).toBe(true);
  });

  it("leaves inactive database-only tombstones unchanged and valid", async () => {
    const tx = new InMemoryPermissionDefinitionTransaction();
    tx.rows.set(ATTENDANCE_READ.key, {
      ...ATTENDANCE_READ,
      isActive: true,
    });
    tx.rows.set("legacy.execute", {
      ...ATTENDANCE_READ,
      key: "legacy.execute",
      isActive: false,
    });

    await expect(
      assertPermissionDefinitionRecordsInSync(tx, [ATTENDANCE_READ]),
    ).resolves.toBeUndefined();
    const result = await syncPermissionDefinitionRecords(tx, [ATTENDANCE_READ]);

    expect(result).toEqual({ inserted: 0, updated: 0, deactivated: 0 });
    expect(tx.writes).toEqual([]);
  });

  it("performs zero writes when synchronization is already current", async () => {
    const tx = new InMemoryPermissionDefinitionTransaction();
    tx.rows.set(ATTENDANCE_READ.key, {
      ...ATTENDANCE_READ,
      isActive: true,
    });

    const result = await syncPermissionDefinitionRecords(tx, [ATTENDANCE_READ]);

    expect(result).toEqual({ inserted: 0, updated: 0, deactivated: 0 });
    expect(tx.writes).toEqual([]);
  });
});
