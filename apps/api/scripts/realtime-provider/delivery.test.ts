import { registerLayoutCase } from "./layout.cases";
import { registerFamilyCases } from "./family.cases";
import {
  registerLifecycleCases,
  registerOutageCase,
  waitUntil,
} from "./lifecycle.cases";
import { providerUrl, signFixtureClaims } from "./environment";
import "reflect-metadata";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { prisma, withTenantRlsContext } from "@pathway/db";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { RealtimeTokenService } from "../../src/realtime/realtime-token.service";
import { MessagingService } from "../../src/messaging/messaging.service";
import { MessagingCommandService } from "../../src/messaging/messaging-command.service";
import {
  asWriter,
  close,
  conversationId,
  initialize,
  recipient,
  recipientAssignmentId,
  sender,
  siteId,
  orgId,
} from "./fixture";

const tokens = new RealtimeTokenService();
const commands = new MessagingCommandService();
const createProviderClient = (key: string) =>
  createClient(providerUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const clients: ReturnType<typeof createProviderClient>[] = [];
const received: Record<string, unknown>[][] = [[], []];
const readEvents: Record<string, unknown>[] = [];
before(initialize);
after(async () => {
  await Promise.all(
    clients.map((client) =>
      client.removeAllChannels().then(() => client.realtime.disconnect()),
    ),
  );
  await close();
});

async function join(actor: typeof sender, events: Record<string, unknown>[]) {
  const grant = await asWriter(
    () => tokens.issueStaff(actor, conversationId, "staff"),
    actor,
  );
  const client = createProviderClient(grant.publishableKey);
  clients.push(client);
  await client.realtime.setAuth(grant.token);
  let resolveReady: () => void = () => {};
  let rejectReady: (error: Error) => void = () => {};
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const channel: RealtimeChannel = client
    .channel(grant.topic, { config: { private: true } })
    .on(
      "broadcast",
      { event: "message.created" },
      ({ payload }: { payload: Record<string, unknown> }) =>
        events.push(payload),
    )
    .on(
      "broadcast",
      { event: "conversation.read" },
      ({ payload }: { payload: Record<string, unknown> }) => {
        if (actor === sender) readEvents.push(payload);
      },
    )
    .subscribe((status, error) => {
      if (status === "SUBSCRIBED") resolveReady();
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
        rejectReady(
          new Error(`Private join failed: ${status}: ${error?.message}`),
        );
    });
  await ready;
  return { grant, channel };
}
async function settleEvents(): Promise<void> {
  await delay(750);
}

test("grants bind a private inbox to its current user and site", async () => {
  const grant = await asWriter(() =>
    tokens.issueStaff(sender, conversationId, "staff"),
  );
  assert.equal(
    grant.topic,
    `ace:conversation:site:${Buffer.from(siteId).toString("hex")}:user:${Buffer.from(sender.userId).toString("hex")}`,
  );
  assert.deepEqual(grant.refetchOn, ["reconnect", "event_loss"]);
});

test("committed changes reach both current recipients using only opaque metadata", async () => {
  await join(sender, received[0]);
  await join(recipient, received[1]);
  const message = await asWriter(() =>
    commands.sendStaffMessage(sender, conversationId, {
      body: "Private body must stay behind the API",
      clientRequestId: randomUUID(),
    }),
  );
  await waitUntil(() => received.every((events) => events.length >= 1));
  for (const events of received) {
    assert.equal(events.length, 1);
    assert.equal(events[0].messageId, message.id);
    assert.equal(events[0].conversationId, conversationId);
    assert.equal(typeof events[0].notificationId, "string");
    assert.deepEqual(Object.keys(events[0]).sort(), [
      "conversationId",
      "id",
      "messageId",
      "notificationId",
      "type",
    ]);
  }
});

test("rolled-back changes publish nothing and retries do not duplicate delivery", async () => {
  const beforeCount = received[0].length;
  const clientRequestId = randomUUID();
  await assert.rejects(
    asWriter(async () => {
      await commands.sendStaffMessage(sender, conversationId, {
        body: "Rollback",
        clientRequestId,
      });
      throw new Error("rollback fixture");
    }),
    /rollback fixture/,
  );
  await settleEvents();
  assert.equal(received[0].length, beforeCount);
  const first = await asWriter(() =>
    commands.sendStaffMessage(sender, conversationId, {
      body: "Retry",
      clientRequestId,
    }),
  );
  const retry = await asWriter(() =>
    commands.sendStaffMessage(sender, conversationId, {
      body: "Retry",
      clientRequestId,
    }),
  );
  assert.equal(first.id, retry.id);
  await waitUntil(() => received[0].length >= beforeCount + 1);
  assert.equal(received[0].length, beforeCount + 1);
});

test("advancing a read cursor broadcasts once and repeated acknowledgements stay silent", async () => {
  const message = await prisma.message.findFirstOrThrow({
    where: { conversationId },
    orderBy: { sequence: "desc" },
  });
  const history = new MessagingService();
  await asWriter(() =>
    history.advanceStaffReadCursor(sender, conversationId, {
      sequence: message.sequence,
    }),
  );
  await waitUntil(() => readEvents.length === 1);
  assert.equal(readEvents[0].type, "conversation.read");
  assert.equal(readEvents[0].readerScope, "participant");
  assert.deepEqual(Object.keys(readEvents[0]).sort(), [
    "conversationId",
    "id",
    "notificationId",
    "readerScope",
    "type",
  ]);
  await asWriter(() =>
    history.advanceStaffReadCursor(sender, conversationId, {
      sequence: message.sequence,
    }),
  );
  await settleEvents();
  assert.equal(readEvents.length, 1);
});

test("revocation excludes an already-connected recipient from new publications", async () => {
  const beforeCount = received[1].length;
  assert.ok(
    beforeCount >= 2,
    "Revocation test requires a previously active subscriber",
  );
  await prisma.userRoleAssignment.update({
    where: { id: recipientAssignmentId },
    data: { revokedAt: new Date(), revokedById: sender.userId },
  });
  await asWriter(() =>
    commands.sendStaffMessage(sender, conversationId, {
      body: "After revocation",
      clientRequestId: randomUUID(),
    }),
  );
  await settleEvents();
  assert.equal(received[1].length, beforeCount);
});

test("a durable queue error rolls back the source mutation", async () => {
  await prisma.$executeRawUnsafe(
    `CREATE FUNCTION realtime.provider_test_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'queue fixture failure'; END $$`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE TRIGGER provider_test_reject BEFORE INSERT ON realtime.messages FOR EACH ROW EXECUTE FUNCTION realtime.provider_test_reject()`,
  );
  const beforeCount = await prisma.message.count({ where: { conversationId } });
  try {
    await assert.rejects(
      asWriter(() =>
        commands.sendStaffMessage(sender, conversationId, {
          body: "Must roll back",
          clientRequestId: randomUUID(),
        }),
      ),
      /queue fixture failure/,
    );
    assert.equal(
      await prisma.message.count({ where: { conversationId } }),
      beforeCount,
    );
  } finally {
    await prisma.$executeRawUnsafe(
      "DROP TRIGGER provider_test_reject ON realtime.messages",
    );
    await prisma.$executeRawUnsafe(
      "DROP FUNCTION realtime.provider_test_reject()",
    );
  }
});

test("signed grants enforce user, organisation and signature boundaries", async () => {
  const grant = await asWriter(() =>
    tokens.issueStaff(sender, conversationId, "staff"),
  );
  const foreignOrgToken = await signFixtureClaims({
    role: "authenticated",
    sub: sender.userId,
    ace_site_id: siteId,
    ace_realtime_conversation_id: conversationId,
    ace_org_id: randomUUID(),
    ace_realtime_topics: [grant.topic],
  });
  for (const invalid of [
    {
      ...grant,
      topic: `ace:conversation:site:${Buffer.from(siteId).toString("hex")}:user:${Buffer.from(recipient.userId).toString("hex")}`,
    },
    { ...grant, token: `${grant.token.slice(0, -8)}AAAAAAAA` },
    { ...grant, token: foreignOrgToken },
  ]) {
    const client = createProviderClient(invalid.publishableKey);
    clients.push(client);
    await client.realtime.setAuth(invalid.token);
    const outcome = await new Promise<string>((resolve, reject) => {
      client
        .channel(invalid.topic, { config: { private: true } })
        .subscribe((status, error) => {
          if (status === "CHANNEL_ERROR") resolve(error?.message ?? "");
          else if (status === "SUBSCRIBED" || status === "TIMED_OUT")
            reject(
              new Error(`Unexpected unauthorized join outcome: ${status}`),
            );
        });
    });
    assert.match(outcome, /Unauthorized|JwtSignatureError/);
    await client.removeAllChannels();
    await client.realtime.disconnect();
  }
});

test("forced-RLS source writes enqueue only at commit and duplicate consumption is idempotent", async () => {
  const beforeCount = received[0].length;
  const participant = await prisma.messageParticipant.findFirstOrThrow({
    where: { conversationId, userId: sender.userId },
  });
  const message = await withTenantRlsContext(siteId, orgId, async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL ROLE realtime_provider_writer");
    const [role] = await tx.$queryRaw<
      Array<{ rolbypassrls: boolean; rolsuper: boolean }>
    >`SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user`;
    assert.deepEqual(role, { rolbypassrls: false, rolsuper: false });
    const created = await tx.message.create({
      data: {
        tenantId: siteId,
        conversationId,
        senderParticipantId: participant.id,
        bodyEncrypted: "RLS source",
        clientRequestId: randomUUID(),
      },
    });
    await settleEvents();
    assert.equal(
      received[0].length,
      beforeCount,
      "Uncommitted source must not escape via Broadcast",
    );
    return created;
  });
  await waitUntil(() => received[0].length === beforeCount + 1);
  const intent = await prisma.outboxEvent.findUniqueOrThrow({
    where: {
      orgId_idempotencyKey: {
        orgId,
        idempotencyKey: `realtime:message.created:${message.id}`,
      },
    },
  });
  assert.equal(intent.status, "DISPATCHED");
  const count = await prisma.$queryRaw<
    Array<{ count: bigint }>
  >`SELECT count(*) FROM realtime.messages WHERE payload ->> 'notificationId' = ${intent.id}`;
  await asWriter(
    () =>
      prisma.$executeRaw`SELECT app.enqueue_message_realtime_notification('app', ${intent.id})`,
  );
  assert.deepEqual(
    await prisma.$queryRaw`SELECT count(*) FROM realtime.messages WHERE payload ->> 'notificationId' = ${intent.id}`,
    count,
  );
  await settleEvents();
  assert.equal(received[0].length, beforeCount + 1);
});

test("an existing subscription updates the inbox when a different conversation changes", async () => {
  const events: Record<string, unknown>[] = [];
  await join(sender, events);
  const other = await asWriter(() =>
    prisma.messageConversation.create({
      data: {
        kind: "STAFF_ROOM",
        tenant: { connect: { id: siteId } },
        createdBy: { connect: { id: sender.userId } },
        participants: {
          create: [sender, recipient].map((actor) => ({
            kind: "STAFF",
            tenant: { connect: { id: siteId } },
            user: { connect: { id: actor.userId } },
          })),
        },
      },
    }),
  );
  const message = await asWriter(() =>
    commands.sendStaffMessage(sender, other.id, {
      body: "Another conversation changed",
      clientRequestId: randomUUID(),
    }),
  );
  await waitUntil(() => events.some((event) => event.messageId === message.id));
  assert.equal(
    events.find((event) => event.messageId === message.id)?.conversationId,
    other.id,
  );
});

registerFamilyCases();

registerLifecycleCases();

registerOutageCase();

registerLayoutCase();
