import { PrismaClient } from "@prisma/client";

const describeIfDb =
  process.env.PATHWAY_RUN_DB_INTEGRATION_TESTS === "1"
    ? describe
    : describe.skip;

describeIfDb("public Prisma bridge for ACE messages and notices", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      throw new Error(
        "Bridge integration tests require a disposable local database",
      );
    }
    url.searchParams.set("schema", "public");
    prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("reads all message and notice models through the public schema", async () => {
    const results = await Promise.all([
      prisma.messageConversation.findMany({ take: 1 }),
      prisma.messageParticipant.findMany({ take: 1 }),
      prisma.message.findMany({ take: 1 }),
      prisma.messageParticipantReadCursor.findMany({ take: 1 }),
      prisma.messageDelivery.findMany({ take: 1 }),
      prisma.messageAttachment.findMany({ take: 1 }),
      prisma.aceNotice.findMany({ take: 1 }),
      prisma.aceNoticeAudienceMember.findMany({ take: 1 }),
      prisma.aceNoticeReceipt.findMany({ take: 1 }),
      prisma.aceNoticeAttachment.findMany({ take: 1 }),
    ]);

    expect(results).toHaveLength(10);
    for (const rows of results) {
      expect(Array.isArray(rows)).toBe(true);
    }
  });

  it("resolves enum filters used by staff and parent journeys", async () => {
    await Promise.all([
      prisma.messageConversation.findMany({
        where: { kind: { in: ["STAFF_DIRECT", "STAFF_ROOM"] } },
        take: 1,
      }),
      prisma.messageParticipant.findMany({
        where: { kind: "GUARDIAN" },
        take: 1,
      }),
      prisma.messageDelivery.findMany({
        where: { status: "PENDING" },
        take: 1,
      }),
      prisma.aceNotice.findMany({
        where: { audience: "PARENTS_AND_STAFF" },
        take: 1,
      }),
      prisma.aceNoticeAudienceMember.findMany({
        where: { recipientKind: "STAFF" },
        take: 1,
      }),
    ]);
  });

  it("keeps the public views invoker-owned over RLS-protected tables", async () => {
    const rows = await prisma.$queryRaw<
      Array<{ viewName: string; invoker: boolean; rlsForced: boolean }>
    >`
      SELECT view.relname AS "viewName",
        COALESCE(view.reloptions @> ARRAY['security_invoker=true'], false) AS invoker,
        base.relforcerowsecurity AS "rlsForced"
      FROM pg_class view
      JOIN pg_namespace view_schema ON view_schema.oid = view.relnamespace
      JOIN pg_class base ON base.relname = view.relname
      JOIN pg_namespace base_schema ON base_schema.oid = base.relnamespace
      WHERE view_schema.nspname = 'public'
        AND base_schema.nspname = 'app'
        AND view.relname IN (
          'MessageConversation', 'MessageParticipant', 'Message',
          'MessageParticipantReadCursor', 'MessageDelivery', 'MessageAttachment',
          'AceNotice', 'AceNoticeAudienceMember', 'AceNoticeReceipt',
          'AceNoticeAttachment'
        )
    `;

    expect(rows).toHaveLength(10);
    expect(rows.every((row) => row.invoker && row.rlsForced)).toBe(true);
  });
});
