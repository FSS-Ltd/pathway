import "reflect-metadata";
import {
  MODULE_METADATA,
  SELF_DECLARED_DEPS_METADATA,
} from "@nestjs/common/constants";
import { ModuleRef, Reflector } from "@nestjs/core";
import { PathwayRequestContext } from "@pathway/auth";
import { AppModule } from "../app.module";
import { AccessDecisionLogger } from "../access-control/access-decision-logger";
import { AccessCacheService } from "../access-control/access-cache.service";
import { RoleSafetyService } from "../access-control/role-safety.service";
import { AssignmentsController } from "../access-control/assignments.controller";
import { AssignmentsService as AccessControlAssignmentsService } from "../access-control/assignments.service";
import { EffectivePermissionsService } from "../access-control/effective-permissions.service";
import { PermissionGuard } from "../access-control/permission.guard";
import { ROLES_TRANSACTION_BOUNDARY } from "../access-control/roles.service";
import { AssignmentsService } from "../assignments/assignments.service";
import { AttendanceService } from "../attendance/attendance.service";
import { Av30ActivityService } from "../av30/av30-activity.service";
import { Auth0ManagementService } from "../auth/auth0-management.service";
import { BuyNowProvider } from "../billing/buy-now.provider";
import { BuyNowService } from "../billing/buy-now.service";
import { BILLING_WEBHOOK_PROVIDER } from "../billing/billing-webhook.provider";
import { EntitlementsService } from "../billing/entitlements.service";
import { BlogService } from "../blog/blog.service";
import { BILLING_PROVIDER_CONFIG } from "../billing/billing-provider.config";
import { PlanPreviewService } from "../billing/plan-preview.service";
import { GoCardlessBillingWebhookProvider } from "../billing/providers/gocardless-billing-webhook.provider";
import { GoCardlessBuyNowProvider } from "../billing/providers/gocardless-buy-now.provider";
import { StripeBillingWebhookProvider } from "../billing/providers/stripe-billing-webhook.provider";
import { StripeBuyNowProvider } from "../billing/providers/stripe-buy-now.provider";
import { BillingWebhookController } from "../billing/webhook.controller";
import { SupabaseStorageService } from "../common/storage/supabase-storage.service";
import { OutboxService } from "../common/outbox/outbox.service";
import { LoggingService } from "../common/logging/logging.service";
import { LessonsService } from "../lessons/lessons.service";
import { OrgsService } from "../orgs/orgs.service";
import { StaffService } from "../staff/staff.service";
import { BillingService } from "../billing/billing.service";
import { MailerService } from "../mailer/mailer.service";
import { MessagingController } from "../messaging/messaging.controller";
import { MessagingService } from "../messaging/messaging.service";
import { MessagingConversationService } from "../messaging/messaging-conversation.service";
import { MessagingCommandService } from "../messaging/messaging-command.service";
import { StaffSchoolTeamService } from "../messaging/staff-school-team.service";
import { StaffSchoolTeamHistoryService } from "../messaging/staff-school-team-history.service";
import { StaffSchoolTeamReadCursorService } from "../messaging/staff-school-team-read-cursor.service";
import { StaffSchoolTeamCommandService } from "../messaging/staff-school-team-command.service";
import { ParentMessagingController } from "../messaging/parent-messaging.controller";
import { ParentMessagingService } from "../messaging/parent-messaging.service";
import { ParentMessagingHistoryService } from "../messaging/parent-messaging-history.service";
import { ParentMessagingCommandService } from "../messaging/parent-messaging-command.service";
import { ParentMessagingConversationService } from "../messaging/parent-messaging-conversation.service";
import { ParentMessagingReadCursorService } from "../messaging/parent-messaging-read-cursor.service";

type DeclaredDependency = {
  index: number;
  param: unknown;
};

function getDeclaredDependencies(target: unknown): DeclaredDependency[] {
  return (
    Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, target as object) ?? []
  );
}

function getModuleEntries(module: object, key: string): unknown[] {
  const entries: unknown = Reflect.getMetadata(key, module);
  return Array.isArray(entries) ? entries : [];
}

function getRuntimeInjectionTargets(): Array<{ name: string; length: number }> {
  const visited = new Set<object>();
  const targets: Array<{ name: string; length: number }> = [];

  function visit(module: unknown): void {
    if (typeof module !== "function" || visited.has(module)) return;
    visited.add(module);

    for (const key of [
      MODULE_METADATA.CONTROLLERS,
      MODULE_METADATA.PROVIDERS,
    ]) {
      for (const provider of getModuleEntries(module, key)) {
        if (typeof provider === "function" && provider.length > 0) {
          targets.push(provider);
        }
      }
    }
    for (const entry of getModuleEntries(module, MODULE_METADATA.IMPORTS)) {
      if (typeof entry === "object" && entry !== null && "module" in entry) {
        visit(entry.module);
      } else {
        visit(entry);
      }
    }
  }

  visit(AppModule);
  return targets;
}

