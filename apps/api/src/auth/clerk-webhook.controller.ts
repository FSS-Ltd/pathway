import { Controller, Logger, Post, Req, UnauthorizedException } from "@nestjs/common";
import type { Request as ExpressRequest } from "express";
import { verifyWebhook, type WebhookEvent } from "@clerk/backend/webhooks";
import { prisma } from "@pathway/db";

type RequestWithRawBody = ExpressRequest & { rawBody?: Buffer };

/**
 * POST /api/webhooks/clerk
 *
 * Keeps UserIdentity in sync with Clerk. Does NOT create identities on
 * user.created - AuthUserGuard/AuthIdentityService already JIT-provision on
 * first authenticated request, and a second creation path here would race
 * it. Never deletes the internal User on user.deleted, only the identity
 * link (see docs/auth-migration).
 */
@Controller("api/webhooks/clerk")
export class ClerkWebhookController {
  private readonly logger = new Logger(ClerkWebhookController.name);

  @Post()
  async handle(@Req() req: RequestWithRawBody): Promise<{ received: true }> {
    const signingSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    if (!signingSecret) {
      throw new UnauthorizedException(
        "Clerk webhook signing secret not configured",
      );
    }
    if (!req.rawBody) {
      throw new UnauthorizedException("Missing raw request body");
    }

    const event = await this.verify(req, req.rawBody, signingSecret);

    const eventId = this.headerValue(req, "svix-id");
    if (!eventId) {
      throw new UnauthorizedException("Missing svix-id header");
    }

    const alreadyProcessed = await prisma.identityWebhookEvent.findUnique({
      where: { id: eventId },
    });
    if (alreadyProcessed) {
      this.logger.log(`Skipping already-processed Clerk webhook ${eventId}`);
      return { received: true };
    }

    await this.process(event);

    await prisma.identityWebhookEvent.create({
      data: {
        id: eventId,
        provider: "clerk",
        eventType: event.type,
        status: "processed",
      },
    });

    return { received: true };
  }

  private async verify(
    req: RequestWithRawBody,
    rawBody: Buffer,
    signingSecret: string,
  ): Promise<WebhookEvent> {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") headers.set(key, value);
      else if (Array.isArray(value)) headers.set(key, value.join(", "));
    }

    const request = new Request("https://internal.pathway.app/api/webhooks/clerk", {
      method: "POST",
      headers,
      body: new Uint8Array(rawBody),
    });

    try {
      return await verifyWebhook(request, { signingSecret });
    } catch (error) {
      this.logger.warn(
        `Rejected Clerk webhook: invalid signature (${error instanceof Error ? error.message : String(error)})`,
      );
      throw new UnauthorizedException("Invalid webhook signature");
    }
  }

  private async process(event: WebhookEvent): Promise<void> {
    switch (event.type) {
      case "user.updated":
        await this.syncUser(event.data.id, event.data);
        break;
      case "user.deleted":
        await this.unlinkUser(event.data.id as string | undefined);
        break;
      default:
        // Not our concern (organisation/session/etc events) - Clerk sends
        // whatever's enabled on the endpoint; only user.* is subscribed to.
        this.logger.log(`Ignoring unhandled Clerk webhook event: ${event.type}`);
    }
  }

  private async syncUser(
    clerkUserId: string,
    data: { email_addresses?: Array<{ email_address: string }>; first_name?: string | null; last_name?: string | null },
  ): Promise<void> {
    const identity = await prisma.userIdentity.findUnique({
      where: {
        provider_providerSubject: { provider: "clerk", providerSubject: clerkUserId },
      },
    });
    // No local identity yet (e.g. update fired before first sign-in JIT
    // provisioning) - nothing to sync onto.
    if (!identity) return;

    const email = data.email_addresses?.[0]?.email_address?.toLowerCase().trim();
    const name = [data.first_name, data.last_name].filter(Boolean).join(" ").trim();

    await prisma.userIdentity.update({
      where: { id: identity.id },
      data: {
        email: email ?? identity.email,
        displayName: name || identity.displayName,
      },
    });
  }

  private async unlinkUser(clerkUserId: string | undefined): Promise<void> {
    if (!clerkUserId) return;
    // Remove the identity link only - the internal User row, memberships and
    // roles are never touched by a webhook. Re-linking (e.g. account
    // recreated in Clerk) goes through the normal JIT/reconciliation path.
    await prisma.userIdentity.deleteMany({
      where: { provider: "clerk", providerSubject: clerkUserId },
    });
  }

  private headerValue(req: ExpressRequest, name: string): string | undefined {
    const value = req.headers[name];
    return typeof value === "string" ? value : undefined;
  }
}
