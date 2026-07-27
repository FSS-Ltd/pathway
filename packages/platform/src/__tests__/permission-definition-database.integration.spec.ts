import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  closePrisma,
  prisma,
  runReadOnlyTransaction,
  runTransaction,
} from "@pathway/db";
import { CAPABILITY_DEFINITIONS } from "../capability-definitions";
import {
  assertPermissionDefinitionsInSync,
  syncPermissionDefinitions,
} from "../permission-definition-sync";

const describeIfDatabaseSmoke =
  process.env.PATHWAY_RUN_PERMISSION_DEFINITION_DB_SMOKE === "1"
    ? describe
    : describe.skip;

interface RlsPosture {
  enabled: boolean;
  forced: boolean;
}

interface PolicyPosture {
  policyname: string;
  permissive: string;
  roles: string[];
  command: string;
  usingExpression: string | null;
  withCheckExpression: string | null;
}

interface TablePrivilegeGrant {
  roleName: string;
  privilege: string;
}

const REPOSITORY_ROOT = path.resolve(__dirname, "../../../..");
const DESTRUCTIVE_SMOKE_TOKEN =
  "destroy-permission-definitions-in-disposable-database";
const DISPOSABLE_DATABASE_NAME =
  /^pathway_permission_definition_smoke_[a-z0-9][a-z0-9_]*$/;

function assertDisposablePermissionDefinitionSmokeDatabase(
  databaseUrl: string | undefined,
  destructiveToken: string | undefined,
): void {
  let url: URL;
  try {
    url = new URL(databaseUrl ?? "");
  } catch {
    throw new Error(
      "Permission-definition smoke requires a valid DATABASE_URL",
    );
  }

  if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error(
      `Refusing permission-definition smoke against non-local host "${url.hostname}"`,
    );
  }

  const databaseName = decodeURIComponent(url.pathname.slice(1));
  if (!DISPOSABLE_DATABASE_NAME.test(databaseName)) {
    throw new Error(
      `Permission-definition smoke requires a disposable database name matching "${DISPOSABLE_DATABASE_NAME.source}"`,
    );
  }

  if (destructiveToken !== DESTRUCTIVE_SMOKE_TOKEN) {
    throw new Error(
      "Permission-definition smoke requires the explicit destructive token",
    );
  }
}

function assertConfiguredSmokeDatabaseIsDisposable(): void {
  assertDisposablePermissionDefinitionSmokeDatabase(
    process.env.DATABASE_URL,
    process.env.PATHWAY_PERMISSION_DEFINITION_DB_SMOKE_DESTRUCTIVE_TOKEN,
  );
}

describe("permission-definition smoke safety guard", () => {
  it("rejects an ordinary local development database", () => {
    expect(() =>
      assertDisposablePermissionDefinitionSmokeDatabase(
        "postgresql://postgres:postgres@localhost:5433/pathway?schema=public",
        DESTRUCTIVE_SMOKE_TOKEN,
      ),
    ).toThrow(/disposable database name/i);
  });

  it("rejects a disposable database without the destructive token", () => {
    expect(() =>
      assertDisposablePermissionDefinitionSmokeDatabase(
        "postgresql://postgres:postgres@localhost:5433/pathway_permission_definition_smoke_test?schema=public",
        undefined,
      ),
    ).toThrow(/destructive token/i);
  });

  it("rejects a disposable-looking database on a remote host", () => {
    expect(() =>
      assertDisposablePermissionDefinitionSmokeDatabase(
        "postgresql://postgres:postgres@database.example/pathway_permission_definition_smoke_test?schema=public",
        DESTRUCTIVE_SMOKE_TOKEN,
      ),
    ).toThrow(/non-local host/i);
  });

  it("accepts a local disposable database with the destructive token", () => {
    expect(() =>
      assertDisposablePermissionDefinitionSmokeDatabase(
        "postgresql://postgres:postgres@127.0.0.1:5433/pathway_permission_definition_smoke_test?schema=public",
        DESTRUCTIVE_SMOKE_TOKEN,
      ),
    ).not.toThrow();
  });
});

