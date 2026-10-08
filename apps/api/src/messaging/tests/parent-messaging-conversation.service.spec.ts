import { NotFoundException } from "@nestjs/common";
import { prisma, withTenantRlsContext } from "@pathway/db";
import { recordAuditEventInTransaction } from "../../audit/audit.service";
import { createParentConversationSchema } from "../dto/messaging-command.dto";
import { parentRecipientQuerySchema } from "../dto/messaging-query.dto";
import { ParentMessagingConversationService } from "../parent-messaging-conversation.service";

jest.mock("@pathway/auth", () => ({
  SYSTEM_ROLE_TEMPLATES: {
    organisationHead: { name: "Organisation Head" },
    siteLead: { name: "Site Lead" },
    parent: { permissions: ["messaging.conversations.create"] },
  },
}));
jest.mock("@pathway/db", () => ({
  Prisma: { sql: jest.fn().mockReturnValue("advisory-lock") },
  prisma: { tenant: { findUnique: jest.fn() } },
  withTenantRlsContext: jest.fn(),
}));
jest.mock("../../audit/audit.service", () => ({
  recordAuditEventInTransaction: jest.fn(),
}));

const siteId = "site-a";
const parentId = "86f5240d-d5c9-4dd7-95e2-849d3841b67d";
const responderId = "29c70e51-7253-4405-98f8-e37480aa5623";
const input = { recipientUserId: responderId };

function setup() {
  const tx = {
    user: { findFirst: jest.fn().mockResolvedValue({ id: parentId }) },
    guardianIdentity: {
      findFirst: jest.fn().mockResolvedValue({ id: "guardian-a" }),
    },
    studentIdentity: { findUnique: jest.fn().mockResolvedValue(null) },
    permissionDefinition: {
      findUnique: jest.fn().mockResolvedValue({ isActive: true }),
    },
    siteMembership: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({ userId: responderId }),
    },
    messageConversation: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: "conversation-a" }),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  jest.mocked(prisma.tenant.findUnique).mockResolvedValue({
    orgId: "org-a",
    org: { parentPortalEnabled: true },
  } as never);
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_siteId, _orgId, operation) =>
      operation(tx as never),
    );
  return { tx, service: new ParentMessagingConversationService() };
}

describe("parent school-team conversation", () => {
  beforeEach(() => jest.clearAllMocks());

  it("accepts only a selected responder ID and bounded recipient queries", () => {
    expect(createParentConversationSchema.parse(input)).toEqual(input);
    expect(
      createParentConversationSchema.safeParse({ recipientUserId: "invalid" })
        .success,
    ).toBe(false);
    expect(
      createParentConversationSchema.safeParse({
        ...input,
        kind: "STAFF_DIRECT",
      }).success,
    ).toBe(false);
    expect(
      parentRecipientQuerySchema.parse({ search: "  Sam  ", limit: "2" }),
    ).toEqual({
      search: "Sam",
      limit: 2,
    });
    for (const query of [{ search: "S" }, { limit: "21" }, { extra: true }]) {
      expect(parentRecipientQuerySchema.safeParse(query).success).toBe(false);
    }
  });

  it("lists only current same-site staff responders with minimal profile data", async () => {
    const { tx, service } = setup();
    tx.siteMembership.findMany.mockResolvedValue([
      { userId: responderId, user: { displayName: " Ms Taylor ", name: null } },
      { userId: "another", user: { displayName: null, name: "Another" } },
    ]);
    await expect(
      service.recipients(siteId, parentId, { search: "Ta", limit: 1 }),
    ).resolves.toEqual({
      items: [{ id: responderId, displayName: "Ms Taylor" }],
      hasMore: true,
    });
    expect(withTenantRlsContext).toHaveBeenCalledWith(
      siteId,
      "org-a",
      expect.any(Function),
    );
    expect(tx.siteMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: siteId,
          userId: { not: parentId },
          role: { in: ["SITE_ADMIN", "STAFF"] },
          user: expect.objectContaining({
            isActive: true,
            studentIdentities: { none: { tenantId: siteId } },
          }),
        }),
        take: 2,
      }),
    );
  });

  it("opens one audited thread with the current guardian and approved responder", async () => {
    const { tx, service } = setup();
    await expect(service.open(siteId, parentId, input)).resolves.toEqual({
      id: "conversation-a",
      kind: "PARENT_STAFF",
      created: true,
    });
    expect(tx.$executeRaw).toHaveBeenCalledWith("advisory-lock");
    expect(tx.siteMembership.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ tenantId: siteId, userId: responderId }),
      select: { userId: true },
    });
    expect(tx.messageConversation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: "PARENT_STAFF",
        participants: {
          create: [
            expect.objectContaining({ kind: "GUARDIAN" }),
            expect.objectContaining({ kind: "STAFF" }),
          ],
        },
      }),
      select: { id: true },
    });
    expect(recordAuditEventInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actorUserId: parentId,
        metadata: { kind: "PARENT_STAFF", recipientUserId: responderId },
      }),
    );
  });

  it("reuses the existing thread without changing responders", async () => {
    const { tx, service } = setup();
    tx.messageConversation.findFirst.mockResolvedValue({
      id: "conversation-a",
      participants: [{ id: "guardian-participant" }],
    });
    await expect(service.open(siteId, parentId, input)).resolves.toEqual({
      id: "conversation-a",
      kind: "PARENT_STAFF",
      created: false,
    });
    expect(tx.siteMembership.findFirst).not.toHaveBeenCalled();
    expect(tx.messageConversation.create).not.toHaveBeenCalled();
    expect(recordAuditEventInTransaction).not.toHaveBeenCalled();
  });

  it("rejects missing responders, removed guardians, and ended relationships", async () => {
    const { tx, service } = setup();
    tx.siteMembership.findFirst.mockResolvedValueOnce(null);
    await expect(service.open(siteId, parentId, input)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    tx.messageConversation.findFirst.mockResolvedValueOnce({
      id: "conversation-a",
      participants: [],
    });
    await expect(service.open(siteId, parentId, input)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    tx.guardianIdentity.findFirst.mockResolvedValueOnce(null);
    await expect(service.open(siteId, parentId, input)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.messageConversation.create).not.toHaveBeenCalled();
  });

  it("rejects a closed parent portal or student identity before responder lookup", async () => {
    const { tx, service } = setup();
    jest.mocked(prisma.tenant.findUnique).mockResolvedValueOnce({
      orgId: "org-a",
      org: { parentPortalEnabled: false },
    } as never);
    await expect(service.open(siteId, parentId, input)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    tx.studentIdentity.findUnique.mockResolvedValueOnce({ id: "student-a" });
    await expect(service.open(siteId, parentId, input)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.siteMembership.findFirst).not.toHaveBeenCalled();
    expect(tx.messageConversation.create).not.toHaveBeenCalled();
  });
});
