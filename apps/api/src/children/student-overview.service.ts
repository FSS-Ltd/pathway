import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { prisma, withTenantRlsContext } from "@pathway/db";
import type { PermissionKey } from "@pathway/platform";
import { EffectivePermissionsService } from "../access-control/effective-permissions.service";
import { localDate } from "../attendance/family-daily-attendance-history";
import { isFamilySectionEnabled } from "../family/family-release-policy";
import type {
  StudentOverviewResponse,
  StudentOverviewTab,
} from "./dto/student-overview.dto";
import {
  readAcademics,
  readAttendance,
  readBehaviour,
  readDiscipline,
  readOverviewSection,
  readPace,
  type OverviewReadContext,
} from "./student-overview-sections";

interface OverviewActor {
  siteId: string;
  orgId: string;
  userId: string;
  isSiteAdmin: boolean;
}

const unavailable = (reason: string) => ({
  status: "unavailable" as const,
  reason,
});

@Injectable()
export class StudentOverviewService {
  private readonly logger = new Logger(StudentOverviewService.name);

  constructor(
    @Inject(EffectivePermissionsService)
    private readonly permissions: EffectivePermissionsService,
  ) {}

  async staff(
    childId: string,
    actor: OverviewActor,
  ): Promise<StudentOverviewResponse> {
    const site = await this.requireSite(actor.siteId, actor.orgId);
    const now = new Date();
    const child = await this.requireChild(actor.siteId, actor.orgId, childId);
    const permissionKeys = new Set(
      await this.permissions
        .listForUser(actor.userId, actor.orgId, actor.siteId)
        .catch(() => {
          this.logger.error("Staff overview permission lookup failed");
          return [];
        }),
    );
    return this.assemble(
      child,
      site,
      now,
      permissionKeys,
      false,
      actor.isSiteAdmin,
    );
  }

  async parent(
    siteId: string,
    childId: string,
    userId: string,
  ): Promise<StudentOverviewResponse> {
    const site = await this.requireSite(siteId);
    if (!site.parentPortalEnabled)
      throw new NotFoundException("Student overview not found");
    const now = new Date();
    const child = await this.requireLinkedChild(
      siteId,
      site.orgId,
      childId,
      userId,
      now,
    );
    const [studentIdentity, permissionKeys] = await Promise.allSettled([
      withTenantRlsContext(siteId, site.orgId, (tx) =>
        tx.studentIdentity.findUnique({
          where: { tenantId_userId: { tenantId: siteId, userId } },
          select: { id: true },
        }),
      ),
      this.permissions.listForUser(userId, site.orgId, siteId),
    ]);
    if (
      studentIdentity.status === "rejected" ||
      permissionKeys.status === "rejected"
    ) {
      this.logger.error("Family ACE overview authorization lookup failed");
    }
    const aceAllowed =
      site.isAceSchool &&
      studentIdentity.status === "fulfilled" &&
      !studentIdentity.value &&
      permissionKeys.status === "fulfilled" &&
      permissionKeys.value.includes("ace.parent.progress.read") &&
      (await this.hasActiveAceEnrollment(
        siteId,
        site.orgId,
        childId,
        now,
        site.timezone,
      ).catch(() => {
        this.logger.error("Family ACE overview enrollment lookup failed");
        return false;
      }));
    const response = await this.assemble(
      child,
      site,
      now,
      aceAllowed
        ? new Set<PermissionKey>(["ace.parent.progress.read"])
        : new Set<PermissionKey>(),
      true,
    );
    // Relationship changes during optional reads must not return a stale profile.
    await this.requireLinkedChild(
      siteId,
      site.orgId,
      childId,
      userId,
      new Date(),
    );
    return response;
  }

  private async assemble(
    child: Awaited<ReturnType<StudentOverviewService["requireChild"]>>,
    site: Awaited<ReturnType<StudentOverviewService["requireSite"]>>,
    now: Date,
    permissions: ReadonlySet<PermissionKey>,
    isParent: boolean,
    canEditProfile = false,
  ): Promise<StudentOverviewResponse> {
    const period = await this.period(site, now);
    const context: OverviewReadContext = {
      siteId: site.id,
      orgId: site.orgId,
      childId: child.id,
      timezone: site.timezone || "UTC",
      period,
      now,
    };
    const canAttendance = isParent
      ? !site.isAceSchool || isFamilySectionEnabled("attendance")
      : permissions.has("attendance.read");
    const canAceProgress =
      site.isAceSchool &&
      (isParent
        ? permissions.has("ace.parent.progress.read")
        : permissions.has("ace.pace.read"));
    const canAcademics =
      !isParent && site.isAceSchool && permissions.has("ace.reports.read");
    const canBehaviour =
      site.isAceSchool &&
      (isParent
        ? permissions.has("ace.parent.progress.read")
        : permissions.has("ace.behaviour.read"));
    const canDiscipline =
      !isParent &&
      canBehaviour &&
      permissions.has("ace.behaviour.sensitive.read");
    const [attendance, academics, pace, behaviourPair, discipline] =
      await Promise.all([
        canAttendance
          ? readOverviewSection("attendance", () =>
              readAttendance(context, site.isAceSchool),
            )
          : unavailable("Attendance access is not enabled"),
        canAcademics
          ? readOverviewSection("academics", () => readAcademics(context))
          : unavailable("Academic results are not available"),
        canAceProgress
          ? readOverviewSection("pace", () => readPace(context))
          : unavailable("PACE progress is not available"),
        canBehaviour
          ? readBehaviour(context).catch(() => {
              this.logger.error("Behaviour overview summary failed");
              return {
                behaviour: { status: "error" as const },
                merits: { status: "error" as const },
              };
            })
          : {
              behaviour: unavailable("Behaviour is not available"),
              merits: unavailable("Merits are not available"),
            },
        canDiscipline
          ? readOverviewSection("discipline", () => readDiscipline(context))
          : unavailable("Discipline is not available"),
      ]);
    const { behaviour, merits } = behaviourPair;
    const tabs: StudentOverviewTab[] = ["overview"];
    if (canAttendance) tabs.push("attendance");
    if (!isParent) tabs.push("contacts", "registration");
    if (canAcademics) tabs.push("academics");
    if (canAceProgress) tabs.push("pace");
    if (canBehaviour) tabs.push("behaviour", "merits");
    if (canDiscipline) tabs.push("discipline");
    const enrollment = site.isAceSchool
      ? await this.hasActiveAceEnrollment(
          site.id,
          site.orgId,
          child.id,
          now,
          site.timezone,
        ).catch(() => {
          this.logger.error("Student overview enrollment status lookup failed");
          return null;
        })
      : null;
    return {
      identity: {
        id: child.id,
        firstName: child.firstName,
        lastName: child.lastName,
        preferredName: child.preferredName,
        yearGroup: child.yearGroup,
        groupName: child.group?.name ?? null,
        status:
          enrollment === null
            ? "unknown"
            : enrollment
              ? "enrolled"
              : "not-enrolled",
      },
      period,
      tabs,
      actions: isParent
        ? []
        : [
            ...(canEditProfile ? ["edit-profile" as const] : []),
            ...(site.isAceSchool && permissions.has("ace.pace.record")
              ? ["manage-pace" as const]
              : []),
            "view-registration",
          ],
      sections: { attendance, academics, pace, behaviour, discipline, merits },
    };
  }

