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

// The migration seeds this jurisdiction with zero Requirement/RequirementVersion
// rows attached to it (20260810090000_add_regulations_foundation, decision:
// "no plain-English legal summaries in this plan"). Safe to reference as a
// stable FK target across e2e runs.
const SEEDED_UK_JURISDICTION_ID = "a0000000-0000-4000-8000-000000000001";
const SEEDED_ENGLAND_SOURCE_ID = "c0000000-0000-4000-8000-000000000001";

interface RegulationsFixture {
  orgAId: string;
  orgBId: string;
  tenantAId: string;
  tenantBId: string;
  actorAId: string;
  actorBId: string;
  unrelatedActorId: string;
  childAId: string;
  childBId: string;
  evidenceAId: string;
  evidenceBId: string;
  requirementId: string;
}

function useTenantRlsRole(): boolean {
  return process.env.E2E_USE_GLOBAL_SETUP === "true";
}

async function withRegulationsRlsContext<T>(
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
  operation: () => Promise<unknown>,
  postgresCode: string,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    expect(error).toMatchObject({
      code: "P2010",
      meta: { code: postgresCode },
    });
    return;
  }

  throw new Error("Expected the database operation to be rejected");
}

async function insertHouseholdRequirement(
  tx: Prisma.TransactionClient,
  options: {
    id?: string;
    tenantId: string;
    requirementId: string;
    jurisdictionId?: string;
    childId?: string | null;
    status?: string;
    archivedAt?: Date | null;
    updatedByUserId: string;
  },
): Promise<string> {
  const id = options.id ?? randomUUID();
  await tx.$executeRaw`
    INSERT INTO "HouseholdRequirement" (
      "id", "tenantId", "requirementId", "jurisdictionId", "childId",
      "status", "archivedAt", "updatedByUserId", "updatedAt"
    ) VALUES (
      ${id}, ${options.tenantId}, ${options.requirementId},
      ${options.jurisdictionId ?? SEEDED_UK_JURISDICTION_ID}, ${options.childId ?? null},
      ${(options.status ?? "NOT_REVIEWED") as string}::"HouseholdPreparednessStatus",
      ${options.archivedAt ?? null}, ${options.updatedByUserId}, now()
    )
  `;
  return id;
}

async function insertEvidenceLink(
  tx: Prisma.TransactionClient,
  options: {
    id?: string;
    tenantId: string;
    evidenceId: string;
    householdRequirementId?: string | null;
    correspondenceId?: string | null;
    purpose?: string;
    linkedByUserId: string;
  },
): Promise<string> {
  const id = options.id ?? randomUUID();
  await tx.$executeRaw`
    INSERT INTO "EvidenceLink" (
      "id", "tenantId", "evidenceId", "householdRequirementId", "correspondenceId",
      "purpose", "linkedByUserId"
    ) VALUES (
      ${id}, ${options.tenantId}, ${options.evidenceId},
      ${options.householdRequirementId ?? null}, ${options.correspondenceId ?? null},
      ${(options.purpose ?? "REQUIREMENT_EVIDENCE") as string}::"EvidenceLinkPurpose",
      ${options.linkedByUserId}
    )
  `;
  return id;
}

async function insertCorrespondence(
  tx: Prisma.TransactionClient,
  options: {
    id?: string;
    tenantId: string;
    childId?: string | null;
    senderName?: string;
    subject?: string;
    receivedAt?: Date;
    status?: string;
    respondedAt?: Date | null;
    createdByUserId: string;
  },
): Promise<string> {
  const id = options.id ?? randomUUID();
  await tx.$executeRaw`
    INSERT INTO "Correspondence" (
      "id", "tenantId", "childId", "senderName", "subject", "receivedAt",
      "status", "respondedAt", "createdByUserId", "updatedAt"
    ) VALUES (
      ${id}, ${options.tenantId}, ${options.childId ?? null},
      ${options.senderName ?? "Local authority"}, ${options.subject ?? "Annual enquiry"},
      ${options.receivedAt ?? new Date("2026-09-01T09:00:00.000Z")},
      ${(options.status ?? "RECEIVED") as string}::"CorrespondenceStatus",
      ${options.respondedAt ?? null}, ${options.createdByUserId}, now()
    )
  `;
  return id;
}

