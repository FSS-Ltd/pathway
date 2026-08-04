import { UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";

jest.mock("@pathway/db", () => ({
  prisma: {
    identityWebhookEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    userIdentity: {
      findUnique: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

const verifyWebhookMock = jest.fn();
jest.mock("@clerk/backend/webhooks", () => ({
  verifyWebhook: (...args: unknown[]) => verifyWebhookMock(...args),
}));

import { prisma } from "@pathway/db";
import { ClerkWebhookController } from "../clerk-webhook.controller";

const findEvent = prisma.identityWebhookEvent.findUnique as unknown as jest.Mock;
const createEvent = prisma.identityWebhookEvent.create as unknown as jest.Mock;
const findIdentity = prisma.userIdentity.findUnique as unknown as jest.Mock;
const updateIdentity = prisma.userIdentity.update as unknown as jest.Mock;
const deleteIdentities = prisma.userIdentity.deleteMany as unknown as jest.Mock;

function buildRequest(overrides: Partial<Request> = {}): Request & { rawBody?: Buffer } {
  return {
    headers: { "svix-id": "evt_123" },
    rawBody: Buffer.from("{}"),
    ...overrides,
  } as Request & { rawBody?: Buffer };
}

describe("ClerkWebhookController", () => {
  const originalSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  let controller: ClerkWebhookController;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CLERK_WEBHOOK_SIGNING_SECRET = "whsec_test";
    controller = new ClerkWebhookController();
  });

  afterAll(() => {
    process.env.CLERK_WEBHOOK_SIGNING_SECRET = originalSecret;
  });

  it("rejects when no signing secret is configured", async () => {
    delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;

    await expect(controller.handle(buildRequest())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(verifyWebhookMock).not.toHaveBeenCalled();
  });

  it("rejects when the request has no raw body", async () => {
    await expect(
      controller.handle(buildRequest({ rawBody: undefined } as never)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects an invalid signature without touching the database", async () => {
    verifyWebhookMock.mockRejectedValueOnce(new Error("bad signature"));

    await expect(controller.handle(buildRequest())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(findEvent).not.toHaveBeenCalled();
  });

  it("rejects when the svix-id header is missing", async () => {
    verifyWebhookMock.mockResolvedValueOnce({ type: "user.updated", data: { id: "clerk_1" } });

    await expect(
      controller.handle(buildRequest({ headers: {} } as never)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("skips already-processed events without reprocessing", async () => {
    verifyWebhookMock.mockResolvedValueOnce({ type: "user.updated", data: { id: "clerk_1" } });
    findEvent.mockResolvedValueOnce({ id: "evt_123" });

    const result = await controller.handle(buildRequest());

    expect(result).toEqual({ received: true });
    expect(findIdentity).not.toHaveBeenCalled();
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("syncs email and name onto an existing identity on user.updated", async () => {
    verifyWebhookMock.mockResolvedValueOnce({
      type: "user.updated",
      data: {
        id: "clerk_1",
        email_addresses: [{ email_address: "New@Example.com" }],
        first_name: "New",
        last_name: "Name",
      },
    });
    findEvent.mockResolvedValueOnce(null);
    findIdentity.mockResolvedValueOnce({
      id: "identity-1",
      email: "old@example.com",
      displayName: "Old Name",
    });

    await controller.handle(buildRequest());

    expect(updateIdentity).toHaveBeenCalledWith({
      where: { id: "identity-1" },
      data: { email: "new@example.com", displayName: "New Name" },
    });
    expect(createEvent).toHaveBeenCalledWith({
      data: { id: "evt_123", provider: "clerk", eventType: "user.updated", status: "processed" },
    });
  });

  it("does nothing on user.updated when no local identity is linked yet", async () => {
    verifyWebhookMock.mockResolvedValueOnce({
      type: "user.updated",
      data: { id: "clerk_1", email_addresses: [] },
    });
    findEvent.mockResolvedValueOnce(null);
    findIdentity.mockResolvedValueOnce(null);

    await controller.handle(buildRequest());

    expect(updateIdentity).not.toHaveBeenCalled();
  });

  it("removes only the identity link on user.deleted, never the User", async () => {
    verifyWebhookMock.mockResolvedValueOnce({
      type: "user.deleted",
      data: { id: "clerk_1", deleted: true },
    });
    findEvent.mockResolvedValueOnce(null);

    await controller.handle(buildRequest());

    expect(deleteIdentities).toHaveBeenCalledWith({
      where: { provider: "clerk", providerSubject: "clerk_1" },
    });
  });

  it("ignores event types it doesn't subscribe to, but still records the event", async () => {
    verifyWebhookMock.mockResolvedValueOnce({
      type: "session.created",
      data: { id: "sess_1" },
    });
    findEvent.mockResolvedValueOnce(null);

    await controller.handle(buildRequest());

    expect(findIdentity).not.toHaveBeenCalled();
    expect(deleteIdentities).not.toHaveBeenCalled();
    expect(createEvent).toHaveBeenCalledWith({
      data: { id: "evt_123", provider: "clerk", eventType: "session.created", status: "processed" },
    });
  });
});
