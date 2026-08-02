import { randomUUID } from "node:crypto";
import {
  Prisma,
  prisma,
  runTransaction,
  withTenantRlsContext,
  type PrismaClientType,
} from "@pathway/db";
import {
  isDatabaseAvailable,
  requireDatabase,
} from "../../../test-helpers.e2e";

const TENANT_RLS_ROLE = "pathway_e2e_tenant_rls";
const PUBLISHED_VERSION_HASH = "a".repeat(64);

interface TripSlipFixture {
  orgAId: string;
  orgBId: string;
  tenantAId: string;
  tenantBId: string;
  staffAId: string;
  staffBId: string;
  witnessAId: string;
  guardianAUserId: string;
  childAId: string;
  childA2Id: string;
  childBId: string;
  guardianAIdentityId: string;
  guardianAChildRelationshipId: string;
  guardianAChild2RelationshipId: string;
}

interface TripSlipCounts {
  trip: bigint;
  checkpoint: bigint;
  checkpointAttendance: bigint;
  permissionSlip: bigint;
  version: bigint;
  recipient: bigint;
  response: bigint;
  exception: bigint;
  reminder: bigint;
}

const NO_TRIP_SLIP_ROWS: TripSlipCounts[] = [{
  trip: 0n,
  checkpoint: 0n,
  checkpointAttendance: 0n,
  permissionSlip: 0n,
  version: 0n,
  recipient: 0n,
  response: 0n,
  exception: 0n,
  reminder: 0n,
}];

function useTenantRlsRole(): boolean {
  return process.env.E2E_USE_GLOBAL_SETUP === "true";
}

async function withTripSlipRlsContext<T>(
  tenantId: string,
  orgId: string,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return withTenantRlsContext(tenantId, orgId, async (tx) => {
    if (useTenantRlsRole()) {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE "${TENANT_RLS_ROLE}"`);
    }

    return callback(tx);
  });
}

async function withNoTenantRlsContext<T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return runTransaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE "${TENANT_RLS_ROLE}"`);
    await tx.$executeRawUnsafe("SET LOCAL row_security = on");
    return callback(tx);
  });
}

async function expectDatabaseRejection(
  tx: Prisma.TransactionClient,
  operation: () => Promise<unknown>,
  postgresCode: string,
): Promise<void> {
  await tx.$executeRawUnsafe("SAVEPOINT expected_database_rejection");

  try {
    await operation();
  } catch (error) {
    await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT expected_database_rejection");
    await tx.$executeRawUnsafe("RELEASE SAVEPOINT expected_database_rejection");
    expect(error).toMatchObject({
      code: "P2010",
      meta: { code: postgresCode },
    });
    return;
  }

  await tx.$executeRawUnsafe("RELEASE SAVEPOINT expected_database_rejection");
  throw new Error("Expected the database operation to be rejected");
}

async function readTripSlipCounts(
  client: Pick<Prisma.TransactionClient, "$queryRaw">,
): Promise<TripSlipCounts[]> {
  return client.$queryRaw<TripSlipCounts[]>`
    SELECT
      (SELECT count(*) FROM "Trip") AS "trip",
      (SELECT count(*) FROM "TripCheckpoint") AS "checkpoint",
      (SELECT count(*) FROM "TripCheckpointAttendance") AS "checkpointAttendance",
      (SELECT count(*) FROM "PermissionSlip") AS "permissionSlip",
      (SELECT count(*) FROM "PermissionSlipVersion") AS "version",
      (SELECT count(*) FROM "PermissionSlipRecipient") AS "recipient",
      (SELECT count(*) FROM "PermissionSlipResponse") AS "response",
      (SELECT count(*) FROM "PermissionSlipException") AS "exception",
      (SELECT count(*) FROM "PermissionSlipReminder") AS "reminder"
  `;
}