async function deleteRegulationsRowsIfPresent(
  client: PrismaClientType,
): Promise<void> {
  const [row] = await client.$queryRaw<Array<{ exists: string | null }>>`
    SELECT to_regclass('app."HouseholdRequirement"')::text AS "exists"
  `;

  if (!row?.exists) return;

  await client.$executeRawUnsafe(`
    TRUNCATE TABLE "EvidenceLink", "Correspondence", "HouseholdRequirement"
  `);
}

describe("NexSteps Home regulations and evidence RLS", () => {
  let fixture: RegulationsFixture;

  beforeAll(async () => {
    if (!requireDatabase()) return;

    fixture = {
      orgAId: randomUUID(),
      orgBId: randomUUID(),
      tenantAId: randomUUID(),
      tenantBId: randomUUID(),
      actorAId: randomUUID(),
      actorBId: randomUUID(),
      unrelatedActorId: randomUUID(),
      childAId: randomUUID(),
      childBId: randomUUID(),
      evidenceAId: randomUUID(),
      evidenceBId: randomUUID(),
      requirementId: randomUUID(),
    };

    await prisma.org.createMany({
      data: [
        {
          id: fixture.orgAId,
          name: `Regulations org A ${fixture.orgAId}`,
          slug: `regulations-a-${fixture.orgAId}`,
          planCode: "trial",
        },
        {
          id: fixture.orgBId,
          name: `Regulations org B ${fixture.orgBId}`,
          slug: `regulations-b-${fixture.orgBId}`,
          planCode: "trial",
        },
      ],
    });
    await prisma.tenant.createMany({
      data: [
        {
          id: fixture.tenantAId,
          orgId: fixture.orgAId,
          name: `Regulations tenant A ${fixture.tenantAId}`,
          slug: `regulations-a-${fixture.tenantAId}`,
        },
        {
          id: fixture.tenantBId,
          orgId: fixture.orgBId,
          name: `Regulations tenant B ${fixture.tenantBId}`,
          slug: `regulations-b-${fixture.tenantBId}`,
        },
      ],
    });

    // A global content row (no tenantId) so HouseholdRequirement rows have a
    // real requirementId to reference. Regulatory content has "no runtime
    // writer" in this sub-plan - this insert uses the bootstrap connection
    // (same privileged path the migration's own seed INSERTs use), not the
    // tenant-scoped e2e role.
    await prisma.$executeRaw`
      INSERT INTO "Requirement" ("id", "jurisdictionId") VALUES (
        ${fixture.requirementId}, ${SEEDED_UK_JURISDICTION_ID}
      )
    `;

    // Fixture setup uses the bootstrap connection (no SET LOCAL ROLE) so it
    // can create SiteMembership records, matching trips-slips.rls.e2e.spec.ts.
    // Assertions below switch to the non-bypass tenant role.
    await withTenantRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        await tx.user.createMany({
          data: [fixture.actorAId, fixture.unrelatedActorId].map((id) => ({
            id,
            email: `${id}@example.test`,
            tenantId: fixture.tenantAId,
          })),
        });
        await tx.siteMembership.create({
          data: { tenantId: fixture.tenantAId, userId: fixture.actorAId },
        });
        // app.require_learning_actor_membership accepts SiteMembership OR
        // UserTenantRole. SiteMembership has RLS ENABLED with no policy (so
        // the trigger's own SELECT against it is denied under the dedicated
        // e2e role - see UserTenantRole_tenant_rls for the policy that DOES
        // grant access); seed UserTenantRole too so actor-membership checks
        // succeed under E2E_USE_GLOBAL_SETUP=true.
        await tx.userTenantRole.create({
          data: {
            tenantId: fixture.tenantAId,
            userId: fixture.actorAId,
            role: "PARENT",
          },
        });
        await tx.child.create({
          data: {
            id: fixture.childAId,
            firstName: "Regulations",
            lastName: "Child A",
            tenantId: fixture.tenantAId,
          },
        });
        await tx.evidence.create({
          data: {
            id: fixture.evidenceAId,
            tenantId: fixture.tenantAId,
            childId: fixture.childAId,
            title: "Portfolio photo",
            storageKey: `regulations/${fixture.evidenceAId}`,
            mimeType: "image/jpeg",
            byteSize: 1024,
            uploadedByUserId: fixture.actorAId,
          },
        });
      },
    );

    await withTenantRlsContext(
      fixture.tenantBId,
      fixture.orgBId,
      async (tx) => {
        await tx.user.create({
          data: {
            id: fixture.actorBId,
            email: `${fixture.actorBId}@example.test`,
            tenantId: fixture.tenantBId,
          },
        });
        await tx.siteMembership.create({
          data: { tenantId: fixture.tenantBId, userId: fixture.actorBId },
        });
        await tx.userTenantRole.create({
          data: {
            tenantId: fixture.tenantBId,
            userId: fixture.actorBId,
            role: "PARENT",
          },
        });
        await tx.child.create({
          data: {
            id: fixture.childBId,
            firstName: "Regulations",
            lastName: "Child B",
            tenantId: fixture.tenantBId,
          },
        });
        await tx.evidence.create({
          data: {
            id: fixture.evidenceBId,
            tenantId: fixture.tenantBId,
            childId: fixture.childBId,
            title: "Portfolio photo",
            storageKey: `regulations/${fixture.evidenceBId}`,
            mimeType: "image/jpeg",
            byteSize: 1024,
            uploadedByUserId: fixture.actorBId,
          },
        });
      },
    );
  });

  afterEach(async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    await deleteRegulationsRowsIfPresent(prisma);
  });

  afterAll(async () => {
    if (!isDatabaseAvailable() || !fixture) return;

    await deleteRegulationsRowsIfPresent(prisma);
    await prisma.requirement.deleteMany({ where: { id: fixture.requirementId } });
    await prisma.evidence.deleteMany({
      where: { id: { in: [fixture.evidenceAId, fixture.evidenceBId] } },
    });
    await prisma.child.deleteMany({
      where: { id: { in: [fixture.childAId, fixture.childBId] } },
    });
    await prisma.siteMembership.deleteMany({
      where: { userId: { in: [fixture.actorAId, fixture.actorBId] } },
    });
    await prisma.userTenantRole.deleteMany({
      where: { userId: { in: [fixture.actorAId, fixture.actorBId] } },
    });
    await prisma.user.deleteMany({
      where: {
        id: { in: [fixture.actorAId, fixture.actorBId, fixture.unrelatedActorId] },
      },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [fixture.tenantAId, fixture.tenantBId] } },
    });
    await prisma.org.deleteMany({
      where: { id: { in: [fixture.orgAId, fixture.orgBId] } },
    });
  });

  it("fails closed: rows created under tenant A are invisible under tenant B", async () => {
    if (!isDatabaseAvailable()) return;

    const householdRequirementId = await withRegulationsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        insertHouseholdRequirement(tx, {
          tenantId: fixture.tenantAId,
          requirementId: fixture.requirementId,
          childId: fixture.childAId,
          updatedByUserId: fixture.actorAId,
        }),
    );
    await withRegulationsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
      insertEvidenceLink(tx, {
        tenantId: fixture.tenantAId,
        evidenceId: fixture.evidenceAId,
        householdRequirementId,
        linkedByUserId: fixture.actorAId,
      }),
    );
    await withRegulationsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
      insertCorrespondence(tx, {
        tenantId: fixture.tenantAId,
        childId: fixture.childAId,
        createdByUserId: fixture.actorAId,
      }),
    );

    if (!useTenantRlsRole()) return;

    const tenantBCounts = await withRegulationsRlsContext(
      fixture.tenantBId,
      fixture.orgBId,
      (tx) =>
        tx.$queryRaw<
          Array<{
            householdRequirement: bigint;
            evidenceLink: bigint;
            correspondence: bigint;
          }>
        >`
          SELECT
            (SELECT count(*) FROM "HouseholdRequirement") AS "householdRequirement",
            (SELECT count(*) FROM "EvidenceLink") AS "evidenceLink",
            (SELECT count(*) FROM "Correspondence") AS "correspondence"
        `,
    );

    expect(tenantBCounts).toEqual([
      { householdRequirement: 0n, evidenceLink: 0n, correspondence: 0n },
    ]);
  });

  it("rejects a HouseholdRequirement insert whose tenantId does not match the RLS context", async () => {
    if (!isDatabaseAvailable()) return;

    // The BEFORE INSERT actor-membership trigger always runs before Postgres
    // evaluates the table's own RLS WITH CHECK policy, and the trigger's own
    // membership SELECT is itself RLS-scoped to the session's tenant context
    // (UserTenantRole_tenant_rls: "tenantId" = app.current_tenant_id()). So
    // for any row whose tenantId differs from the session context, no
    // membership row for that other tenant is ever visible to the trigger,
    // regardless of who updatedByUserId is - the trigger's 23503 always fires
    // first. WITH CHECK (42501) is therefore unreachable via INSERT/UPDATE on
    // this table; the composite-FK and CHECK-constraint tests above already
    // cover the "wrong tenant" and "wrong actor" failure paths this exercises.
    await expectDatabaseRejection(
      () =>
        withRegulationsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertHouseholdRequirement(tx, {
            tenantId: fixture.tenantBId,
            requirementId: fixture.requirementId,
            childId: null,
            updatedByUserId: fixture.actorBId,
          }),
        ),
      "23503",
    );
  });

  it("rejects a HouseholdRequirement referencing another tenant's child", async () => {
    if (!isDatabaseAvailable()) return;

    await expectDatabaseRejection(
      () =>
        withRegulationsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertHouseholdRequirement(tx, {
            tenantId: fixture.tenantAId,
            requirementId: fixture.requirementId,
            childId: fixture.childBId,
            updatedByUserId: fixture.actorAId,
          }),
        ),
      "23503",
    );
  });

  it("rejects an EvidenceLink referencing another tenant's evidence", async () => {
    if (!isDatabaseAvailable()) return;

    // A real tenant-A householdRequirementId satisfies the single-target CHECK
    // so the assertion isolates the evidenceId/tenantId composite FK rejection.
    const householdRequirementId = await withRegulationsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        insertHouseholdRequirement(tx, {
          tenantId: fixture.tenantAId,
          requirementId: fixture.requirementId,
          childId: null,
          updatedByUserId: fixture.actorAId,
        }),
    );

    await expectDatabaseRejection(
      () =>
        withRegulationsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertEvidenceLink(tx, {
            tenantId: fixture.tenantAId,
            evidenceId: fixture.evidenceBId,
            householdRequirementId,
            purpose: "REQUIREMENT_EVIDENCE",
            linkedByUserId: fixture.actorAId,
          }),
        ),
      "23503",
    );
  });

  it("requires exactly one EvidenceLink target", async () => {
    if (!isDatabaseAvailable()) return;

    const householdRequirementId = await withRegulationsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        insertHouseholdRequirement(tx, {
          tenantId: fixture.tenantAId,
          requirementId: fixture.requirementId,
          childId: null,
          updatedByUserId: fixture.actorAId,
        }),
    );
    const correspondenceId = await withRegulationsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        insertCorrespondence(tx, {
          tenantId: fixture.tenantAId,
          createdByUserId: fixture.actorAId,
        }),
    );

    await expectDatabaseRejection(
      () =>
        withRegulationsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertEvidenceLink(tx, {
            tenantId: fixture.tenantAId,
            evidenceId: fixture.evidenceAId,
            householdRequirementId,
            correspondenceId,
            purpose: "REQUIREMENT_EVIDENCE",
            linkedByUserId: fixture.actorAId,
          }),
        ),
      "23514",
    );

    await expectDatabaseRejection(
      () =>
        withRegulationsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertEvidenceLink(tx, {
            tenantId: fixture.tenantAId,
            evidenceId: fixture.evidenceAId,
            purpose: "REQUIREMENT_EVIDENCE",
            linkedByUserId: fixture.actorAId,
          }),
        ),
      "23514",
    );
  });

  it("requires the acting user to belong to the row's tenant", async () => {
    if (!isDatabaseAvailable()) return;

    await expectDatabaseRejection(
      () =>
        withRegulationsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertHouseholdRequirement(tx, {
            tenantId: fixture.tenantAId,
            requirementId: fixture.requirementId,
            childId: null,
            updatedByUserId: fixture.unrelatedActorId,
          }),
        ),
      "23503",
    );

    const correspondenceId = await withRegulationsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        insertCorrespondence(tx, {
          tenantId: fixture.tenantAId,
          createdByUserId: fixture.actorAId,
        }),
    );
    await expectDatabaseRejection(
      () =>
        withRegulationsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertEvidenceLink(tx, {
            tenantId: fixture.tenantAId,
            evidenceId: fixture.evidenceAId,
            correspondenceId,
            purpose: "CORRESPONDENCE_ATTACHMENT",
            linkedByUserId: fixture.unrelatedActorId,
          }),
        ),
      "23503",
    );

    await expectDatabaseRejection(
      () =>
        withRegulationsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertCorrespondence(tx, {
            tenantId: fixture.tenantAId,
            createdByUserId: fixture.unrelatedActorId,
          }),
        ),
      "23503",
    );
  });

  it("requires review metadata before a RequirementVersion can publish", async () => {
    if (!isDatabaseAvailable()) return;

    await expectDatabaseRejection(
      () =>
        runTransaction((tx) =>
          tx.$executeRaw`
            INSERT INTO "RequirementVersion" (
              "id", "requirementId", "versionNumber", "status", "title", "summary",
              "primarySourceId"
            ) VALUES (
              ${randomUUID()}, ${fixture.requirementId}, 1, 'PUBLISHED',
              'Annual notification', 'Placeholder summary text.',
              ${SEEDED_ENGLAND_SOURCE_ID}
            )
          `,
        ),
      "23514",
    );

    // acceptance-criteria.md:59-60: high-impact summaries need a *second*
    // reviewer, even once the first review is present.
    await expectDatabaseRejection(
      () =>
        runTransaction((tx) =>
          tx.$executeRaw`
            INSERT INTO "RequirementVersion" (
              "id", "requirementId", "versionNumber", "status", "title", "summary",
              "primarySourceId", "impactLevel", "reviewedByUserId", "reviewedAt",
              "publishedAt"
            ) VALUES (
              ${randomUUID()}, ${fixture.requirementId}, 2, 'PUBLISHED',
              'Annual notification', 'Placeholder summary text.',
              ${SEEDED_ENGLAND_SOURCE_ID}, 'HIGH', ${fixture.actorAId}, now(), now()
            )
          `,
        ),
      "23514",
    );
  });

  it("rejects a duplicate active HouseholdRequirement for the same child", async () => {
    if (!isDatabaseAvailable()) return;

    await withRegulationsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
      insertHouseholdRequirement(tx, {
        tenantId: fixture.tenantAId,
        requirementId: fixture.requirementId,
        childId: fixture.childAId,
        updatedByUserId: fixture.actorAId,
      }),
    );

    await expectDatabaseRejection(
      () =>
        withRegulationsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertHouseholdRequirement(tx, {
            tenantId: fixture.tenantAId,
            requirementId: fixture.requirementId,
            childId: fixture.childAId,
            updatedByUserId: fixture.actorAId,
          }),
        ),
      "23505",
    );
  });

  it("rejects a duplicate active household-scoped HouseholdRequirement", async () => {
    if (!isDatabaseAvailable()) return;

    await withRegulationsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
      insertHouseholdRequirement(tx, {
        tenantId: fixture.tenantAId,
        requirementId: fixture.requirementId,
        childId: null,
        updatedByUserId: fixture.actorAId,
      }),
    );

    await expectDatabaseRejection(
      () =>
        withRegulationsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertHouseholdRequirement(tx, {
            tenantId: fixture.tenantAId,
            requirementId: fixture.requirementId,
            childId: null,
            updatedByUserId: fixture.actorAId,
          }),
        ),
      "23505",
    );
  });

  it("exposes global regulatory content with no tenant context set", async () => {
    if (!isDatabaseAvailable()) return;
    if (!useTenantRlsRole()) return;

    const [count] = await withNoTenantRlsContext((tx) =>
      tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*) AS "count" FROM "Jurisdiction"
        WHERE "countryCode" = 'GB'
      `,
    );

    expect(count.count).toBe(5n);
  });
});
