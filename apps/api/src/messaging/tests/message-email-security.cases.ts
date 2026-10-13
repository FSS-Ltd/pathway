import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { prisma, withTenantRlsContext } from "@pathway/db";
import request from "supertest";
import {
  MailerService,
  MessageEmailProviderRejectedError,
} from "../../mailer/mailer.service";
import { MessageEmailDispatchService } from "../message-email-dispatch.service";

interface MessageEmailTestContext {
  app: INestApplication | undefined;
  authorization: Record<string, string>;
  orgId: string;
  otherOrgId: string;
  siteId: string;
  otherSiteId: string;
  teacherId: string;
  staffConversationId: string;
  parentConversationId: string;
  staffPath: string;
}

export function registerGuardianMessageEmailCase(
  getContext: () => MessageEmailTestContext,
): void {
  it("lets a current guardian manage only their own site and conversation email settings", async () => {
    const { app, authorization, siteId, otherSiteId, parentConversationId } =
      getContext();
    if (!app) return;
    await prisma.tenant.update({
      where: { id: siteId },
      data: { timezone: "Europe/London" },
    });
    const path = `/ace/parent/sites/${siteId}/messages/notifications`;
    const server = app.getHttpServer();
    expect(
      (
        await request(server)
          .get(path)
          .set("Authorization", authorization.guardian)
          .expect(200)
      ).body.enabled,
    ).toBe(false);
    const saved = await request(server)
      .put(path)
      .set("Authorization", authorization.guardian)
      .send({ enabled: true, quietHoursStart: "22:00", quietHoursEnd: "07:00" })
      .expect(200);
    expect(saved.body).toMatchObject({
      enabled: true,
      timezone: "Europe/London",
    });
    const mutePath = `${path}/conversations/${parentConversationId}/mute`;
    await request(server)
      .put(mutePath)
      .set("Authorization", authorization.guardian)
      .send({ muted: true })
      .expect(200);
    expect(
      (
        await request(server)
          .get(mutePath)
          .set("Authorization", authorization.guardian)
          .expect(200)
      ).body,
    ).toEqual({ muted: true });
    await request(server)
      .get(mutePath)
      .set("Authorization", authorization.otherGuardian)
      .expect(404);
    await request(server)
      .get(`/ace/parent/sites/${otherSiteId}/messages/notifications`)
      .set("Authorization", authorization.guardian)
      .expect(404);
  });
}

