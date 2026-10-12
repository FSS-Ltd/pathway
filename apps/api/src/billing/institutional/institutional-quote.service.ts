import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Inject,
  NotFoundException,
} from "@nestjs/common";
import {
  applyTenantContext,
  AuditAction,
  AuditEntityType,
  InstitutionalCountSource,
  InstitutionalSnapshotKind,
  InstitutionalSnapshotStatus,
  OrgRole,
  Prisma,
  prisma,
  SubscriptionStatus,
  Vertical,
  withOrgRlsContext,
} from "@pathway/db";
import {
  calculateInstitutionalQuote,
  INSTITUTIONAL_PLANS,
  INSTITUTIONAL_PRICING_VERSION,
  type InstitutionalPlanCode,
} from "@pathway/pricing";
import { EnrolmentRollService } from "../../enrolments/enrolment-roll.service";
import {
  isInstitutionalPlanCode,
  validateInstitutionalSelection,
  type InstitutionalModuleSelection,
} from "./institutional-selection";
import {
  assertTimezone,
  localDateAt,
  QUOTE_VALIDITY_MS,
} from "./institutional-time";

export type CreateInstitutionalQuoteInput = InstitutionalModuleSelection & {
  planCode: InstitutionalPlanCode;
  declaredChildren?: number;
  declarationAccepted?: boolean;
};

export async function withInstitutionalOrgLock<T>(
  orgId: string,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await applyTenantContext(tx, "", orgId);
    // Enrolment writes use this same advisory lock. The count and quote are
    // therefore drawn from one stable committed roll state.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ENROLMENT:${orgId}`}, 0))`;
    return operation(tx);
  });
}

@Injectable()
export class InstitutionalQuoteService {
  constructor(
    @Inject(EnrolmentRollService) private readonly roll: EnrolmentRollService,
  ) {}

  async assertBillingRole(orgId: string, userId: string): Promise<void> {
    if (!orgId || !userId)
      throw new ForbiddenException("Billing role required.");
    const allowed = await withOrgRlsContext(orgId, async (tx) => {
      const [membership, legacyRoles, vertical] = await Promise.all([
        tx.orgMembership.findUnique({
          where: { orgId_userId: { orgId, userId } },
          select: { role: true },
        }),
        tx.userOrgRole.findMany({
          where: {
            orgId,
            userId,
            role: { in: [OrgRole.ORG_ADMIN, OrgRole.ORG_BILLING] },
          },
          select: { id: true },
          take: 1,
        }),
        tx.orgVertical.findUnique({
          where: { orgId },
          select: { vertical: true },
        }),
      ]);
      return (
        vertical?.vertical !== Vertical.HOME_EDUCATION &&
        (membership?.role === OrgRole.ORG_ADMIN ||
          membership?.role === OrgRole.ORG_BILLING ||
          legacyRoles.length > 0)
      );
    });
    if (!allowed) throw new ForbiddenException("Billing role required.");
  }

  async ensurePolicy(tx: Prisma.TransactionClient, orgId: string) {
    const site = await tx.tenant.findFirst({
      where: { orgId },
      orderBy: { createdAt: "asc" },
      select: { timezone: true },
    });
    const timezone = assertTimezone(site?.timezone ?? "Europe/London");
    return tx.institutionalBillingPolicy.upsert({
      where: { orgId },
      create: {
        orgId,
        pricingVersion: INSTITUTIONAL_PRICING_VERSION,
        timezone,
      },
      update: {},
    });
  }

