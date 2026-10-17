import type { Prisma } from "@pathway/db";
import {
  INSTITUTIONAL_VERTICALS,
  institutionalSector,
  isAceVertical,
  type TrackerProfileInput,
  type TrackerChecklist,
} from "@pathway/types";

type OrganisationFacts = NonNullable<TrackerChecklist["organisationFacts"]>;

export async function trackerOrganisationFacts(
  tx: Prisma.TransactionClient,
  orgId: string,
): Promise<OrganisationFacts> {
  const org = await tx.org.findUniqueOrThrow({
    where: { id: orgId },
    select: {
      sector: true,
      orgVertical: { select: { vertical: true } },
    },
  });
  const selected = org.orgVertical?.vertical;
  const vertical =
    INSTITUTIONAL_VERTICALS.find((value) => value === selected) ?? null;
  return {
    sector: org.sector ?? (vertical ? institutionalSector(vertical) : null),
    vertical,
    ace: isAceVertical(vertical) ? true : null,
  };
}

export function applyOrganisationFacts(
  profile: TrackerProfileInput,
  facts: OrganisationFacts,
): TrackerProfileInput {
  return {
    ...profile,
    sector: facts.sector ?? profile.sector,
    vertical: facts.vertical ?? profile.vertical,
    ace: facts.ace ?? profile.ace,
  };
}