describeIfDatabaseSmoke("PermissionDefinition database smoke", () => {
  beforeAll(() => {
    assertConfiguredSmokeDatabaseIsDisposable();
  });

  beforeEach(async () => {
    assertConfiguredSmokeDatabaseIsDisposable();
    await prisma.permissionDefinition.deleteMany();
  });

  afterAll(async () => {
    try {
      assertConfiguredSmokeDatabaseIsDisposable();
      await prisma.permissionDefinition.deleteMany();
    } finally {
      await closePrisma();
    }
  });

  it("has the required searchable schema, primary key, and forced-RLS posture", async () => {
    const columns = await prisma.$queryRaw<
      Array<{ columnName: string; nullable: string }>
    >`
      SELECT
        column_name AS "columnName",
        is_nullable AS "nullable"
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'PermissionDefinition'
      ORDER BY ordinal_position
    `;
    expect(columns).toEqual([
      { columnName: "key", nullable: "NO" },
      { columnName: "label", nullable: "NO" },
      { columnName: "description", nullable: "NO" },
      { columnName: "scope", nullable: "NO" },
      { columnName: "sensitivity", nullable: "NO" },
      { columnName: "delegable", nullable: "NO" },
      { columnName: "requiredModule", nullable: "YES" },
      { columnName: "requiredVertical", nullable: "YES" },
      { columnName: "isActive", nullable: "NO" },
      { columnName: "createdAt", nullable: "NO" },
      { columnName: "updatedAt", nullable: "NO" },
    ]);

    const [rls] = await prisma.$queryRaw<RlsPosture[]>`
      SELECT
        relrowsecurity AS enabled,
        relforcerowsecurity AS forced
      FROM pg_class
      WHERE oid = '"PermissionDefinition"'::regclass
    `;
    expect(rls).toEqual({ enabled: true, forced: true });

    const policies = await prisma.$queryRaw<PolicyPosture[]>`
      SELECT
        policyname,
        permissive,
        roles::text[] AS roles,
        cmd AS command,
        qual AS "usingExpression",
        with_check AS "withCheckExpression"
      FROM pg_policies
      WHERE schemaname = current_schema()
        AND tablename = 'PermissionDefinition'
      ORDER BY policyname
    `;
    expect(policies).toEqual([
      {
        policyname: "PermissionDefinition_global_read",
        permissive: "PERMISSIVE",
        roles: ["public"],
        command: "SELECT",
        usingExpression: "true",
        withCheckExpression: null,
      },
    ]);

    const privileges = await prisma.$queryRaw<TablePrivilegeGrant[]>`
      SELECT
        grantee AS "roleName",
        privilege_type AS privilege
      FROM information_schema.table_privileges
      WHERE table_schema = current_schema()
        AND table_name = 'PermissionDefinition'
        AND grantee IN ('PUBLIC', 'anon', 'authenticated')
      ORDER BY grantee, privilege_type
    `;
    expect(privileges).toEqual([]);
  });

  it("synchronizes registry metadata, supports primary-key lookup, and is idempotent", async () => {
    const first = await runTransaction(syncPermissionDefinitions);
    expect(first).toEqual({
      inserted: Object.keys(CAPABILITY_DEFINITIONS).length,
      updated: 0,
      deactivated: 0,
    });

    await expect(
      prisma.permissionDefinition.findUnique({
        where: { key: "attendance.read" },
      }),
    ).resolves.toMatchObject({
      key: "attendance.read",
      label: CAPABILITY_DEFINITIONS["attendance.read"].label,
      isActive: true,
    });

    await expect(runTransaction(syncPermissionDefinitions)).resolves.toEqual({
      inserted: 0,
      updated: 0,
      deactivated: 0,
    });
  });

  it("rejects active database-only drift and synchronization deactivates it", async () => {
    await runTransaction(syncPermissionDefinitions);
    await prisma.permissionDefinition.create({
      data: {
        key: "database.only.execute",
        label: "Database-only execution key",
        description: "Must never become executable",
        scope: "organisation",
        sensitivity: "protected",
        delegable: false,
      },
    });

    await expect(
      runTransaction(assertPermissionDefinitionsInSync),
    ).rejects.toThrow("active database-only keys: database.only.execute");
    await expect(runTransaction(syncPermissionDefinitions)).resolves.toEqual({
      inserted: 0,
      updated: 0,
      deactivated: 1,
    });
    await expect(
      runTransaction(assertPermissionDefinitionsInSync),
    ).resolves.toBeUndefined();
  });

  it("runs the actual drift-check command without changing rows", async () => {
    await runTransaction(syncPermissionDefinitions);
    const before = await prisma.permissionDefinition.findMany({
      select: { key: true, updatedAt: true },
      orderBy: { key: "asc" },
    });

    const result = spawnSync("pnpm", ["permission-definitions:check"], {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      env: process.env,
    });
    if (result.status !== 0) {
      throw new Error(
        `Permission-definition check command failed:\n${result.stdout}\n${result.stderr}`,
      );
    }
    expect(result.stdout).toContain(
      "[permission-definitions] registry drift: zero",
    );

    const after = await prisma.permissionDefinition.findMany({
      select: { key: true, updatedAt: true },
      orderBy: { key: "asc" },
    });
    expect(after).toEqual(before);
  });

  it("rejects writes inside the drift-check transaction primitive", async () => {
    await runTransaction(syncPermissionDefinitions);

    await expect(
      runReadOnlyTransaction((tx) =>
        tx.permissionDefinition.update({
          where: { key: "attendance.read" },
          data: { label: "Forbidden mutation" },
        }),
      ),
    ).rejects.toThrow(/read-only transaction/i);
    await expect(
      prisma.permissionDefinition.findUnique({
        where: { key: "attendance.read" },
        select: { label: true },
      }),
    ).resolves.toEqual({
      label: CAPABILITY_DEFINITIONS["attendance.read"].label,
    });
  });
});