  async createQuote(
    orgId: string,
    actorUserId: string,
    input: CreateInstitutionalQuoteInput,
    now = new Date(),
  ) {
    if (!isInstitutionalPlanCode(input.planCode)) {
      throw new BadRequestException({ code: "INVALID_PLAN" });
    }
    const selection = validateInstitutionalSelection(input.planCode, input);
    if (
      input.declaredChildren !== undefined &&
      (!Number.isSafeInteger(input.declaredChildren) ||
        input.declaredChildren < 0)
    ) {
      throw new BadRequestException({ code: "INVALID_COUNT" });
    }
    return withInstitutionalOrgLock(orgId, async (tx) => {
      const currentSubscription = await tx.subscription.findFirst({
        where: {
          orgId,
          planCode: { in: Object.keys(INSTITUTIONAL_PLANS) },
          status: {
            in: [
              SubscriptionStatus.ACTIVE,
              SubscriptionStatus.PAST_DUE,
              SubscriptionStatus.TRIALING,
            ],
          },
        },
        orderBy: { createdAt: "desc" },
        include: { currentInstitutionalSnapshot: true },
      });
      const currentModules = currentSubscription?.currentInstitutionalSnapshot;
      if (
        currentModules &&
        (currentModules.includedModules.length > 0 ||
          currentModules.paidModules.length > 0)
      ) {
        throw new ConflictException({ code: "MODULE_CHANGE_REVIEW_REQUIRED" });
      }
      let policy = await this.ensurePolicy(tx, orgId);
      const confirmation = await tx.enrolmentRollConfirmation.findFirst({
        where: { orgId },
        orderBy: [{ revisionCutoff: "desc" }, { id: "desc" }],
        select: { id: true, revisionCutoff: true },
      });
      let enrolledChildren: number;
      let countSource: InstitutionalCountSource;
      let sourceRevisionCutoff: Date | null = null;
      if (confirmation) {
        if (input.declaredChildren !== undefined) {
          throw new ConflictException({
            code: "ROLL_VERIFIED",
            message: "Use the confirmed roll.",
          });
        }
        const current = await this.roll.roll(
          orgId,
          localDateAt(now, policy.timezone),
          confirmation.revisionCutoff,
        );
        enrolledChildren = current.enrolledCount;
        countSource = InstitutionalCountSource.VERIFIED;
        sourceRevisionCutoff = current.revisionCutoff;
      } else {
        const existingSubscription = await tx.subscription.findFirst({
          where: {
            orgId,
            status: {
              in: [
                SubscriptionStatus.ACTIVE,
                SubscriptionStatus.PAST_DUE,
                SubscriptionStatus.TRIALING,
              ],
            },
          },
          select: { id: true },
        });
        if (existingSubscription) {
          throw new ConflictException({
            code: "ROLL_REVIEW_REQUIRED",
            message: "A confirmed roll is required for renewal.",
          });
        }
        if (input.declaredChildren !== undefined) {
          if (!input.declarationAccepted) {
            throw new BadRequestException({ code: "DECLARATION_NOT_ACCEPTED" });
          }
          policy = await tx.institutionalBillingPolicy.update({
            where: { orgId },
            data: {
              declaredChildren: input.declaredChildren,
              declaredAt: now,
              declaredByUserId: actorUserId,
            },
          });
        }
        if (policy.declaredChildren === null) {
          throw new ConflictException({
            code: "ROLL_REVIEW_REQUIRED",
            message: "Confirm a roll or accept a declaration.",
          });
        }
        enrolledChildren = policy.declaredChildren;
        countSource = InstitutionalCountSource.DECLARED;
      }
      const priced = calculateInstitutionalQuote({
        planCode: input.planCode,
        enrolledChildren,
        pricingVersion: INSTITUTIONAL_PRICING_VERSION,
      });
      const previous = await tx.institutionalBillingSnapshot.findFirst({
        where: {
          orgId,
          kind: InstitutionalSnapshotKind.QUOTE,
          supersededBy: { none: {} },
        },
        select: { id: true },
      });
      const snapshot = await tx.institutionalBillingSnapshot.create({
        data: {
          orgId,
          policyId: policy.id,
          subscriptionId: currentSubscription?.id,
          kind: InstitutionalSnapshotKind.QUOTE,
          status:
            priced.kind === "priced"
              ? InstitutionalSnapshotStatus.PRICED
              : InstitutionalSnapshotStatus.CONTACT_SALES,
          planCode: input.planCode,
          pricingVersion: INSTITUTIONAL_PRICING_VERSION,
          countSource,
          enrolledChildren,
          includedChildren:
            priced.kind === "priced" ? priced.includedChildren : null,
          includedModules: selection.includedModules,
          paidModules: selection.paidModules,
          lines: priced.kind === "priced" ? priced.lines : [],
          subtotalPence: priced.kind === "priced" ? priced.subtotalPence : null,
          sourceConfirmationId: confirmation?.id,
          sourceRevisionCutoff,
          expiresAt: new Date(now.getTime() + QUOTE_VALIDITY_MS),
          supersedesId: previous?.id,
        },
      });
      await tx.auditEvent.create({
        data: {
          orgId,
          actorUserId,
          entityType: AuditEntityType.BILLING_QUOTE,
          entityId: snapshot.id,
          action: AuditAction.CREATED,
          metadata: { status: snapshot.status, countSource, enrolledChildren },
        },
      });
      return snapshot;
    });
  }

