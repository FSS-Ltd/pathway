import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@pathway/db";
import type { TrackerJurisdiction } from "@pathway/types";
export const trackerJurisdictionSelect = {
  id: true,
  countryCode: true,
  subdivisionCode: true,
  name: true,
  level: true,
  parentJurisdictionId: true,
} satisfies Prisma.JurisdictionSelect;
/** Validate the complete chain: a country root cannot silently become England. */
export async function trackerLocation(
  tx: Prisma.TransactionClient,
  jurisdictionId: string | null,
): Promise<{
  countryCode: string | null;
  subdivisionCode: string | null;
  jurisdictionCodes: string[];
}> {
  if (jurisdictionId === null)
    return { countryCode: null, subdivisionCode: null, jurisdictionCodes: [] };
  let id: string | null = jurisdictionId;
  const chain: TrackerJurisdiction[] = [];
  const visited = new Set<string>();
  while (id !== null) {
    if (visited.has(id) || chain.length >= 8)
      throw new BadRequestException("Invalid jurisdiction hierarchy");
    visited.add(id);
    const row: TrackerJurisdiction | null = await tx.jurisdiction.findUnique({
      where: { id },
      select: trackerJurisdictionSelect,
    });
    if (!row) throw new BadRequestException("Choose an available jurisdiction");
    chain.push(row);
    id = row.parentJurisdictionId;
  }
  const root = chain[chain.length - 1];
  if (
    root.level !== "COUNTRY" ||
    chain.some((row) => row.countryCode !== root.countryCode) ||
    chain.slice(0, -1).some((row) => row.level === "COUNTRY")
  )
    throw new BadRequestException("Invalid jurisdiction hierarchy");
  const ranks: Record<string, number> = {
    COUNTRY: 0,
    NATION: 1,
    REGION: 2,
    LOCAL_AUTHORITY: 3,
  };
  if (
    chain.some(
      (row, index) =>
        index < chain.length - 1 &&
        ranks[row.level] <= ranks[chain[index + 1].level],
    )
  )
    throw new BadRequestException("Invalid jurisdiction hierarchy");
  const nation = chain.find((row) => row.level === "NATION");
  if (
    root.countryCode === "GB" &&
    nation &&
    !["GB-ENG", "GB-WLS", "GB-SCT", "GB-NIR"].includes(
      nation.subdivisionCode ?? "",
    )
  )
    throw new BadRequestException("Choose a recognised UK nation");
  return {
    jurisdictionCodes: chain.flatMap((row) =>
      row.level === "COUNTRY"
        ? [row.countryCode]
        : row.subdivisionCode
          ? [row.subdivisionCode]
          : [],
    ),
    countryCode: root.countryCode,
    subdivisionCode:
      root.countryCode === "GB"
        ? (nation?.subdivisionCode ?? null)
        : (chain.find((row) => row.subdivisionCode !== null)?.subdivisionCode ??
          null),
  };
}
