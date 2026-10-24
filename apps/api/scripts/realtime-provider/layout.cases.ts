import "./environment";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { prisma } from "@pathway/db";
import { asWriter, conversationId, orgId, sender, siteId } from "./fixture";

const hostedTables = [
  "Tenant",
  "Org",
  "User",
  "OrgVertical",
  "PermissionDefinition",
  "SiteMembership",
  "StudentIdentity",
  "UserRoleAssignment",
  "OrgRoleDefinition",
  "OrgRolePermission",
  "AccessTagGrant",
  "Child",
  "GuardianIdentity",
  "GuardianChildRelationship",
  "OutboxEvent",
] as const;

export function registerLayoutCase(): void {
  test("the observed hosted public tables and partial app bridges authorize and enqueue durably", async () => {
    const rollback = new Error("Rollback disposable schema layout");
    try {
      await asWriter(async () => {
        // Reproduce the hosted layout's partial app bridges without committing
        // schema changes or replacing any existing public relation.
        for (const table of hostedTables) {
          const [existing] = await prisma.$queryRaw<
            Array<{ present: boolean }>
          >`SELECT to_regclass(${`public."${table}"`}) IS NOT NULL AS present`;
          assert.equal(existing.present, false);
          await prisma.$executeRawUnsafe(
            `ALTER TABLE app."${table}" SET SCHEMA public`,
          );
          if (
            ["Tenant", "SiteMembership", "StudentIdentity", "Child"].includes(
              table,
            )
          ) {
            await prisma.$executeRawUnsafe(
              `CREATE VIEW app."${table}" AS SELECT * FROM public."${table}"`,
            );
          }
        }
        // Trigger schema arguments are captured at installation. Rebind them
        // as the 1.1 installer does when the outbox already lives in public.
        await prisma.$executeRawUnsafe(
          'DROP TRIGGER "Message_capture_realtime" ON app."Message"',
        );
        await prisma.$executeRawUnsafe(
          `CREATE TRIGGER "Message_capture_realtime" AFTER INSERT ON app."Message" FOR EACH ROW EXECUTE FUNCTION app.capture_message_realtime_notification('app', 'public')`,
        );
        const recipients = await prisma.$queryRaw<
          Array<{ recipient: string }>
        >`SELECT recipient FROM app.ace_realtime_recipients(${conversationId}, ${siteId}, ${orgId}) AS recipient`;
        assert.ok(recipients.some((row) => row.recipient === sender.userId));
        const participant = await prisma.messageParticipant.findFirstOrThrow({
          where: { conversationId, userId: sender.userId },
        });
        const message = await prisma.message.create({
          data: {
            tenantId: siteId,
            conversationId,
            senderParticipantId: participant.id,
            bodyEncrypted: "Mixed schema fixture",
            clientRequestId: randomUUID(),
          },
        });
        const [{ count }] = await prisma.$queryRaw<
          Array<{ count: bigint }>
        >`SELECT count(*) FROM realtime.messages WHERE payload ->> 'messageId' = ${message.id}`;
        assert.equal(count, 1n);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    assert.equal(
      await prisma.org.count({ where: { id: orgId } }),
      1,
      "The schema layout must roll back before other verification continues",
    );
  });
}
