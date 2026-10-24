import { providerUrl } from "./environment";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createMessageRealtimeConnection } from "@pathway/platform/messaging/realtime-connection";
import { RealtimeTokenService } from "../../src/realtime/realtime-token.service";
import { MessagingService } from "../../src/messaging/messaging.service";
import { asWriter, conversationId, sender } from "./fixture";

// The admin package is CommonJS to Node. Load its actual browser transport
// through Node's CJS bridge so the provider proof works on Node 22 and 24.
const browserTransport: typeof import("../../../admin/components/ace/messaging/message-realtime-transport") =
  createRequire(import.meta.url)(
    "../../../admin/components/ace/messaging/message-realtime-transport.ts",
  );
const { openMessageRealtimeTransport } = browserTransport;

export async function waitUntil(
  predicate: () => boolean,
  timeout = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= deadline)
      throw new Error("Provider condition did not settle before deadline");
    await delay(25);
  }
}

export function registerLifecycleCases(): void {
  test(
    "three real in-place token renewals cause no recurring history reads or channel recreation",
    { timeout: 30_000 },
    async () => {
      let grants = 0;
      let joins = 0;
      let renewals = 0;
      let reads = 0;
      const errors: unknown[] = [];
      const tokens = new RealtimeTokenService();
      const history = new MessagingService();
      const connection = createMessageRealtimeConnection({
        async issueSubscription() {
          grants += 1;
          const grant = await asWriter(() =>
            tokens.issueStaff(sender, conversationId, "staff"),
          );
          // Accelerate only the client expiry schedule; actual signed tokens retain
          // the production two-minute lifetime and real provider authentication.
          return {
            ...grant,
            url: providerUrl,
            expiresAt: new Date(Date.now() + 35_000).toISOString(),
          };
        },
        async openTransport(grant, observer) {
          joins += 1;
          const transport = await openMessageRealtimeTransport(grant, observer);
          return {
            ...transport,
            async setAuth(token) {
              await transport.setAuth(token);
              renewals += 1;
            },
          };
        },
        onStatus() {},
        async onInvalidate() {
          await asWriter(() =>
            history.listStaffMessages(sender, conversationId, {}),
          );
          reads += 1;
        },
        isAccessDenied: () => false,
        onAccessDenied: () => errors.push(new Error("Unexpected denial")),
        onRefreshError: (error) => errors.push(error),
      });
      try {
        await waitUntil(() => reads === 1);
        await waitUntil(() => renewals >= 3, 22_000);
        await delay(150);
        assert.equal(reads, 1);
        assert.equal(joins, 1);
        assert.equal(grants, 4);
        assert.deepEqual(errors, []);
      } finally {
        connection.stop();
      }
    },
  );
}

export function registerOutageCase(): void {
  test(
    "transport outages preserve durable changes without history polling and reconcile after reconnect",
    { timeout: 90_000 },
    async () => {
      const { controlGateway } = await import("./fixture");
      const { MessagingCommandService } =
        await import("../../src/messaging/messaging-command.service");
      const { randomUUID } = await import("node:crypto");
      const tokens = new RealtimeTokenService();
      const history = new MessagingService();
      let status = "connecting";
      let reads = 0;
      let latestMessageId: string | undefined;
      const errors: unknown[] = [];
      const connection = createMessageRealtimeConnection({
        async issueSubscription() {
          return {
            ...(await asWriter(() =>
              tokens.issueStaff(sender, conversationId, "staff"),
            )),
            url: providerUrl,
          };
        },
        openTransport: openMessageRealtimeTransport,
        onStatus: (value) => {
          status = value;
        },
        async onInvalidate() {
          const result = await asWriter(() =>
            history.listStaffMessages(sender, conversationId, {}),
          );
          latestMessageId = result.items[0]?.id;
          reads += 1;
        },
        isAccessDenied: () => false,
        onAccessDenied: () => errors.push(new Error("Unexpected denial")),
        onRefreshError: (error) => errors.push(error),
      });
      let stopped = false;
      try {
        await waitUntil(() => reads === 1);
        await controlGateway("stop");
        stopped = true;
        await waitUntil(() => status === "disconnected");
        const beforeCount = reads;
        const message = await asWriter(() =>
          new MessagingCommandService().sendStaffMessage(
            sender,
            conversationId,
            {
              body: "Committed during provider outage",
              clientRequestId: randomUUID(),
            },
          ),
        );
        await delay(6_000);
        assert.equal(
          reads,
          beforeCount,
          "An outage must not trigger application-data polling",
        );
        await controlGateway("start");
        stopped = false;
        await waitUntil(
          () => status === "live" && latestMessageId === message.id,
          45_000,
        );
        assert.ok(
          reads <= beforeCount + 2,
          "Reconnect and any concurrent event coalesce into bounded reconciliation",
        );
        assert.deepEqual(errors, []);
      } finally {
        connection.stop();
        if (stopped) await controlGateway("start");
      }
    },
  );
}