describe("dependency injection metadata", () => {
  it("declares every production constructor dependency explicitly", () => {
    const missing = getRuntimeInjectionTargets().flatMap((target) => {
      const declared = new Set(
        getDeclaredDependencies(target).map((dependency) => dependency.index),
      );
      return Array.from({ length: target.length }, (_, index) => index)
        .filter((index) => !declared.has(index))
        .map((index) => `${target.name}[${index}]`);
    });

    expect(missing).toEqual([]);
  });

  it.each([
    {
      target: MessagingController,
      dependencies: [
        { index: 0, param: MessagingService },
        { index: 1, param: MessagingConversationService },
        { index: 2, param: MessagingCommandService },
        { index: 3, param: StaffSchoolTeamService },
        { index: 4, param: StaffSchoolTeamHistoryService },
        { index: 5, param: StaffSchoolTeamReadCursorService },
        { index: 6, param: StaffSchoolTeamCommandService },
        { index: 7, param: PathwayRequestContext },
      ],
    },
    {
      target: ParentMessagingController,
      dependencies: [
        { index: 0, param: ParentMessagingService },
        { index: 1, param: ParentMessagingHistoryService },
        { index: 2, param: ParentMessagingCommandService },
        { index: 3, param: ParentMessagingConversationService },
        { index: 4, param: ParentMessagingReadCursorService },
        { index: 5, param: PathwayRequestContext },
      ],
    },
    {
      target: AccessDecisionLogger,
      dependencies: [{ index: 0, param: LoggingService }],
    },
    {
      target: PermissionGuard,
      dependencies: [
        { index: 0, param: Reflector },
        { index: 1, param: EffectivePermissionsService },
        { index: 2, param: PathwayRequestContext },
        { index: 3, param: AccessDecisionLogger },
      ],
    },
    {
      target: AssignmentsController,
      dependencies: [
        { index: 0, param: AccessControlAssignmentsService },
        { index: 1, param: PathwayRequestContext },
      ],
    },
    {
      target: AccessControlAssignmentsService,
      dependencies: [
        { index: 0, param: ROLES_TRANSACTION_BOUNDARY },
        { index: 1, param: OutboxService },
        { index: 2, param: AccessCacheService },
        { index: 3, param: RoleSafetyService },
      ],
    },
    {
      target: OrgsService,
      dependencies: [
        { index: 0, param: BillingService },
        { index: 1, param: LoggingService },
      ],
    },
    {
      target: LessonsService,
      dependencies: [{ index: 0, param: SupabaseStorageService }],
    },
    {
      target: BlogService,
      dependencies: [{ index: 0, param: SupabaseStorageService }],
    },
    {
      target: StaffService,
      dependencies: [{ index: 0, param: SupabaseStorageService }],
    },
    {
      target: AssignmentsService,
      dependencies: [
        { index: 0, param: Av30ActivityService },
        { index: 1, param: MailerService },
      ],
    },
    {
      target: AttendanceService,
      dependencies: [
        { index: 0, param: Av30ActivityService },
        { index: 1, param: PathwayRequestContext },
      ],
    },
    {
      target: EntitlementsService,
      dependencies: [{ index: 0, param: PathwayRequestContext }],
    },
    {
      target: BuyNowService,
      dependencies: [
        { index: 0, param: PlanPreviewService },
        { index: 1, param: BuyNowProvider },
        { index: 2, param: Auth0ManagementService },
        { index: 3, param: PathwayRequestContext },
        { index: 4, param: BILLING_PROVIDER_CONFIG },
      ],
    },
    {
      target: BillingWebhookController,
      dependencies: [
        { index: 0, param: BILLING_WEBHOOK_PROVIDER },
        { index: 1, param: EntitlementsService },
        { index: 2, param: ModuleRef },
        { index: 3, param: BILLING_PROVIDER_CONFIG },
        { index: 4, param: LoggingService },
      ],
    },
    {
      target: StripeBuyNowProvider,
      dependencies: [{ index: 0, param: BILLING_PROVIDER_CONFIG }],
    },
    {
      target: GoCardlessBuyNowProvider,
      dependencies: [{ index: 0, param: BILLING_PROVIDER_CONFIG }],
    },
    {
      target: StripeBillingWebhookProvider,
      dependencies: [{ index: 0, param: BILLING_PROVIDER_CONFIG }],
    },
    {
      target: GoCardlessBillingWebhookProvider,
      dependencies: [{ index: 0, param: BILLING_PROVIDER_CONFIG }],
    },
  ])(
    "declares explicit constructor dependencies for $target.name",
    ({ target, dependencies }) => {
      expect(getDeclaredDependencies(target)).toEqual(
        expect.arrayContaining(
          dependencies.map((dependency) => expect.objectContaining(dependency)),
        ),
      );
    },
  );
});
