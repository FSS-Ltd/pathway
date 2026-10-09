import { NotFoundException } from "@nestjs/common";
import { prisma, type Prisma } from "@pathway/db";

export const SCHOOL_VOLUNTEER_CAPACITY = 2;

export function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function dateFromKey(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function todayAtSite(timezone: string | null): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export async function requireAceVolunteerSite(siteId: string) {
  const site = await prisma.tenant.findUnique({
    where: { id: siteId },
    select: {
      orgId: true,
      timezone: true,
      org: {
        select: {
          parentPortalEnabled: true,
          orgVertical: { select: { vertical: true } },
        },
      },
    },
  });
  if (site?.org.orgVertical?.vertical !== "ACE_SCHOOL") {
    throw new NotFoundException("School volunteering not found");
  }
  return site;
}

export async function requireVolunteerSite(siteId: string) {
  const site = await requireAceVolunteerSite(siteId);
  if (!site.org.parentPortalEnabled) {
    throw new NotFoundException("School volunteering not found");
  }
  return site;
}

export async function requireVolunteerGuardian(
  tx: Prisma.TransactionClient,
  siteId: string,
  userId: string,
): Promise<string> {
  const guardian = await tx.guardianIdentity.findFirst({
    where: {
      tenantId: siteId,
      userId,
      user: { isActive: true },
      relationships: {
        some: {
          tenantId: siteId,
          legalAccess: "FULL",
          startsAt: { lte: new Date() },
          endedAt: null,
          revokedAt: null,
          child: { tenantId: siteId, isGuest: false },
        },
      },
    },
    select: { id: true },
  });
  if (!guardian) throw new NotFoundException("School volunteering not found");
  return guardian.id;
}

export async function setVolunteerActor(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
}

export async function occupiedVolunteerSlots(
  tx: Prisma.TransactionClient,
  siteId: string,
  periodId: string,
): Promise<Map<string, Set<number>>> {
  const rows = await tx.$queryRaw<Array<{ date: Date; slot: number }>>`
    SELECT "date", "slot"
    FROM app.ace_school_volunteer_occupied_slots(${siteId}, ${periodId})
  `;
  const occupied = new Map<string, Set<number>>();
  for (const row of rows) {
    const key = dateKey(row.date);
    const slots = occupied.get(key) ?? new Set<number>();
    slots.add(row.slot);
    occupied.set(key, slots);
  }
  return occupied;
}