async function insertTrip(
  tx: Prisma.TransactionClient,
  fixture: TripSlipFixture,
  options: {
    id?: string;
    tenantId?: string;
    createdByUserId?: string;
  } = {},
): Promise<string> {
  const id = options.id ?? randomUUID();
  await tx.$executeRaw`
    INSERT INTO "Trip" (
      "id", "tenantId", "title", "destination", "startsAt", "endsAt",
      "createdByUserId"
    ) VALUES (
      ${id}, ${options.tenantId ?? fixture.tenantAId}, 'Museum visit', 'Science Museum',
      ${new Date("2026-10-12T08:30:00.000Z")},
      ${new Date("2026-10-12T16:00:00.000Z")}, ${options.createdByUserId ?? fixture.staffAId}
    )
  `;
  return id;
}

async function insertCheckpoint(
  tx: Prisma.TransactionClient,
  fixture: TripSlipFixture,
  options: {
    tripId: string;
    label: string;
    position: number;
    tenantId?: string;
  },
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "TripCheckpoint" (
      "id", "tenantId", "tripId", "label", "position", "createdByUserId"
    ) VALUES (
      ${id}, ${options.tenantId ?? fixture.tenantAId}, ${options.tripId},
      ${options.label}, ${options.position}, ${fixture.staffAId}
    )
  `;
  return id;
}

async function insertCheckpointAttendance(
  tx: Prisma.TransactionClient,
  fixture: TripSlipFixture,
  checkpointId: string,
  childId = fixture.childAId,
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "TripCheckpointAttendance" (
      "id", "tenantId", "tripCheckpointId", "childId", "present", "markedByUserId"
    ) VALUES (
      ${randomUUID()}, ${fixture.tenantAId}, ${checkpointId}, ${childId}, true,
      ${fixture.staffAId}
    )
  `;
}

async function insertPermissionSlip(
  tx: Prisma.TransactionClient,
  fixture: TripSlipFixture,
  tripId: string,
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "PermissionSlip" (
      "id", "tenantId", "tripId", "createdByUserId"
    ) VALUES (
      ${id}, ${fixture.tenantAId}, ${tripId}, ${fixture.staffAId}
    )
  `;
  return id;
}

async function insertPermissionSlipVersion(
  tx: Prisma.TransactionClient,
  fixture: TripSlipFixture,
  options: {
    permissionSlipId: string;
    version: number;
    changeClassification?: "INITIAL" | "MATERIAL" | "NON_MATERIAL";
    requiresReconsent?: boolean;
    supersedesVersionId?: string;
  },
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "PermissionSlipVersion" (
      "id", "tenantId", "permissionSlipId", "version", "contentSnapshot",
      "changeClassification", "requiresReconsent", "supersedesVersionId", "createdByUserId"
    ) VALUES (
      ${id}, ${fixture.tenantAId}, ${options.permissionSlipId}, ${options.version},
      ${JSON.stringify({ wording: "I consent to the museum visit." })}::jsonb,
      ${options.changeClassification ?? "INITIAL"}::"PermissionSlipChangeClassification",
      ${options.requiresReconsent ?? false}, ${options.supersedesVersionId ?? null},
      ${fixture.staffAId}
    )
  `;
  return id;
}

async function insertRecipient(
  tx: Prisma.TransactionClient,
  fixture: TripSlipFixture,
  permissionSlipVersionId: string,
  childId = fixture.childAId,
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "PermissionSlipRecipient" (
      "id", "tenantId", "permissionSlipVersionId", "childId"
    ) VALUES (
      ${id}, ${fixture.tenantAId}, ${permissionSlipVersionId}, ${childId}
    )
  `;
  return id;
}

async function publishVersion(
  tx: Prisma.TransactionClient,
  fixture: TripSlipFixture,
  versionId: string,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "PermissionSlipVersion"
    SET "versionHash" = ${PUBLISHED_VERSION_HASH},
        "publishedAt" = ${new Date("2026-10-01T09:00:00.000Z")},
        "publishedByUserId" = ${fixture.staffAId}
    WHERE "id" = ${versionId}
  `;
}

