import { randomUUID } from "node:crypto";
import type { PrismaClientType } from "../index";

const describeIfDb =
  process.env.PATHWAY_RUN_DB_INTEGRATION_TESTS === "1"
    ? describe
    : describe.skip;

describeIfDb("notice guardian eligibility in the identity schema", () => {
  let prisma: PrismaClientType;

  beforeAll(async () => {
    const hostname = new URL(process.env.DATABASE_URL ?? "").hostname;
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      throw new Error(
        `Refusing to run: DATABASE_URL host "${hostname}" is not local. ` +
          "Set DATABASE_URL to a disposable local database.",
      );
    }
    prisma = (await import("../index")).prisma;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("enforces guardian and staff scope in the configured identity layout", async () => {
    const rollback = new Error("rollback notice eligibility probe");
    const id = () => randomUUID();
    const orgId = id();
    const tenantId = id();
    const otherTenantId = id();
    const childId = id();
    const guestChildId = id();
    const guardianId = id();
    const unlinkedId = id();
    const endedId = id();
    const noneId = id();
    const limitedId = id();
    const revokedId = id();
    const guestId = id();
    const studentGuardianId = id();
    const guardianUserId = id();
    const unlinkedUserId = id();
    const endedUserId = id();
    const noneUserId = id();
    const limitedUserId = id();
    const revokedUserId = id();
    const guestUserId = id();
    const studentUserId = id();
    const staffUserId = id();
    const outsiderUserId = id();

    await expect(
      prisma.$transaction(
        async (tx) => {
          await tx.org.create({
            data: {
              id: orgId,
              name: "Notice eligibility probe",
              slug: `notice-${orgId}`,
              planCode: "trial",
            },
          });
          await tx.tenant.create({
            data: {
              id: tenantId,
              orgId,
              name: "Notice eligibility site",
              slug: `notice-${tenantId}`,
            },
          });
          const users = [
            guardianUserId,
            unlinkedUserId,
            endedUserId,
            noneUserId,
            limitedUserId,
            revokedUserId,
            guestUserId,
            studentUserId,
            staffUserId,
            outsiderUserId,
          ];
          await tx.user.createMany({
            data: users.map((userId) => ({
              id: userId,
              email: `${userId}@example.test`,
              tenantId,
            })),
          });
          await tx.child.create({
            data: {
              id: childId,
              tenantId,
              firstName: "Notice",
              lastName: "Probe",
            },
          });
          await tx.child.create({
            data: {
              id: guestChildId,
              tenantId,
              firstName: "Guest",
              lastName: "Probe",
              isGuest: true,
            },
          });
          await tx.siteMembership.createMany({
            data: [staffUserId, studentUserId].map((userId) => ({
              tenantId,
              userId,
            })),
          });
          await tx.$executeRawUnsafe(`
            INSERT INTO "GuardianIdentity" ("id", "tenantId", "userId") VALUES
              ('${guardianId}', '${tenantId}', '${guardianUserId}'),
              ('${unlinkedId}', '${tenantId}', '${unlinkedUserId}'),
              ('${endedId}', '${tenantId}', '${endedUserId}'),
              ('${noneId}', '${tenantId}', '${noneUserId}'),
              ('${limitedId}', '${tenantId}', '${limitedUserId}'),
              ('${revokedId}', '${tenantId}', '${revokedUserId}'),
              ('${guestId}', '${tenantId}', '${guestUserId}'),
              ('${studentGuardianId}', '${tenantId}', '${studentUserId}')
          `);
          await tx.$executeRawUnsafe(`
            INSERT INTO "GuardianChildRelationship"
              ("id", "tenantId", "guardianIdentityId", "childId", "legalAccess", "startsAt", "endedAt", "revokedAt", "revokedByUserId", "revocationReason") VALUES
              ('${id()}', '${tenantId}', '${guardianId}', '${childId}', 'FULL', now() - interval '2 days', NULL, NULL, NULL, NULL),
              ('${id()}', '${tenantId}', '${endedId}', '${childId}', 'FULL', now() - interval '2 days', now() - interval '1 day', NULL, NULL, NULL),
              ('${id()}', '${tenantId}', '${noneId}', '${childId}', 'NONE', now() - interval '2 days', NULL, NULL, NULL, NULL),
              ('${id()}', '${tenantId}', '${limitedId}', '${childId}', 'LIMITED', now() - interval '2 days', NULL, NULL, NULL, NULL),
              ('${id()}', '${tenantId}', '${revokedId}', '${childId}', 'FULL', now() - interval '2 days', NULL, now() - interval '1 day', '${staffUserId}', 'Probe'),
              ('${id()}', '${tenantId}', '${guestId}', '${guestChildId}', 'FULL', now() - interval '2 days', NULL, NULL, NULL, NULL),
              ('${id()}', '${tenantId}', '${studentGuardianId}', '${childId}', 'FULL', now() - interval '2 days', NULL, NULL, NULL, NULL)
          `);
          await tx.$executeRawUnsafe(`
            INSERT INTO "StudentIdentity" ("id", "tenantId", "userId")
            VALUES ('${id()}', '${tenantId}', '${studentUserId}')
          `);
          await tx.$executeRawUnsafe(`
            DO $probe$ BEGIN
              PERFORM app.assert_ace_notice_audience_member_eligibility(
                '${tenantId}', '${guardianUserId}', 'GUARDIAN', '${guardianId}', 'PARENTS');
              PERFORM app.assert_ace_notice_audience_member_eligibility(
                '${tenantId}', '${staffUserId}', 'STAFF', NULL, 'STAFF');
            END $probe$
          `);
          await tx.$executeRawUnsafe(`
            DO $probe$
            DECLARE attempt record;
            BEGIN
              FOR attempt IN SELECT * FROM (VALUES
                ('${tenantId}', '${outsiderUserId}', 'GUARDIAN', '${guardianId}', 'PARENTS',
                 'Guardian notice recipients require their tenant identity'),
                ('${otherTenantId}', '${guardianUserId}', 'GUARDIAN', '${guardianId}', 'PARENTS',
                 'Guardian notice recipients require their tenant identity'),
                ('${tenantId}', '${unlinkedUserId}', 'GUARDIAN', '${unlinkedId}', 'PARENTS',
                 'Guardian notice recipients require a current guardian-child relationship'),
                ('${tenantId}', '${endedUserId}', 'GUARDIAN', '${endedId}', 'PARENTS',
                 'Guardian notice recipients require a current guardian-child relationship'),
                ('${tenantId}', '${noneUserId}', 'GUARDIAN', '${noneId}', 'PARENTS',
                 'Guardian notice recipients require a current guardian-child relationship'),
                ('${tenantId}', '${limitedUserId}', 'GUARDIAN', '${limitedId}', 'PARENTS',
                 'Guardian notice recipients require a current guardian-child relationship'),
                ('${tenantId}', '${revokedUserId}', 'GUARDIAN', '${revokedId}', 'PARENTS',
                 'Guardian notice recipients require a current guardian-child relationship'),
                ('${tenantId}', '${guestUserId}', 'GUARDIAN', '${guestId}', 'PARENTS',
                 'Guardian notice recipients require a current guardian-child relationship'),
                ('${tenantId}', '${studentUserId}', 'GUARDIAN', '${studentGuardianId}', 'PARENTS',
                 'Students cannot receive ACE notice audiences'),
                ('${tenantId}', '${outsiderUserId}', 'STAFF', NULL, 'STAFF',
                 'Staff notice recipients require a current site membership'),
                ('${tenantId}', '${studentUserId}', 'STAFF', NULL, 'STAFF',
                 'Staff notice recipients require a current site membership'),
                ('${tenantId}', '${guardianUserId}', 'GUARDIAN', '${guardianId}', 'STAFF',
                 'ACE notice recipient kind is outside the selected audience'),
                ('${tenantId}', '${staffUserId}', 'STAFF', NULL, 'PARENTS',
                 'ACE notice recipient kind is outside the selected audience'),
                ('${tenantId}', '${staffUserId}', 'STAFF', '${guardianId}', 'STAFF',
                 'Staff notice recipients require a current site membership')
              ) AS cases(tenant_id, user_id, kind, guardian_id, audience, expected_message)
              LOOP
                BEGIN
                  PERFORM app.assert_ace_notice_audience_member_eligibility(
                    attempt.tenant_id, attempt.user_id,
                    attempt.kind::app."AceNoticeAudienceMemberKind",
                    attempt.guardian_id,
                    attempt.audience::app."AceNoticeAudience");
                  RAISE EXCEPTION 'Invalid notice recipient accepted';
                EXCEPTION WHEN check_violation THEN
                  IF SQLERRM <> attempt.expected_message THEN RAISE; END IF;
                END;
              END LOOP;
            END $probe$
          `);
          throw rollback;
        },
        { timeout: 30_000 },
      ),
    ).rejects.toBe(rollback);
  });
});
