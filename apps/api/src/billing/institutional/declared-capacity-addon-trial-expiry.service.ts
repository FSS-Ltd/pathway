import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  InstitutionalAddonTrialStatus,
  ModuleGrantSource,
  ModuleStatus,
  OrgRole,
} from "@pathway/db";
import { OutboxService } from "../../common/outbox/outbox.service";
import { MailerService } from "../../mailer/mailer.service";
import { withInstitutionalOrgLock } from "./institutional-quote.service";
import { refreshEffectiveOrgModules } from "../module-grants";

@Injectable()
export class DeclaredCapacityAddonTrialExpiryService {
  constructor(
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(MailerService) private readonly mailer: MailerService,
  ) {}

  async expireDueForOrg(
    orgId: string,
    now = new Date(),
  ): Promise<{ expired: number }> {
    if (!Number.isFinite(now.getTime())) {
      throw new BadRequestException({ code: "INVALID_EXPIRY_TIME" });
    }
    return withInstitutionalOrgLock(orgId, async (tx) => {
      const dueTrials = await tx.institutionalAddonTrial.findMany({
        where: {
          orgId,
          status: InstitutionalAddonTrialStatus.ACTIVE,
          expiresAt: { lte: now },
          expiryEmailQueuedAt: null,
        },
        orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      });
      let expired = 0;
      for (const trial of dueTrials) {
        const transition = await tx.institutionalAddonTrial.updateMany({
          where: {
            id: trial.id,
            orgId,
            status: InstitutionalAddonTrialStatus.ACTIVE,
            expiresAt: { lte: now },
            expiryEmailQueuedAt: null,
          },
          data: {
            status: InstitutionalAddonTrialStatus.EXPIRED,
            expiryEmailQueuedAt: now,
          },
        });
        if (transition.count !== 1) continue;

        await tx.moduleGrant.updateMany({
          where: {
            orgId,
            module: trial.module,
            source: ModuleGrantSource.TRIAL,
            sourceId: trial.id,
            status: ModuleStatus.ACTIVE,
          },
          data: { status: ModuleStatus.CANCELLED },
        });
        await refreshEffectiveOrgModules(tx, orgId, new Set([trial.module]));
        await this.outbox.enqueue(tx, {
          aggregateType: "institutional_addon_trial",
          aggregateId: trial.id,
          eventType: "institutional.addon_trial.expired",
          payload: { orgId, trialId: trial.id },
          idempotencyKey: `institutional-addon-trial-expiry:${trial.id}`,
        });
        expired += 1;
      }
      return { expired };
    });
  }

  async dispatchExpiryEmail(
    orgId: string,
    trialId: string,
    idempotencyKey: string,
    now = new Date(),
  ): Promise<{ sent: boolean }> {
    if (idempotencyKey !== `institutional-addon-trial-expiry:${trialId}`) {
      throw new BadRequestException({ code: "INVALID_OUTBOX_IDEMPOTENCY_KEY" });
    }
    const emailContext = await withInstitutionalOrgLock(orgId, async (tx) => {
      const trial = await tx.institutionalAddonTrial.findFirst({
        where: {
          id: trialId,
          orgId,
          status: InstitutionalAddonTrialStatus.EXPIRED,
          expiryEmailQueuedAt: { not: null },
        },
        select: {
          id: true,
          module: true,
          expiryEmailSentAt: true,
          expiresAt: true,
        },
      });
      if (!trial || !trial.expiresAt || trial.expiresAt > now) {
        throw new ConflictException({ code: "ADDON_TRIAL_EXPIRY_NOT_QUEUED" });
      }
      if (trial.expiryEmailSentAt) {
        return { alreadySent: true as const };
      }

      const [org, billingMembers, legacyBillingRoles, policy] =
        await Promise.all([
          tx.org.findUnique({ where: { id: orgId }, select: { name: true } }),
          tx.orgMembership.findMany({
            where: { orgId, role: OrgRole.ORG_BILLING },
            orderBy: { createdAt: "asc" },
            include: { user: { select: { email: true } } },
          }),
          tx.userOrgRole.findMany({
            where: { orgId, role: OrgRole.ORG_BILLING },
            include: { user: { select: { email: true } } },
          }),
          tx.institutionalBillingPolicy.findUnique({
            where: { orgId },
            select: { declaredByUserId: true },
          }),
        ]);
      const signupUser = policy?.declaredByUserId
        ? await tx.user.findUnique({
            where: { id: policy.declaredByUserId },
            select: { email: true },
          })
        : null;
      const recipient =
        billingMembers.find(({ user }) => user.email)?.user.email ??
        legacyBillingRoles.find(({ user }) => user.email)?.user.email ??
        signupUser?.email;
      if (!org || !recipient) {
        throw new ServiceUnavailableException({
          code: "ADDON_TRIAL_EXPIRY_RECIPIENT_UNAVAILABLE",
        });
      }
      return {
        alreadySent: false as const,
        trialId: trial.id,
        module: trial.module,
        organisationName: org.name,
        recipient,
      };
    });
    if (emailContext.alreadySent) return { sent: false };
    if (!this.mailer.isAddonTrialExpiryEmailAvailable()) {
      throw new ServiceUnavailableException({
        code: "ADDON_TRIAL_EMAIL_PROVIDER_UNAVAILABLE",
      });
    }
    await this.mailer.sendAddonTrialExpiryEmail({
      to: emailContext.recipient,
      organisationName: emailContext.organisationName,
      moduleName: this.moduleName(emailContext.module),
      trialId: emailContext.trialId,
    });
    await withInstitutionalOrgLock(orgId, async (tx) => {
      await tx.institutionalAddonTrial.updateMany({
        where: {
          id: trialId,
          orgId,
          status: InstitutionalAddonTrialStatus.EXPIRED,
          expiryEmailSentAt: null,
        },
        data: { expiryEmailSentAt: now },
      });
    });
    return { sent: true };
  }

  private moduleName(module: string): string {
    return module
      .split("_")
      .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
      .join(" ");
  }
}
