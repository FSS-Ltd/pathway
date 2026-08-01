import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
  Optional,
} from "@nestjs/common";
import { prisma, Weekday, OrgRole } from "@pathway/db";
import type { UpdateStaffDto } from "./dto/update-staff.dto";
import type { UpdateProfileDto } from "./dto/update-profile.dto";
import { SupabaseStorageService } from "../common/storage/supabase-storage.service";
import { staffAvatarKey } from "../common/storage/storage-key.util";

const WEEKDAY_ORDER: Weekday[] = [
  Weekday.SUN,
  Weekday.MON,
  Weekday.TUE,
  Weekday.WED,
  Weekday.THU,
  Weekday.FRI,
  Weekday.SAT,
];

function minuteFromTime(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function timeFromMinute(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export type StaffForAssignmentRow = {
  id: string;
  fullName: string;
  email: string | null;
  eligible: boolean;
  reason?: "unavailable_at_time" | "does_not_prefer_group" | "blocked_on_date";
};

/** Staff has access to tenant if they have SiteMembership or legacy User.tenantId */
async function assertStaffInTenant(
  userId: string,
  tenantId: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      tenantId: true,
      siteMemberships: { where: { tenantId }, select: { id: true } },
    },
  });
  if (!user) throw new NotFoundException("Staff member not found");
  const hasAccess =
    user.tenantId === tenantId || user.siteMemberships.length > 0;
  if (!hasAccess) throw new NotFoundException("Staff member not found");
}

@Injectable()
export class StaffService {
  constructor(
    @Optional()
    @Inject(SupabaseStorageService)
    storage?: SupabaseStorageService,
  ) {
    this.storage = storage ?? new SupabaseStorageService();
  }

  private readonly storage: SupabaseStorageService;

