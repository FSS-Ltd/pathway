import type { Prisma } from "@pathway/db";
import { isAdult } from "./agreement-record";
export const adultUserSelect = (tenantId: string) =>
  ({
    id: true,
    name: true,
    displayName: true,
    firstName: true,
    lastName: true,
    dateOfBirth: true,
    studentIdentities: {
      where: { tenantId },
      select: {
        links: {
          where: {
            tenantId,
            linkedAt: { lte: new Date() },
            endedAt: null,
            revokedAt: null,
          },
          select: { child: { select: { dateOfBirth: true } } },
        },
      },
    },
  }) satisfies Prisma.UserSelect;
type AgeUser = Prisma.UserGetPayload<{
  select: ReturnType<typeof adultUserSelect>;
}>;
export function userAgeStatus(
  user: AgeUser,
): "KNOWN_ADULT" | "NEEDS_CONFIRMATION" | "MINOR" {
  const dates = [
    user.dateOfBirth,
    ...user.studentIdentities.flatMap((identity) =>
      identity.links.map((link) => link.child.dateOfBirth),
    ),
  ].filter((date): date is Date => date !== null);
  if (dates.some((date) => !isAdult(date))) return "MINOR";
  return dates.length ? "KNOWN_ADULT" : "NEEDS_CONFIRMATION";
}