export function registerStaffMessageEmailCases(
  getContext: () => MessageEmailTestContext,
): void {
  it("keeps email preferences self-scoped and sends one generic alert per message", async () => {
    const {
      app,
      authorization,
      orgId,
      otherOrgId,
      siteId,
      otherSiteId,
      teacherId,
      staffConversationId,
      staffPath,
    } = getContext();
    if (!app) return;
    const server = app.getHttpServer();
    await prisma.tenant.update({
      where: { id: siteId },
      data: { timezone: "Europe/London" },
    });
    await prisma.user.update({
      where: { id: teacherId },
      data: { email: `teacher-${teacherId}@example.test` },
    });
    const preferencesPath = "/ace/messages/notifications";
    const initial = await request(server)
      .get(preferencesPath)
      .set("Authorization", authorization.teacher)
      .expect(200);
    expect(initial.body.enabled).toBe(false);

    await request(server)
      .put(preferencesPath)
      .set("Authorization", authorization.teacher)
      .send({ enabled: true, quietHoursStart: null, quietHoursEnd: null })
      .expect(200);
    const mutePath = `${preferencesPath}/conversations/${staffConversationId}/mute`;
    await request(server)
      .put(mutePath)
      .set("Authorization", authorization.teacher)
      .send({ muted: true })
      .expect(200);
    expect(
      (
        await request(server)
          .get(mutePath)
          .set("Authorization", authorization.teacher)
          .expect(200)
      ).body,
    ).toEqual({ muted: true });
    expect(
      (
        await request(server)
          .get(mutePath)
          .set("Authorization", authorization.otherSiteStaff)
      ).status,
    ).not.toBe(200);
    await request(server)
      .put(mutePath)
      .set("Authorization", authorization.teacher)
      .send({ muted: false })
      .expect(200);

    const sent = await request(server)
      .post(`${staffPath}/${staffConversationId}/messages`)
      .set("Authorization", authorization.head)
      .send({ clientRequestId: randomUUID(), body: "Private test message" })
      .expect(200);
    const outbox = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: sent.body.id, eventType: "ace.message.sent" },
    });
    expect(JSON.stringify(outbox.payload)).not.toContain(
      "Private test message",
    );

    const mailer = app.get(MailerService);
    const provider = jest
      .spyOn(mailer, "sendMessageNotification")
      .mockResolvedValue("provider-test-id");
    try {
      const dispatcher = app.get(MessageEmailDispatchService);
      const scope = {
        orgId,
        tenantId: siteId,
        conversationId: staffConversationId,
        messageId: sent.body.id,
      };
      expect((await dispatcher.dispatch(scope)).sent).toBe(1);
      expect((await dispatcher.dispatch(scope)).sent).toBe(0);
      expect(provider).toHaveBeenCalledTimes(1);
      const delivery = await withTenantRlsContext(siteId, orgId, (tx) =>
        tx.messageEmailDelivery.findFirstOrThrow({
          where: { tenantId: siteId, messageId: sent.body.id },
        }),
      );
      expect(delivery).toMatchObject({
        status: "SENT",
        providerId: "provider-test-id",
      });
      provider.mockRejectedValueOnce(
        new MessageEmailProviderRejectedError("rejected"),
      );
      const rejectedMessage = await request(server)
        .post(`${staffPath}/${staffConversationId}/messages`)
        .set("Authorization", authorization.head)
        .send({ clientRequestId: randomUUID(), body: "Rejected delivery test" })
        .expect(200);
      const rejectedScope = { ...scope, messageId: rejectedMessage.body.id };
      await dispatcher.dispatch(rejectedScope);
      await dispatcher.dispatch(rejectedScope);
      expect(provider).toHaveBeenCalledTimes(2);
      expect(
        await withTenantRlsContext(siteId, orgId, (tx) =>
          tx.messageEmailDelivery.findFirstOrThrow({
            where: { tenantId: siteId, messageId: rejectedMessage.body.id },
            select: { status: true, failureCategory: true },
          }),
        ),
      ).toEqual({ status: "FAILED", failureCategory: "PROVIDER_REJECTED" });
      if (process.env.E2E_USE_GLOBAL_SETUP === "true") {
        const foreign = await withTenantRlsContext(
          otherSiteId,
          otherOrgId,
          async (tx) => {
            await tx.$executeRawUnsafe(
              'SET LOCAL ROLE "pathway_e2e_tenant_rls"',
            );
            return tx.messageEmailPreference.findFirst({
              where: { tenantId: siteId, userId: teacherId },
            });
          },
        );
        expect(foreign).toBeNull();
      }
    } finally {
      provider.mockRestore();
    }
  });

  it("requires cron auth and consumes a message outbox event once", async () => {
    const { app, authorization, staffConversationId, staffPath } = getContext();
    if (!app) return;
    const secret = "message-email-e2e-cron-secret";
    const previousSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = secret;
    await prisma.outboxEvent.updateMany({
      where: { eventType: "ace.message.sent" },
      data: { status: "DISPATCHED" },
    });
    const sent = await request(app.getHttpServer())
      .post(`${staffPath}/${staffConversationId}/messages`)
      .set("Authorization", authorization.head)
      .send({ clientRequestId: randomUUID(), body: "Cron delivery test" })
      .expect(200);
    const mailer = app.get(MailerService);
    const available = jest
      .spyOn(mailer, "isMessageEmailAvailable")
      .mockReturnValue(true);
    const provider = jest
      .spyOn(mailer, "sendMessageNotification")
      .mockResolvedValue("cron-provider-id");
    try {
      const path = "/internal/message-email/run";
      await request(app.getHttpServer()).get(path).expect(401);
      const first = await request(app.getHttpServer())
        .get(path)
        .set("Authorization", `Bearer ${secret}`)
        .expect(200);
      expect(first.body.sent).toBe(1);
      await request(app.getHttpServer())
        .get(path)
        .set("Authorization", `Bearer ${secret}`)
        .expect(200);
      expect(provider).toHaveBeenCalledTimes(1);
      expect(
        await prisma.outboxEvent.findFirstOrThrow({
          where: { aggregateId: sent.body.id, eventType: "ace.message.sent" },
          select: { status: true },
        }),
      ).toEqual({ status: "DISPATCHED" });
    } finally {
      available.mockRestore();
      provider.mockRestore();
      if (previousSecret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = previousSecret;
    }
  });
}
