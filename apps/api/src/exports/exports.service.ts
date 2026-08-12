import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { AttendanceStatus, prisma } from "@pathway/db";

export type AttendanceExportType = "children" | "staff" | "all";

/** SITE_ADMIN can export; ORG_ADMIN and legacy ADMIN/TEACHER/COORDINATOR also allowed. */
const EXPORT_ADMIN_SITE_ROLES = ["SITE_ADMIN"] as const;

function escapeCsv(s: string): string {
  const v = String(s ?? "").replace(/"/g, '""');
  return v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v}"` : v;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatTime(d: Date): string {
  return d.toISOString().slice(11, 16);
}

function childAttendanceStatus(
  attendance: { status: AttendanceStatus | null; present: boolean } | undefined,
): AttendanceStatus | "UNKNOWN" {
  if (!attendance) return "UNKNOWN";
  return (
    attendance.status ??
    (attendance.present ? AttendanceStatus.PRESENT : AttendanceStatus.ABSENT)
  );
}

/** Safeguarding: initials only (e.g. "A P.") for children in exports. */
function childInitials(c: { firstName?: string | null; lastName?: string | null }): string {
  const first = (c.firstName ?? "").trim().charAt(0).toUpperCase();
  const last = (c.lastName ?? "").trim().charAt(0).toUpperCase();
  if (first && last) return `${first} ${last}.`;
  if (first) return `${first}.`;
  return "Child";
}

/** Safeguarding: initials only (e.g. "J N.") for staff in exports. */
function staffInitials(u: { displayName?: string | null; name?: string | null; firstName?: string | null; lastName?: string | null }): string {
  if (u.firstName || u.lastName) {
    const first = (u.firstName ?? "").trim().charAt(0).toUpperCase();
    const last = (u.lastName ?? "").trim().charAt(0).toUpperCase();
    if (first && last) return `${first} ${last}.`;
    if (first) return `${first}.`;
  }
  const name = (u.displayName && !/^[^@]+@[^@]+\.[^@]+$/.test(u.displayName))
    ? u.displayName
    : (u.name ?? "");
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0].charAt(0).toUpperCase()} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
  }
  if (parts.length === 1) return `${parts[0].charAt(0).toUpperCase()}.`;
  return "Staff";
}