  async acceptQuote(
    orgId: string,
    actorUserId: string,
    snapshotId: string,
    idempotencyKey: string,
    now = new Date(),
  ) {
    if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
      throw new BadRequestException({ code: "INVALID_IDEMPOTENCY_KEY" });
    }
    return withInstitutionalOrgLock(orgId, async (tx) => {
      const previousAcceptance =
        await tx.institutionalQuoteAcceptance.findUnique({
          where: { orgId_idempotencyKey: { orgId, idempotencyKey } },
        });
      if (previousAcceptance) {
        if (previousAcceptance.snapshotId !== snapshotId) {
          throw new ConflictException({ code: "IDEMPOTENCY_CONFLICT" });
        }
        return previousAcceptance;
      }
      const snapshot = await tx.institutionalBillingSnapshot.findFirst({
        where: { id: snapshotId, orgId, kind: InstitutionalSnapshotKind.QUOTE },
      });
      if (!snapshot) throw new NotFoundException("Quote not found.");
      const existingAcceptance =
        await tx.institutionalQuoteAcceptance.findUnique({
          where: { snapshotId },
          select: { id: true },
        });
      if (existingAcceptance) {
        throw new ConflictException({ code: "QUOTE_ALREADY_ACCEPTED" });
      }
      if (snapshot.status !== InstitutionalSnapshotStatus.PRICED) {
        throw new ConflictException({ code: "OVER_250_CHILDREN" });
      }
      if (!snapshot.expiresAt || snapshot.expiresAt <= now) {
        throw new ConflictException({ code: "QUOTE_EXPIRED" });
      }
      const supersedingQuote = await tx.institutionalBillingSnapshot.findFirst({
        where: { orgId, supersedesId: snapshot.id },
        select: { id: true },
      });
      if (
        supersedingQuote ||
        snapshot.pricingVersion !== INSTITUTIONAL_PRICING_VERSION
      ) {
        throw new ConflictException({ code: "QUOTE_CHANGED" });
      }
      if (!isInstitutionalPlanCode(snapshot.planCode)) {
        throw new ConflictException({ code: "QUOTE_CHANGED" });
      }
      validateInstitutionalSelection(snapshot.planCode, {
        includedModules: snapshot.includedModules,
        paidModules: snapshot.paidModules,
      });
      const policy = await tx.institutionalBillingPolicy.findUnique({
        where: { orgId },
      });
      if (!policy || policy.pricingVersion !== snapshot.pricingVersion) {
        throw new ConflictException({ code: "QUOTE_CHANGED" });
      }
      if (snapshot.countSource === InstitutionalCountSource.DECLARED) {
        const confirmedRoll = await tx.enrolmentRollConfirmation.findFirst({
          where: { orgId },
          select: { id: true },
        });
        const existingSubscription = await tx.subscription.findFirst({
          where: {
            orgId,
            status: {
              in: [
                SubscriptionStatus.ACTIVE,
                SubscriptionStatus.PAST_DUE,
                SubscriptionStatus.TRIALING,
              ],
            },
          },
          select: { id: true },
        });
        if (
          confirmedRoll ||
          existingSubscription ||
          policy.declaredChildren !== snapshot.enrolledChildren
        ) {
          throw new ConflictException({ code: "QUOTE_CHANGED" });
        }
      } else {
        const confirmation = await tx.enrolmentRollConfirmation.findFirst({
          where: { orgId },
          orderBy: [{ revisionCutoff: "desc" }, { id: "desc" }],
          select: { id: true, revisionCutoff: true },
        });
        if (!confirmation) {
          throw new ConflictException({ code: "QUOTE_CHANGED" });
        }
        const current = await this.roll.roll(
          orgId,
          localDateAt(now, policy.timezone),
          confirmation.revisionCutoff,
        );
        if (
          confirmation?.id !== snapshot.sourceConfirmationId ||
          current.enrolledCount !== snapshot.enrolledChildren
        ) {
          throw new ConflictException({ code: "QUOTE_CHANGED" });
        }
      }
      const acceptance = await tx.institutionalQuoteAcceptance.create({
        data: {
          orgId,
          snapshotId,
          actorUserId,
          idempotencyKey,
          acceptedAt: now,
        },
      });
      await tx.auditEvent.create({
        data: {
          orgId,
          actorUserId,
          entityType: AuditEntityType.BILLING_QUOTE,
          entityId: snapshotId,
          action: AuditAction.UPDATED,
          metadata: { acceptedAt: acceptance.acceptedAt.toISOString() },
        },
      });
      return acceptance;
    });
  }

  async getQuote(orgId: string, snapshotId: string) {
    return withOrgRlsContext(orgId, async (tx) => {
      const quote = await tx.institutionalBillingSnapshot.findFirst({
        where: { id: snapshotId, orgId, kind: InstitutionalSnapshotKind.QUOTE },
        include: { acceptance: { select: { acceptedAt: true } } },
      });
      if (!quote) throw new NotFoundException("Quote not found.");
      return quote;
    });
  }
}
