import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import {
  messageConversationRealtimeTopic,
  type MessageRealtimeSubscription,
} from "@pathway/platform";
import { SignJWT } from "jose";
import { randomUUID } from "node:crypto";
import {
  assertMessagingActor,
  requireCurrentStaff,
  STAFF_CONVERSATION_KINDS,
  type MessagingActor,
} from "../messaging/messaging-access";
import {
  parentConversationScope,
  withParentMessagingAccess,
} from "../messaging/parent-messaging-access";
import {
  requireStaffSchoolTeamAccess,
  staffSchoolTeamConversationScope,
} from "../messaging/staff-school-team-access";

const TOKEN_LIFETIME_SECONDS = 2 * 60;

type StaffConversationScope = "staff" | "school-team";

@Injectable()
export class RealtimeTokenService {
  async issueStaff(
    actor: MessagingActor,
    conversationId: string,
    scope: StaffConversationScope,
  ): Promise<MessageRealtimeSubscription> {
    assertMessagingActor(actor);
    await withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const now = new Date();
      if (scope === "school-team") {
        await requireStaffSchoolTeamAccess(tx, actor, now);
      } else {
        await requireCurrentStaff(tx, actor);
      }
      const conversation = await tx.messageConversation.findFirst({
        where: {
          id: conversationId,
          ...(scope === "school-team"
            ? staffSchoolTeamConversationScope(actor, now)
            : {
                tenantId: actor.tenantId,
                kind: { in: [...STAFF_CONVERSATION_KINDS] },
                participants: {
                  some: {
                    tenantId: actor.tenantId,
                    userId: actor.userId,
                    kind: "STAFF" as const,
                    removedAt: null,
                  },
                },
              }),
        },
        select: { id: true },
      });
      if (!conversation) throw new NotFoundException("Messages not found");
    });
    return issueToken(actor, conversationId);
  }

  async issueParent(
    siteId: string,
    userId: string,
    conversationId: string,
  ): Promise<MessageRealtimeSubscription> {
    const orgId = await withParentMessagingAccess(
      siteId,
      userId,
      "messaging.messages.read",
      async (tx, guardianId, activeOrgId) => {
        const conversation = await tx.messageConversation.findFirst({
          where: {
            ...parentConversationScope(siteId, userId, guardianId),
            id: conversationId,
          },
          select: { id: true },
        });
        if (!conversation) throw new NotFoundException("Messages not found");
        return activeOrgId;
      },
    );
    return issueToken({ tenantId: siteId, orgId, userId }, conversationId);
  }
}

async function issueToken(
  actor: MessagingActor,
  conversationId: string,
): Promise<MessageRealtimeSubscription> {
  const config = realtimeConfiguration();
  const topic = messageConversationRealtimeTopic(conversationId);
  const issuedAt = Math.floor(Date.now() / 1_000);
  const expiresAt = issuedAt + TOKEN_LIFETIME_SECONDS;
  const token = await new SignJWT({
    role: "authenticated",
    ace_realtime_topics: [topic],
    ace_site_id: actor.tenantId,
    ace_org_id: actor.orgId,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(actor.userId)
    .setAudience("authenticated")
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .setJti(randomUUID())
    .sign(new TextEncoder().encode(config.jwtSecret));
  return {
    token,
    topic,
    url: config.url,
    publishableKey: config.publishableKey,
    private: true,
    expiresAt: new Date(expiresAt * 1_000).toISOString(),
    authoritativeSource: "rest",
    refetchOn: ["reconnect", "event_loss", "token_refresh"],
  };
}

function realtimeConfiguration(): {
  url: string;
  publishableKey: string;
  jwtSecret: string;
} {
  const rawUrl = process.env.SUPABASE_URL?.trim();
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  const jwtSecret = process.env.SUPABASE_JWT_SECRET?.trim();
  if (!rawUrl || !publishableKey || !jwtSecret || jwtSecret.length < 32) {
    throw new ServiceUnavailableException("Live messaging is unavailable");
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ServiceUnavailableException("Live messaging is unavailable");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    publishableKey.startsWith("sb_secret_") ||
    publishableKey === process.env.SUPABASE_SECRET_KEY
  ) {
    throw new ServiceUnavailableException("Live messaging is unavailable");
  }
  return { url: url.origin, publishableKey, jwtSecret };
}