async function deleteTripSlipRowsIfPresent(
  client: PrismaClientType,
): Promise<void> {
  const [row] = await client.$queryRaw<Array<{ exists: string | null }>>`
    SELECT to_regclass('app."Trip"')::text AS "exists"
  `;

  if (!row?.exists) return;

  await client.$executeRawUnsafe(`
    TRUNCATE TABLE
      "TripCheckpointAttendance",
      "TripCheckpoint",
      "PermissionSlipResponse",
      "PermissionSlipException",
      "PermissionSlipReminder",
      "PermissionSlipRecipient",
      "PermissionSlipVersion",
      "PermissionSlip",
      "Trip"
  `);
}

describe("ACE trips and permission-slip fact storage", () => {
  let fixture: TripSlipFixture;

  beforeAll(async () => {
    if (!requireDatabase()) return;

    const ids = {
      orgAId: randomUUID(),
      orgBId: randomUUID(),
      tenantAId: randomUUID(),
      tenantBId: randomUUID(),
      staffAId: randomUUID(),
      staffBId: randomUUID(),
      witnessAId: randomUUID(),
      guardianAUserId: randomUUID(),
      childAId: randomUUID(),
      childA2Id: randomUUID(),
      childBId: randomUUID(),
      guardianAIdentityId: randomUUID(),
      guardianAChildRelationshipId: randomUUID(),
      guardianAChild2RelationshipId: randomUUID(),
    };
    fixture = ids;

    await prisma.org.createMany({
      data: [
        { id: ids.orgAId, name: `Trip org A ${ids.orgAId}`, slug: `trip-a-${ids.orgAId}`, planCode: "trial" },
        { id: ids.orgBId, name: `Trip org B ${ids.orgBId}`, slug: `trip-b-${ids.orgBId}`, planCode: "trial" },
      ],
    });
    await prisma.tenant.createMany({
      data: [
        { id: ids.tenantAId, orgId: ids.orgAId, name: `Trip tenant A ${ids.tenantAId}`, slug: `trip-a-${ids.tenantAId}` },
        { id: ids.tenantBId, orgId: ids.orgBId, name: `Trip tenant B ${ids.tenantBId}`, slug: `trip-b-${ids.tenantBId}` },
      ],
    });

    // Fixture setup uses the bootstrap connection so it can create membership
    // records. Assertions below switch to the non-bypass tenant role.
    await withTenantRlsContext(ids.tenantAId, ids.orgAId, async (tx) => {
      await tx.user.createMany({
        data: [ids.staffAId, ids.witnessAId, ids.guardianAUserId].map((id) => ({
          id,
          email: `${id}@example.test`,
          tenantId: ids.tenantAId,
        })),
      });
      await tx.siteMembership.createMany({
        data: [ids.staffAId, ids.witnessAId].map((userId) => ({
          tenantId: ids.tenantAId,
          userId,
        })),
      });
      await tx.child.createMany({
        data: [ids.childAId, ids.childA2Id].map((id, index) => ({
          id,
          firstName: "Trip",
          lastName: `Child A${index + 1}`,
          tenantId: ids.tenantAId,
        })),
      });
      await tx.$executeRaw`
        INSERT INTO "GuardianIdentity" ("id", "tenantId", "userId")
        VALUES (${ids.guardianAIdentityId}, ${ids.tenantAId}, ${ids.guardianAUserId})
      `;
      await tx.$executeRaw`
        INSERT INTO "GuardianChildRelationship" (
          "id", "tenantId", "guardianIdentityId", "childId"
        ) VALUES
          (${ids.guardianAChildRelationshipId}, ${ids.tenantAId},
            ${ids.guardianAIdentityId}, ${ids.childAId}),
          (${ids.guardianAChild2RelationshipId}, ${ids.tenantAId},
            ${ids.guardianAIdentityId}, ${ids.childA2Id})
      `;
    });

    await withTenantRlsContext(ids.tenantBId, ids.orgBId, async (tx) => {
      await tx.user.create({
        data: { id: ids.staffBId, email: `${ids.staffBId}@example.test`, tenantId: ids.tenantBId },
      });
      await tx.siteMembership.create({ data: { tenantId: ids.tenantBId, userId: ids.staffBId } });
      await tx.child.create({
        data: { id: ids.childBId, firstName: "Trip", lastName: "Child B", tenantId: ids.tenantBId },
      });
    });
  });

  afterEach(async () => {
    if (!isDatabaseAvailable()) return;
    await deleteTripSlipRowsIfPresent(prisma);
  });

  afterAll(async () => {
    if (!isDatabaseAvailable()) return;
    await deleteTripSlipRowsIfPresent(prisma);
    await prisma.guardianChildRelationship.deleteMany({
      where: { id: { in: [fixture.guardianAChildRelationshipId, fixture.guardianAChild2RelationshipId] } },
    });
    await prisma.guardianIdentity.deleteMany({ where: { id: fixture.guardianAIdentityId } });
    await prisma.child.deleteMany({ where: { id: { in: [fixture.childAId, fixture.childA2Id, fixture.childBId] } } });
    await prisma.siteMembership.deleteMany({ where: { userId: { in: [fixture.staffAId, fixture.staffBId, fixture.witnessAId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [fixture.staffAId, fixture.staffBId, fixture.witnessAId, fixture.guardianAUserId] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [fixture.tenantAId, fixture.tenantBId] } } });
    await prisma.org.deleteMany({ where: { id: { in: [fixture.orgAId, fixture.orgBId] } } });
  });

  it("supports ordered child-only attendance checkpoints that can be added during a trip", async () => {
    if (!isDatabaseAvailable()) return;

    const tenantBTripId = await withTripSlipRlsContext(
      fixture.tenantBId,
      fixture.orgBId,
      (tx) => insertTrip(tx, fixture, {
        tenantId: fixture.tenantBId,
        createdByUserId: fixture.staffBId,
      }),
    );
    await withTripSlipRlsContext(fixture.tenantAId, fixture.orgAId, async (tx) => {
      const tripId = await insertTrip(tx, fixture);
      const labels = ["Before boarding", "Arrival", "Lunch", "Before departure", "School return"];
      const checkpoints = await Promise.all(labels.map((label, index) => insertCheckpoint(tx, fixture, { tripId, label, position: index + 1 })));
      for (const checkpointId of checkpoints) await insertCheckpointAttendance(tx, fixture, checkpointId);
      await insertCheckpoint(tx, fixture, { tripId, label: "Register at gallery", position: 6 });

      const rows = await tx.$queryRaw<Array<{ label: string }>>`
        SELECT "label" FROM "TripCheckpoint"
        WHERE "tripId" = ${tripId} ORDER BY "position"
      `;
      expect(rows.map((row) => row.label)).toEqual([...labels, "Register at gallery"]);
      const [attendance] = await tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*) FROM "TripCheckpointAttendance" WHERE "childId" = ${fixture.childAId}
      `;
      expect(attendance.count).toBe(5n);

      await expectDatabaseRejection(
        tx,
        () => insertCheckpoint(tx, fixture, { tripId, label: "Duplicate", position: 1 }),
        "23505",
      );
      await expectDatabaseRejection(
        tx,
        () => insertCheckpointAttendance(tx, fixture, checkpoints[0]),
        "23505",
      );
      await expectDatabaseRejection(
        tx,
        () => insertCheckpoint(tx, fixture, { tripId: tenantBTripId, label: "Wrong tenant", position: 7 }),
        "23503",
      );
    });
  });

  it("freezes published consent wording and requires explicit material reconsent", async () => {
    if (!isDatabaseAvailable()) return;

    await withTripSlipRlsContext(fixture.tenantAId, fixture.orgAId, async (tx) => {
      const permissionSlipId = await insertPermissionSlip(tx, fixture, await insertTrip(tx, fixture));
      const versionId = await insertPermissionSlipVersion(tx, fixture, { permissionSlipId, version: 1 });
      const recipientId = await insertRecipient(tx, fixture, versionId);
      await publishVersion(tx, fixture, versionId);

      await expectDatabaseRejection(
        tx,
        () => tx.$executeRaw`UPDATE "PermissionSlipVersion" SET "contentSnapshot" = ${JSON.stringify({ wording: "Changed" })}::jsonb WHERE "id" = ${versionId}`,
        "55000",
      );
      const materialVersionId = await insertPermissionSlipVersion(tx, fixture, {
        permissionSlipId,
        version: 2,
        changeClassification: "MATERIAL",
        requiresReconsent: true,
        supersedesVersionId: versionId,
      });
      expect(materialVersionId).toEqual(expect.any(String));
      await expectDatabaseRejection(
        tx,
        () => tx.$executeRaw`
          UPDATE "PermissionSlipRecipient"
          SET "permissionSlipVersionId" = ${materialVersionId}
          WHERE "id" = ${recipientId}
        `,
        "55000",
      );
      const otherTripId = await insertTrip(tx, fixture);
      await expectDatabaseRejection(
        tx,
        () => tx.$executeRaw`
          UPDATE "PermissionSlip"
          SET "tripId" = ${otherTripId}
          WHERE "id" = ${permissionSlipId}
        `,
        "55000",
      );
      await expectDatabaseRejection(
        tx,
        () => insertPermissionSlipVersion(tx, fixture, { permissionSlipId, version: 3, changeClassification: "MATERIAL", requiresReconsent: false }),
        "23514",
      );
    });
  });

  it("binds guardian responses and physical exceptions to the exact child and version", async () => {
    if (!isDatabaseAvailable()) return;

    await withTripSlipRlsContext(fixture.tenantAId, fixture.orgAId, async (tx) => {
      const permissionSlipId = await insertPermissionSlip(tx, fixture, await insertTrip(tx, fixture));
      const versionId = await insertPermissionSlipVersion(tx, fixture, { permissionSlipId, version: 1 });
      const recipientId = await insertRecipient(tx, fixture, versionId);
      await publishVersion(tx, fixture, versionId);
      const idempotencyKey = randomUUID();

      await tx.$executeRaw`
        INSERT INTO "PermissionSlipResponse" (
          "id", "tenantId", "permissionSlipVersionId", "permissionSlipRecipientId",
          "childId", "guardianChildRelationshipId", "guardianIdentityId", "versionHash",
          "decision", "responsePayload", "idempotencyKey"
        ) VALUES (
          ${randomUUID()}, ${fixture.tenantAId}, ${versionId}, ${recipientId}, ${fixture.childAId},
          ${fixture.guardianAChildRelationshipId}, ${fixture.guardianAIdentityId},
          ${PUBLISHED_VERSION_HASH}, 'ACCEPTED', 'typed acknowledgement', ${idempotencyKey}
        )
      `;
      await expectDatabaseRejection(
        tx,
        () => tx.$executeRaw`
          INSERT INTO "PermissionSlipResponse" (
            "id", "tenantId", "permissionSlipVersionId", "permissionSlipRecipientId",
            "childId", "guardianChildRelationshipId", "guardianIdentityId", "versionHash",
            "decision", "responsePayload", "idempotencyKey"
          ) VALUES (
            ${randomUUID()}, ${fixture.tenantAId}, ${versionId}, ${recipientId}, ${fixture.childAId},
            ${fixture.guardianAChildRelationshipId}, ${fixture.guardianAIdentityId},
            ${PUBLISHED_VERSION_HASH}, 'ACCEPTED', 'retry', ${idempotencyKey}
          )
        `,
        "23505",
      );
      await tx.$executeRaw`
        INSERT INTO "PermissionSlipException" (
          "id", "tenantId", "permissionSlipVersionId", "permissionSlipRecipientId",
          "childId", "versionHash", "source", "decision", "recordedByUserId", "reason", "witnessUserId"
        ) VALUES (
          ${randomUUID()}, ${fixture.tenantAId}, ${versionId}, ${recipientId}, ${fixture.childAId},
          ${PUBLISHED_VERSION_HASH}, 'PHYSICAL', 'ACCEPTED', ${fixture.staffAId},
          'Signed paper consent checked by two staff members.', ${fixture.witnessAId}
        )
      `;
      await tx.$executeRaw`
        INSERT INTO "PermissionSlipReminder" (
          "id", "tenantId", "permissionSlipVersionId", "permissionSlipRecipientId",
          "childId", "scheduledFor"
        ) VALUES (
          ${randomUUID()}, ${fixture.tenantAId}, ${versionId}, ${recipientId}, ${fixture.childAId},
          ${new Date("2026-10-05T09:00:00.000Z")}
        )
      `;
      await expectDatabaseRejection(
        tx,
        () => tx.$executeRaw`
          INSERT INTO "PermissionSlipException" (
            "id", "tenantId", "permissionSlipVersionId", "permissionSlipRecipientId",
            "childId", "versionHash", "source", "decision", "recordedByUserId", "reason", "witnessUserId"
          ) VALUES (
            ${randomUUID()}, ${fixture.tenantAId}, ${versionId}, ${recipientId}, ${fixture.childAId},
            ${PUBLISHED_VERSION_HASH}, 'TELEPHONE', 'ACCEPTED', ${fixture.staffAId}, '', ${fixture.witnessAId}
          )
        `,
        "23514",
      );
      await expectDatabaseRejection(
        tx,
        () => tx.$executeRaw`
          INSERT INTO "PermissionSlipResponse" (
            "id", "tenantId", "permissionSlipVersionId", "permissionSlipRecipientId",
            "childId", "guardianChildRelationshipId", "guardianIdentityId", "versionHash",
            "decision", "responsePayload", "idempotencyKey"
          ) VALUES (
            ${randomUUID()}, ${fixture.tenantAId}, ${versionId}, ${recipientId}, ${fixture.childAId},
            ${fixture.guardianAChild2RelationshipId}, ${fixture.guardianAIdentityId},
            ${PUBLISHED_VERSION_HASH}, 'DECLINED', 'wrong child', ${randomUUID()}
          )
        `,
        "23503",
      );
      const [factCounts] = await tx.$queryRaw<Array<{ exception: bigint; reminder: bigint }>>`
        SELECT
          (SELECT count(*) FROM "PermissionSlipException") AS "exception",
          (SELECT count(*) FROM "PermissionSlipReminder") AS "reminder"
      `;
      expect(factCounts).toEqual({ exception: 1n, reminder: 1n });
    });
  });

  it("fails closed across tenant and missing-context reads", async () => {
    if (!isDatabaseAvailable()) return;

    await withTripSlipRlsContext(fixture.tenantAId, fixture.orgAId, async (tx) => {
      await insertTrip(tx, fixture);
    });
    // The normal local test connection can bypass RLS. The CI profile creates
    // and selects a dedicated NOBYPASSRLS role before this assertion.
    if (!useTenantRlsRole()) return;

    const tenantBCounts = await withTripSlipRlsContext(
      fixture.tenantBId,
      fixture.orgBId,
      readTripSlipCounts,
    );
    expect(tenantBCounts).toEqual(NO_TRIP_SLIP_ROWS);

    const noContextCounts = await withNoTenantRlsContext(readTripSlipCounts);
    expect(noContextCounts).toEqual(NO_TRIP_SLIP_ROWS);
  });
});