@Injectable()
export class ExportsService {
  /**
   * Check if user can export attendance by querying DB directly.
   * Bypasses PathwayRequestContext to avoid scope/context issues.
   */
  private async requireAdmin(userId: string, tenantId: string): Promise<void> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { orgId: true },
    });
    if (!tenant) throw new ForbiddenException("Tenant not found");

    const [siteMembership, orgMembership] = await Promise.all([
      prisma.siteMembership.findFirst({
        where: { userId, tenantId },
        select: { role: true },
      }),
      prisma.orgMembership.findFirst({
        where: { userId, orgId: tenant.orgId },
        select: { role: true },
      }),
    ]);

    if (siteMembership && EXPORT_ADMIN_SITE_ROLES.includes(siteMembership.role as (typeof EXPORT_ADMIN_SITE_ROLES)[number]))
      return;
    if (orgMembership?.role === "ORG_ADMIN") return;

    const legacyRole = await prisma.userTenantRole.findFirst({
      where: { userId, tenantId },
      select: { role: true },
    });
    if (legacyRole && ["ADMIN", "TEACHER", "COORDINATOR"].includes(legacyRole.role))
      return;

    throw new ForbiddenException("Admin role required for exports");
  }

  async getSiteAttendanceCsv(
    userId: string,
    tenantId: string,
    from: Date,
    to: Date,
    type: AttendanceExportType,
  ): Promise<string> {
    await this.requireAdmin(userId, tenantId);

    const sessions = await prisma.session.findMany({
      where: {
        tenantId,
        startsAt: { lte: to },
        endsAt: { gte: from },
      },
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        groups: { select: { id: true, name: true } },
        attendances: {
          where: { child: { tenantId } },
          select: {
            childId: true,
            present: true,
            status: true,
            timestamp: true,
          },
        },
        assignments: {
          select: {
            userId: true,
            role: true,
            user: {
              select: {
                id: true,
                displayName: true,
                name: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        sessionStaffAttendance: {
          select: { staffUserId: true, status: true, markedAt: true },
        },
      },
      orderBy: { startsAt: "asc" },
    });

    const groupLabel = (s: { groups: { name: string }[] }) => s.groups[0]?.name ?? "";

    const headers =
      type === "all"
        ? ["personType", "personName", "sessionTitle", "sessionDate", "startTime", "endTime", "groupLabel", "attendanceStatus", "recordedAt"]
        : ["personName", "sessionTitle", "sessionDate", "startTime", "endTime", "groupLabel", "attendanceStatus", "recordedAt"];

    const rows: string[][] = [];

    for (const s of sessions) {
      const sessionDate = formatDate(s.startsAt);
      const startTime = formatTime(s.startsAt);
      const endTime = formatTime(s.endsAt);
      const gLabel = groupLabel(s);

      if (type === "children" || type === "all") {
        const attendanceByChild = new Map(
          s.attendances.map((attendance) => [
            attendance.childId,
            {
              present: attendance.present,
              status: attendance.status,
              timestamp: attendance.timestamp ?? undefined,
            },
          ]),
        );
        const groupIds = s.groups.map((g) => g.id);
        const children =
          groupIds.length > 0
            ? await prisma.child.findMany({
                where: { tenantId, groupId: { in: groupIds } },
                select: { id: true, firstName: true, lastName: true },
                orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
              })
            : [];
        for (const c of children) {
          const row = attendanceByChild.get(c.id);
          const status = childAttendanceStatus(row);
          const recordedAt = row?.timestamp ? row.timestamp.toISOString() : "";
          const rowData =
            type === "all"
              ? ["child", childInitials(c), s.title ?? "", sessionDate, startTime, endTime, gLabel, status, recordedAt]
              : [childInitials(c), s.title ?? "", sessionDate, startTime, endTime, gLabel, status, recordedAt];
          rows.push(rowData.map(escapeCsv));
        }
      }

      if (type === "staff" || type === "all") {
        const staffStatusByUser = new Map(s.sessionStaffAttendance.map((a) => [a.staffUserId, { status: a.status, markedAt: a.markedAt }]));
        for (const a of s.assignments) {
          const u = a.user;
          const staffRow = staffStatusByUser.get(u.id);
          const status = (staffRow?.status ?? "UNKNOWN") as string;
          const recordedAt = staffRow?.markedAt ? staffRow.markedAt.toISOString() : "";
          const rowData =
            type === "all"
              ? ["staff", staffInitials(u), s.title ?? "", sessionDate, startTime, endTime, gLabel, status, recordedAt]
              : [staffInitials(u), s.title ?? "", sessionDate, startTime, endTime, gLabel, status, recordedAt];
          rows.push(rowData.map(escapeCsv));
        }
      }
    }

    return [headers.map(escapeCsv).join(","), ...rows.map((r) => r.join(","))].join("\n");
  }

  async getChildAttendanceCsv(
    userId: string,
    tenantId: string,
    childId: string,
    from: Date,
    to: Date,
  ): Promise<string> {
    await this.requireAdmin(userId, tenantId);

    const child = await prisma.child.findFirst({
      where: { id: childId, tenantId },
      select: { id: true, firstName: true, lastName: true, groupId: true },
    });
    if (!child) throw new NotFoundException("Child not found");

    const sessions = await prisma.session.findMany({
      where: {
        tenantId,
        startsAt: { lte: to },
        endsAt: { gte: from },
        ...(child.groupId
          ? {
              OR: [
                { groups: { some: { id: child.groupId } } },
                { attendances: { some: { childId } } },
              ],
            }
          : { attendances: { some: { childId } } }),
      },
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        groups: { select: { name: true } },
      },
      orderBy: { startsAt: "asc" },
    });

    const sessionIds = sessions.map((s) => s.id);
    const attendances = await prisma.attendance.findMany({
      where: { sessionId: { in: sessionIds }, childId },
      select: {
        sessionId: true,
        present: true,
        status: true,
        timestamp: true,
      },
    });
    const bySession = new Map(attendances.map((a) => [a.sessionId, a]));

    const headers = ["childName", "sessionTitle", "sessionDate", "startTime", "endTime", "groupLabel", "status", "checkInTime", "checkOutTime", "recordedAt"];
    const childName = childInitials(child);

    const rows = sessions.map((s) => {
      const a = bySession.get(s.id);
      const status = childAttendanceStatus(a);
      const recordedAt = a?.timestamp ? a.timestamp.toISOString() : "";
      return [
        childName,
        s.title ?? "",
        formatDate(s.startsAt),
        formatTime(s.startsAt),
        formatTime(s.endsAt),
        s.groups[0]?.name ?? "",
        status,
        "",
        "",
        recordedAt,
      ].map(escapeCsv);
    });

    return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  }

  async getStaffAttendanceCsv(
    currentUserId: string,
    tenantId: string,
    staffUserId: string,
    from: Date,
    to: Date,
  ): Promise<string> {
    await this.requireAdmin(currentUserId, tenantId);

    const user = await prisma.user.findFirst({
      where: {
        id: staffUserId,
        OR: [{ tenantId }, { siteMemberships: { some: { tenantId } } }],
      },
      select: { id: true, displayName: true, name: true, firstName: true, lastName: true },
    });
    if (!user) throw new NotFoundException("Staff member not found");

    const assignments = await prisma.assignment.findMany({
      where: {
        userId: staffUserId,
        session: { tenantId, startsAt: { lte: to }, endsAt: { gte: from } },
      },
      select: {
        sessionId: true,
        role: true,
        session: {
          select: {
            id: true,
            title: true,
            startsAt: true,
            endsAt: true,
            groups: { select: { name: true } },
          },
        },
      },
      orderBy: { session: { startsAt: "asc" } },
    });

    const sessionIds = assignments.map((a) => a.sessionId);
    const staffAttendance = await prisma.sessionStaffAttendance.findMany({
      where: { tenantId, sessionId: { in: sessionIds }, staffUserId },
      select: { sessionId: true, status: true, markedAt: true, markedByUser: { select: { displayName: true, name: true } } },
    });
    const bySession = new Map(staffAttendance.map((a) => [a.sessionId, a]));

    const roleLabel = (r: string) => {
      const u = (r ?? "").toUpperCase();
      if (u === "LEAD") return "Lead";
      if (u === "SUPPORT") return "Support";
      if (u === "TEACHER" || u === "ADMIN") return "Lead";
      if (u === "COORDINATOR") return "Coordinator";
      return "Support";
    };

    const headers = [
      "staffName",
      "sessionTitle",
      "sessionDate",
      "startTime",
      "endTime",
      "groupLabel",
      "assignedRoleLabel",
      "presenceStatus",
      "markedAt",
      "markedBy",
    ];
    const staffName = staffInitials(user);

    const rows = assignments.map((a) => {
      const s = a.session;
      const att = bySession.get(s.id);
      const presenceStatus = (att?.status ?? "UNKNOWN") as string;
      const markedAt = att?.markedAt ? att.markedAt.toISOString() : "";
      const markedByUser = att?.markedByUser;
      const markedBy = markedByUser
        ? staffInitials({
            displayName: markedByUser.displayName,
            name: markedByUser.name,
            firstName: null,
            lastName: null,
          })
        : "";
      return [
        staffName,
        s.title ?? "",
        formatDate(s.startsAt),
        formatTime(s.startsAt),
        formatTime(s.endsAt),
        s.groups[0]?.name ?? "",
        roleLabel(a.role),
        presenceStatus,
        markedAt,
        markedBy,
      ].map(escapeCsv);
    });

    return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  }
}
