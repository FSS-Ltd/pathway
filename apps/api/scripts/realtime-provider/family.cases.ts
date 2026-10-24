import { providerUrl } from "./environment";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { prisma, withTenantRlsContext } from "@pathway/db";
import { createClient } from "@supabase/supabase-js";
import { seedFamily } from "./family.fixture";
import { RealtimeTokenService } from "../../src/realtime/realtime-token.service";
import { ParentMessagingCommandService } from "../../src/messaging/parent-messaging-command.service";
import { StaffSchoolTeamHistoryService } from "../../src/messaging/staff-school-team-history.service";
import { asWriter, orgId, siteId, sender, conversationId } from "./fixture";
import { waitUntil } from "./lifecycle.cases";

const tokens = new RealtimeTokenService();
const parents = new ParentMessagingCommandService();

async function subscribe(
  fixture: Awaited<ReturnType<typeof seedFamily>>,
  anchor: "family" | "staff",
) {
  const grant = await asWriter(
    () =>
      tokens.issueStaff(
        fixture.responder,
        anchor === "family" ? fixture.familyId : conversationId,
        anchor === "family" ? "school-team" : "staff",
      ),
    fixture.responder,
  );
  const events: Record<string, unknown>[] = [];
  const client = createClient(providerUrl, grant.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await client.realtime.setAuth(grant.token);
  try {
    await new Promise<void>((resolve, reject) => {
      client
        .channel(grant.topic, { config: { private: true } })
        .on(
          "broadcast",
          { event: "message.created" },
          ({ payload }: { payload: Record<string, unknown> }) =>
            events.push(payload),
        )
        .subscribe((status, error) => {
          if (status === "SUBSCRIBED") resolve();
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
            reject(
              new Error(`Family join failed: ${status}: ${error?.message}`),
            );
        });
    });
    return { client, events };
  } catch (error) {
    await client.removeAllChannels();
    await client.realtime.disconnect();
    throw error;
  }
}

export function registerFamilyCases(): void {
  test("a tag-only responder joins privately, receives committed parent messages and stops receiving after tag revocation", async () => {
    const fixture = await seedFamily();
    const { client, events } = await subscribe(fixture, "family");
    try {
      const send = () =>
        parents.send(siteId, fixture.guardianUserId, fixture.familyId, {
          body: "Family delivery",
          clientRequestId: randomUUID(),
        });
      const message = await asWriter(send);
      await waitUntil(() =>
        events.some((event) => event.messageId === message.id),
      );
      await prisma.accessTagGrant.update({
        where: { id: fixture.tagId },
        data: { revokedAt: new Date(), revokedById: sender.userId },
      });
      await assert.rejects(
        asWriter(
          () =>
            tokens.issueStaff(
              fixture.responder,
              fixture.familyId,
              "school-team",
            ),
          fixture.responder,
        ),
        /Conversations not found/,
      );
      await asWriter(() =>
        prisma.message.create({
          data: {
            tenantId: siteId,
            conversationId: fixture.familyId,
            senderParticipantId: fixture.guardianParticipantId,
            bodyEncrypted: "After tag revocation",
            clientRequestId: randomUUID(),
          },
        }),
      );
      await delay(750);
      assert.equal(events.length, 1);
    } finally {
      await client.removeAllChannels();
      await client.realtime.disconnect();
    }
  });

  for (const change of ["inactive", "student"] as const) {
    test(`an existing inbox excludes ${change} guardian threads from live delivery and pending-intent reconciliation`, async () => {
      const fixture = await seedFamily();
      const { client, events } = await subscribe(fixture, "staff");
      try {
        const first = await asWriter(() =>
          parents.send(siteId, fixture.guardianUserId, fixture.familyId, {
            body: "Before eligibility change",
            clientRequestId: randomUUID(),
          }),
        );
        await waitUntil(() =>
          events.some((event) => event.messageId === first.id),
        );
        // Represent a durable pre-activation intent without disabling any trigger:
        // only INSERT dispatches; a restored pending row must recheck recipients.
        const pending = await asWriter(async () => {
          await prisma.$executeRaw`SELECT set_config('app.realtime_capture_enabled', 'off', true)`;
          const message = await prisma.message.create({
            data: {
              tenantId: siteId,
              conversationId: fixture.familyId,
              senderParticipantId: fixture.guardianParticipantId,
              bodyEncrypted: "Pending reconciliation",
              clientRequestId: randomUUID(),
            },
          });
          const intent = await prisma.outboxEvent.create({
            data: {
              orgId,
              aggregateType: "REALTIME_CONVERSATION",
              aggregateId: fixture.familyId,
              eventType: "realtime.message.created",
              idempotencyKey: `realtime:message.created:${message.id}`,
              payload: {
                type: "message.created",
                conversationId: fixture.familyId,
                messageId: message.id,
              },
              status: "DEAD_LETTER",
            },
          });
          return prisma.outboxEvent.update({
            where: { id: intent.id },
            data: { status: "PENDING" },
          });
        });
        if (change === "inactive") {
          await prisma.user.update({
            where: { id: fixture.guardianUserId },
            data: { isActive: false },
          });
        } else {
          await withTenantRlsContext(siteId, orgId, (tx) =>
            tx.studentIdentity.create({
              data: { tenantId: siteId, userId: fixture.guardianUserId },
            }),
          );
        }
        await assert.rejects(
          asWriter(
            () =>
              new StaffSchoolTeamHistoryService().list(
                fixture.responder,
                fixture.familyId,
                {},
              ),
            fixture.responder,
          ),
          /Messages not found/,
        );
        const live = await asWriter(() =>
          prisma.message.create({
            data: {
              tenantId: siteId,
              conversationId: fixture.familyId,
              senderParticipantId: fixture.responderParticipantId,
              bodyEncrypted: "After eligibility change",
              clientRequestId: randomUUID(),
            },
          }),
        );
        // The bounded activation reconciliation invokes this same durable consumer.
        await asWriter(
          () =>
            prisma.$executeRaw`SELECT app.enqueue_message_realtime_notification('app', ${pending.id})`,
        );
        assert.equal(
          (
            await prisma.outboxEvent.findUniqueOrThrow({
              where: { id: pending.id },
            })
          ).status,
          "DISPATCHED",
        );
        const [{ count }] = await prisma.$queryRaw<
          Array<{ count: bigint }>
        >`SELECT count(*) FROM realtime.messages WHERE topic = ${`ace:conversation:site:${Buffer.from(siteId).toString("hex")}:user:${Buffer.from(fixture.responder.userId).toString("hex")}`} AND (payload ->> 'notificationId' = ${pending.id} OR payload ->> 'messageId' = ${live.id})`;
        assert.equal(
          count,
          0n,
          "Revoked family metadata must never enter the user's private queue",
        );
        await delay(750);
        assert.equal(events.length, 1);
      } finally {
        await client.removeAllChannels();
        await client.realtime.disconnect();
      }
    });
  }
}