  private async requireSite(siteId: string, orgId?: string) {
    const site = await prisma.tenant.findFirst({
      where: { id: siteId, ...(orgId ? { orgId } : {}) },
      select: {
        id: true,
        orgId: true,
        timezone: true,
        org: {
          select: {
            sector: true,
            parentPortalEnabled: true,
            orgVertical: { select: { vertical: true } },
          },
        },
      },
    });
    if (!site) throw new NotFoundException("Student overview not found");
    return {
      id: site.id,
      orgId: site.orgId,
      timezone: site.timezone,
      sector: site.org.sector,
      parentPortalEnabled: site.org.parentPortalEnabled,
      isAceSchool: site.org.orgVertical?.vertical === "ACE_SCHOOL",
    };
  }

  private async requireChild(siteId: string, orgId: string, childId: string) {
    const child = await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.child.findFirst({
        where: { id: childId, tenantId: siteId, isGuest: false },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          preferredName: true,
          yearGroup: true,
          group: { select: { name: true } },
        },
      }),
    );
    if (!child) throw new NotFoundException("Student overview not found");
    return child;
  }

  private async requireLinkedChild(
    siteId: string,
    orgId: string,
    childId: string,
    userId: string,
    now: Date,
  ) {
    const link = await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.guardianChildRelationship.findFirst({
        where: {
          tenantId: siteId,
          childId,
          legalAccess: "FULL",
          startsAt: { lte: now },
          endedAt: null,
          revokedAt: null,
          guardianIdentity: {
            tenantId: siteId,
            userId,
            user: { isActive: true },
          },
          child: { tenantId: siteId, isGuest: false },
        },
        select: {
          child: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              preferredName: true,
              yearGroup: true,
              group: { select: { name: true } },
            },
          },
        },
      }),
    );
    if (!link) throw new NotFoundException("Student overview not found");
    return link.child;
  }

  private async period(
    site: Awaited<ReturnType<StudentOverviewService["requireSite"]>>,
    now: Date,
  ): Promise<StudentOverviewResponse["period"]> {
    const today =
      localDate(now, site.timezone || "UTC") ?? now.toISOString().slice(0, 10);
    if (site.sector === "SCHOOL" || site.isAceSchool) {
      const year = await withTenantRlsContext(site.id, site.orgId, (tx) =>
        tx.academicYear.findFirst({
          where: {
            tenantId: site.id,
            status: "ACTIVE",
            startsOn: { lte: new Date(`${today}T00:00:00.000Z`) },
            endsOn: { gte: new Date(`${today}T00:00:00.000Z`) },
          },
          orderBy: { startsOn: "desc" },
          select: { name: true, startsOn: true },
        }),
      ).catch(() => {
        this.logger.error("Student overview academic calendar lookup failed");
        return null;
      });
      if (year)
        return {
          from: year.startsOn.toISOString().slice(0, 10),
          to: today,
          label: year.name,
          source: "academic-year",
        };
    }
    const from = new Date(
      Date.parse(`${today}T00:00:00.000Z`) - 29 * 86_400_000,
    )
      .toISOString()
      .slice(0, 10);
    return { from, to: today, label: "Last 30 days", source: "last-30-days" };
  }

  private async hasActiveAceEnrollment(
    siteId: string,
    orgId: string,
    childId: string,
    now: Date,
    timezone: string | null,
  ): Promise<boolean> {
    const day =
      localDate(now, timezone || "UTC") ?? now.toISOString().slice(0, 10);
    const date = new Date(`${day}T00:00:00.000Z`);
    const enrollment = await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.aceSchoolEnrollment.findFirst({
        where: {
          tenantId: siteId,
          childId,
          startsOn: { lte: date },
          OR: [{ endsOn: null }, { endsOn: { gte: date } }],
        },
        select: { id: true },
      }),
    );
    return Boolean(enrollment);
  }
}