  /**
   * Returns staff who can be assigned to a session, with eligibility flags.
   * Eligibility is informational only; admins may override.
   * - eligible: no conflict (available at time, not blocked on date, prefers group if groupId set).
   * - reason: first applicable reason when not eligible (blocked_on_date > unavailable_at_time > does_not_prefer_group).
   */
  async getStaffForSessionAssignment(
    tenantId: string,
    params: {
      groupId: string | null;
      startsAt: Date;
      endsAt: Date;
    },
  ): Promise<StaffForAssignmentRow[]> {
    const sessionDate = new Date(params.startsAt);
    const dateStr = sessionDate.toISOString().slice(0, 10);
    const dayOfWeek = sessionDate.getDay();
    const weekday = WEEKDAY_ORDER[dayOfWeek];
    const startMin = Math.floor(params.startsAt.getTime() / 60000) % (24 * 60);
    const endMin = Math.floor(params.endsAt.getTime() / 60000) % (24 * 60);

    const memberIds = await prisma.siteMembership
      .findMany({
        where: { tenantId },
        select: { userId: true },
      })
      .then((rows) => rows.map((r) => r.userId));

    const legacyUserIds = await prisma.user
      .findMany({
        where: { tenantId },
        select: { id: true },
      })
      .then((rows) => rows.map((r) => r.id));

    const userIds = [...new Set([...memberIds, ...legacyUserIds])];
    if (userIds.length === 0) return [];

    const [users, unavailableDates, preferences, preferredGroups] =
      await Promise.all([
        prisma.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            name: true,
            displayName: true,
            email: true,
          },
        }),
        prisma.staffUnavailableDate.findMany({
          where: {
            userId: { in: userIds },
            tenantId,
            date: new Date(dateStr),
          },
          select: { userId: true },
        }),
        prisma.volunteerPreference.findMany({
          where: {
            userId: { in: userIds },
            tenantId,
            weekday,
          },
          select: { userId: true, startMinute: true, endMinute: true },
        }),
        params.groupId
          ? prisma.staffPreferredGroup.findMany({
              where: {
                userId: { in: userIds },
                tenantId,
                groupId: params.groupId,
              },
              select: { userId: true },
            })
          : Promise.resolve([]),
      ]);

    const blockedSet = new Set(unavailableDates.map((u) => u.userId));
    const preferredSet = new Set(preferredGroups.map((p) => p.userId));
    const availableByUser = new Map<string, boolean>();
    for (const p of preferences) {
      const overlaps = startMin < p.endMinute && endMin > p.startMinute;
      if (overlaps) {
        availableByUser.set(p.userId, true);
      }
    }
    for (const uid of userIds) {
      if (!availableByUser.has(uid)) availableByUser.set(uid, false);
    }

    const rows: StaffForAssignmentRow[] = users.map((u) => {
      const fullName =
        [u.firstName, u.lastName].filter(Boolean).join(" ") ||
        u.name ||
        u.displayName ||
        "Unknown";
      let reason: StaffForAssignmentRow["reason"];
      if (blockedSet.has(u.id)) reason = "blocked_on_date";
      else if (!availableByUser.get(u.id)) reason = "unavailable_at_time";
      else if (params.groupId && !preferredSet.has(u.id))
        reason = "does_not_prefer_group";
      return {
        id: u.id,
        fullName,
        email: u.email,
        eligible: !reason,
        reason,
      };
    });

    const order: Record<StaffForAssignmentRow["reason"] & string, number> = {
      blocked_on_date: 1,
      unavailable_at_time: 2,
      does_not_prefer_group: 3,
    };
    rows.sort((a, b) => {
      const aE = a.eligible ? 0 : (order[a.reason!] ?? 4);
      const bE = b.eligible ? 0 : (order[b.reason!] ?? 4);
      if (aE !== bE) return aE - bE;
      return a.fullName.localeCompare(b.fullName);
    });
    return rows;
  }

  async getById(
    userId: string,
    tenantId: string,
    orgId: string,
  ): Promise<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    fullName: string;
    displayName: string | null;
    email: string | null;
    dateOfBirth: string | null;
    avatarUrl: string | null;
    hasAvatar: boolean;
    role: string;
    isActive: boolean;
    weeklyAvailability: { day: Weekday; startTime: string; endTime: string }[];
    unavailableDates: { date: string; reason: string | null }[];
    preferredGroups: { id: string; name: string }[];
    canEditAvailability: boolean;
    hasServeAccess: boolean;
    children: {
      id: string;
      firstName: string;
      lastName: string;
      preferredName: string | null;
      group: { name: string } | null;
    }[];
  }> {
    await assertStaffInTenant(userId, tenantId);

    const [
      user,
      preferences,
      unavailableDates,
      preferredGroups,
      entitlements,
      userWithChildren,
    ] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          name: true,
          displayName: true,
          email: true,
          dateOfBirth: true,
          avatarUrl: true,
          avatarKey: true,
          avatarBytes: true,
          avatarContentType: true,
          isActive: true,
          hasServeAccess: true,
        },
      }),
      prisma.volunteerPreference.findMany({
        where: { userId, tenantId },
        orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
      }),
      prisma.staffUnavailableDate.findMany({
        where: { userId, tenantId },
        orderBy: { date: "asc" },
      }),
      prisma.staffPreferredGroup.findMany({
        where: { userId, tenantId },
        include: { group: { select: { id: true, name: true } } },
      }),
      this.resolvePlanTier(orgId),
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          children: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              preferredName: true,
              group: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    const fullName =
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.name ||
      user.displayName ||
      "Unknown";

    const siteMembership = await prisma.siteMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { role: true },
    });
    const role = siteMembership?.role ?? "STAFF";

    const weeklyAvailability = preferences.map((p) => ({
      day: p.weekday,
      startTime: timeFromMinute(p.startMinute),
      endTime: timeFromMinute(p.endMinute),
    }));

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName,
      displayName: user.displayName,
      email: user.email,
      dateOfBirth: user.dateOfBirth
        ? user.dateOfBirth.toISOString().slice(0, 10)
        : null,
      avatarUrl: user.avatarUrl,
      hasAvatar: Boolean(
        user.avatarKey ||
        (user.avatarBytes && (user.avatarBytes as Buffer).length > 0),
      ),
      role,
      isActive: user.isActive,
      weeklyAvailability,
      unavailableDates: unavailableDates.map((u) => ({
        date: u.date.toISOString().slice(0, 10),
        reason: u.reason,
      })),
      preferredGroups: preferredGroups.map((pg) => ({
        id: pg.group.id,
        name: pg.group.name,
      })),
      canEditAvailability: entitlements,
      hasServeAccess: user.hasServeAccess,
      children:
        userWithChildren?.children.map((c) => ({
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          preferredName: c.preferredName,
          group: c.group,
        })) ?? [],
    };
  }

  /**
   * Get current user's profile including assignments and children.
   * Used for the staff profile page (self-service).
   */
  async getProfileForCurrentUser(
    currentUserId: string,
    tenantId: string,
    orgId: string,
  ): Promise<
    Awaited<ReturnType<StaffService["getById"]>> & {
      assignments: {
        id: string;
        status: string;
        session: {
          id: string;
          title: string;
          startsAt: Date;
          endsAt: Date;
          groups: { id: string; name: string }[];
          attendanceMarked: number;
          attendanceTotal: number;
        };
      }[];
      children: {
        id: string;
        firstName: string;
        lastName: string;
        preferredName: string | null;
        group: { name: string } | null;
      }[];
    }
  > {
    const base = await this.getById(currentUserId, tenantId, orgId);
    const [assignments, userWithChildren] = await Promise.all([
      prisma.assignment.findMany({
        where: {
          userId: currentUserId,
          session: { tenantId },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          session: {
            select: {
              id: true,
              title: true,
              startsAt: true,
              endsAt: true,
              groups: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.user.findUnique({
        where: { id: currentUserId },
        select: {
          children: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              preferredName: true,
              group: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    const sessionIds = assignments.map((a) => a.session.id);
    const [attendanceCounts, childCounts] =
      sessionIds.length > 0
        ? await Promise.all([
            prisma.attendance.groupBy({
              by: ["sessionId"],
              where: { sessionId: { in: sessionIds } },
              _count: { id: true },
            }),
            Promise.all(
              assignments.map(async (a) => {
                const groupIds = a.session.groups.map((g) => g.id);
                if (groupIds.length === 0) return 0;
                return prisma.child.count({
                  where: {
                    tenantId,
                    groupId: { in: groupIds },
                  },
                });
              }),
            ),
          ])
        : ([[], []] as [
            { sessionId: string; _count: { id: number } }[],
            number[],
          ]);

    const markedBySession = new Map(
      attendanceCounts.map((c) => [c.sessionId, c._count.id]),
    );

    return {
      ...base,
      assignments: assignments.map((a, i) => ({
        id: a.id,
        status: String(a.status),
        session: {
          id: a.session.id,
          title: a.session.title ?? "Untitled",
          startsAt: a.session.startsAt,
          endsAt: a.session.endsAt,
          groups: a.session.groups,
          attendanceMarked: markedBySession.get(a.session.id) ?? 0,
          attendanceTotal: childCounts[i] ?? 0,
        },
      })),
      children:
        userWithChildren?.children.map((c) => ({
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          preferredName: c.preferredName,
          group: c.group,
        })) ?? [],
    };
  }

  private static readonly MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB
  private static readonly ALLOWED_AVATAR_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
  ];

  /**
   * Upload avatar for current user. Accepts base64-encoded image.
   * Stored as bytes in DB until S3 migration.
   */
  async uploadAvatar(
    currentUserId: string,
    tenantId: string,
    photoBase64: string,
    contentType?: string | null,
  ): Promise<void> {
    await assertStaffInTenant(currentUserId, tenantId);

    let data = photoBase64;
    let detectedType = contentType;
    if (data.startsWith("data:")) {
      const match = data.match(/^data:([^;]+);base64,/);
      if (match) {
        detectedType = match[1].trim().toLowerCase();
        data = data.replace(/^data:[^;]+;base64,/, "");
      }
    }
    const buffer = Buffer.from(data, "base64");
    if (buffer.length > StaffService.MAX_AVATAR_BYTES) {
      throw new BadRequestException(
        `Avatar must be at most ${StaffService.MAX_AVATAR_BYTES / 1024 / 1024}MB`,
      );
    }
    if (buffer.length === 0) {
      throw new BadRequestException("Avatar data is empty");
    }
    const type = detectedType || "image/jpeg";
    if (!StaffService.ALLOWED_AVATAR_TYPES.includes(type)) {
      throw new BadRequestException(
        `Avatar must be one of: ${StaffService.ALLOWED_AVATAR_TYPES.join(", ")}`,
      );
    }

    const stored = await this.storage.uploadObject({
      bucket: "private",
      key: staffAvatarKey(tenantId, currentUserId, type),
      body: buffer,
      contentType: type,
    });

    await prisma.user.update({
      where: { id: currentUserId },
      data: {
        avatarKey: stored?.key ?? null,
        avatarBytes: stored ? null : buffer,
        avatarContentType: type,
        avatarUrl: null, // Clear external URL when using bytes
      },
    });
  }

  /**
   * Get avatar bytes for current user. Returns null when no avatar stored.
   */
  async getAvatar(
    currentUserId: string,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    const user = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { avatarKey: true, avatarBytes: true, avatarContentType: true },
    });
    if (user?.avatarKey) {
      const buffer = await this.storage.downloadObject(
        process.env.SUPABASE_STORAGE_PRIVATE_BUCKET ?? "",
        user.avatarKey,
      );
      if (buffer) {
        return {
          buffer,
          contentType: user.avatarContentType ?? "image/jpeg",
        };
      }
    }
    if (!user?.avatarBytes || (user.avatarBytes as Buffer).length === 0) {
      return null;
    }
    const buffer =
      user.avatarBytes instanceof Buffer
        ? user.avatarBytes
        : Buffer.from(user.avatarBytes);
    return {
      buffer,
      contentType: user.avatarContentType ?? "image/jpeg",
    };
  }

  /**
   * Update current user's own profile (self-service).
   * Only allows editing profile fields; role/isActive require admin.
   */
  async updateProfile(
    currentUserId: string,
    tenantId: string,
    orgId: string,
    dto: UpdateProfileDto,
  ): Promise<ReturnType<StaffService["getById"]>> {
    await assertStaffInTenant(currentUserId, tenantId);
    const canEditAvailability = await this.resolvePlanTier(orgId);

    const userData: Record<string, unknown> = {};
    if (dto.firstName !== undefined) userData.firstName = dto.firstName;
    if (dto.lastName !== undefined) userData.lastName = dto.lastName;
    if (dto.displayName !== undefined) userData.displayName = dto.displayName;
    if (dto.dateOfBirth !== undefined)
      userData.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    if (dto.avatarUrl !== undefined) userData.avatarUrl = dto.avatarUrl;

    if (Object.keys(userData).length > 0) {
      await prisma.user.update({
        where: { id: currentUserId },
        data: userData as never,
      });
    }

    if (canEditAvailability) {
      if (dto.weeklyAvailability !== undefined) {
        const rangesByDay = new Map<
          Weekday,
          { start: number; end: number }[]
        >();
        for (const item of dto.weeklyAvailability) {
          const start = minuteFromTime(item.startTime);
          const end = minuteFromTime(item.endTime);
          if (start >= end) {
            throw new BadRequestException(
              `Invalid range for ${item.day}: start must be before end`,
            );
          }
          const existing = rangesByDay.get(item.day) ?? [];
          const overlaps = existing.some((r) => start < r.end && end > r.start);
          if (overlaps) {
            throw new BadRequestException(
              `Overlapping time ranges for ${item.day}`,
            );
          }
          existing.push({ start, end });
          rangesByDay.set(item.day, existing);
        }
        await prisma.volunteerPreference.deleteMany({
          where: { userId: currentUserId, tenantId },
        });
        for (const [day, ranges] of rangesByDay) {
          for (const { start, end } of ranges) {
            await prisma.volunteerPreference.create({
              data: {
                userId: currentUserId,
                tenantId,
                weekday: day,
                startMinute: start,
                endMinute: end,
              },
            });
          }
        }
      }
      if (dto.unavailableDates !== undefined) {
        const seen = new Set<string>();
        const toCreate = dto.unavailableDates.filter((u) => {
          if (seen.has(u.date)) return false;
          seen.add(u.date);
          return true;
        });
        await prisma.staffUnavailableDate.deleteMany({
          where: { userId: currentUserId, tenantId },
        });
        for (const u of toCreate) {
          await prisma.staffUnavailableDate.create({
            data: {
              userId: currentUserId,
              tenantId,
              date: new Date(u.date),
              reason: u.reason ?? null,
            },
          });
        }
      }
      if (dto.preferredGroupIds !== undefined) {
        const groups = await prisma.group.findMany({
          where: { id: { in: dto.preferredGroupIds }, tenantId },
          select: { id: true },
        });
        const validIds = new Set(groups.map((g) => g.id));
        const invalid = dto.preferredGroupIds.filter((id) => !validIds.has(id));
        if (invalid.length > 0) {
          throw new BadRequestException(
            `Invalid group IDs for this site: ${invalid.join(", ")}`,
          );
        }
        await prisma.staffPreferredGroup.deleteMany({
          where: { userId: currentUserId, tenantId },
        });
        for (const groupId of dto.preferredGroupIds) {
          await prisma.staffPreferredGroup.create({
            data: { userId: currentUserId, tenantId, groupId },
          });
        }
      }
    } else {
      const blocked = [
        "weeklyAvailability",
        "unavailableDates",
        "preferredGroupIds",
      ] as const;
      for (const f of blocked) {
        if (dto[f] !== undefined) {
          throw new BadRequestException(
            "Availability and preferences require Starter plan or above. Upgrade to edit.",
          );
        }
      }
    }

    return this.getById(currentUserId, tenantId, orgId);
  }

  private async isOrgAdmin(userId: string, orgId: string): Promise<boolean> {
    const [membership, orgRole] = await Promise.all([
      prisma.orgMembership.findFirst({
        where: { userId, orgId, role: OrgRole.ORG_ADMIN },
        select: { id: true },
      }),
      prisma.userOrgRole.findFirst({
        where: { userId, orgId, role: OrgRole.ORG_ADMIN },
        select: { id: true },
      }),
    ]);
    return membership !== null || orgRole !== null;
  }

  private async resolvePlanTier(orgId: string): Promise<boolean> {
    const org = await prisma.org.findUnique({
      where: { id: orgId },
      select: { isMasterOrg: true },
    });
    if (org?.isMasterOrg) return true;
    return true;
  }

  async update(
    userId: string,
    tenantId: string,
    orgId: string,
    dto: UpdateStaffDto,
    callerUserId: string,
  ): Promise<ReturnType<StaffService["getById"]>> {
    await assertStaffInTenant(userId, tenantId);

    const canEditAvailability = await this.resolvePlanTier(orgId);
    const isCallerOrgAdmin = await this.isOrgAdmin(callerUserId, orgId);
    if (!canEditAvailability) {
      const availabilityFields: (keyof UpdateStaffDto)[] = [
        "weeklyAvailability",
        "unavailableDates",
        "preferredGroupIds",
      ];
      const hasBlockedField = availabilityFields.some(
        (f) => dto[f as keyof UpdateStaffDto] !== undefined,
      );
      if (hasBlockedField) {
        throw new BadRequestException(
          "Availability and preferences require Starter plan or above. Upgrade to edit.",
        );
      }
    }

    const userData: Record<string, unknown> = {};
    if (dto.firstName !== undefined) userData.firstName = dto.firstName;
    if (dto.lastName !== undefined) userData.lastName = dto.lastName;
    if (dto.dateOfBirth !== undefined) {
      userData.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    }
    if (dto.isActive !== undefined) userData.isActive = dto.isActive;
    if (dto.hasServeAccess !== undefined && isCallerOrgAdmin) {
      userData.hasServeAccess = dto.hasServeAccess;
    }
    if (Object.keys(userData).length > 0) {
      await prisma.user.update({
        where: { id: userId },
        data: userData as never,
      });
    }

    if (dto.role !== undefined) {
      if (!isCallerOrgAdmin) {
        throw new ForbiddenException(
          "Only an Organisation admin can change a staff member's site role",
        );
      }
      await prisma.siteMembership.upsert({
        where: { tenantId_userId: { tenantId, userId } },
        create: { tenantId, userId, role: dto.role },
        update: { role: dto.role },
      });
    }

    if (canEditAvailability && dto.weeklyAvailability !== undefined) {
      const rangesByDay = new Map<Weekday, { start: number; end: number }[]>();
      for (const item of dto.weeklyAvailability) {
        const start = minuteFromTime(item.startTime);
        const end = minuteFromTime(item.endTime);
        if (start >= end) {
          throw new BadRequestException(
            `Invalid range for ${item.day}: start must be before end`,
          );
        }
        const existing = rangesByDay.get(item.day) ?? [];
        const overlaps = existing.some((r) => start < r.end && end > r.start);
        if (overlaps) {
          throw new BadRequestException(
            `Overlapping time ranges for ${item.day}`,
          );
        }
        existing.push({ start, end });
        rangesByDay.set(item.day, existing);
      }

      await prisma.volunteerPreference.deleteMany({
        where: { userId, tenantId },
      });
      for (const [day, ranges] of rangesByDay) {
        for (const { start, end } of ranges) {
          await prisma.volunteerPreference.create({
            data: {
              userId,
              tenantId,
              weekday: day,
              startMinute: start,
              endMinute: end,
            },
          });
        }
      }
    }

    if (canEditAvailability && dto.unavailableDates !== undefined) {
      const seen = new Set<string>();
      const toCreate = dto.unavailableDates.filter((u) => {
        if (seen.has(u.date)) return false;
        seen.add(u.date);
        return true;
      });
      await prisma.staffUnavailableDate.deleteMany({
        where: { userId, tenantId },
      });
      for (const u of toCreate) {
        await prisma.staffUnavailableDate.create({
          data: {
            userId,
            tenantId,
            date: new Date(u.date),
            reason: u.reason ?? null,
          },
        });
      }
    }

    if (canEditAvailability && dto.preferredGroupIds !== undefined) {
      const groups = await prisma.group.findMany({
        where: { id: { in: dto.preferredGroupIds }, tenantId },
        select: { id: true },
      });
      const validIds = new Set(groups.map((g) => g.id));
      const invalid = dto.preferredGroupIds.filter((id) => !validIds.has(id));
      if (invalid.length > 0) {
        throw new BadRequestException(
          `Invalid group IDs for this site: ${invalid.join(", ")}`,
        );
      }
      await prisma.staffPreferredGroup.deleteMany({
        where: { userId, tenantId },
      });
      for (const groupId of dto.preferredGroupIds) {
        await prisma.staffPreferredGroup.create({
          data: { userId, tenantId, groupId },
        });
      }
    }

    return this.getById(userId, tenantId, orgId);
  }
}
