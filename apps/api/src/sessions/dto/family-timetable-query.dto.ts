import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

const querySchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
});

export interface FamilyTimetableRange {
  from: Date;
  to: Date;
}

export function parseFamilyTimetableRange(
  query: unknown,
): FamilyTimetableRange {
  const parsed = querySchema.safeParse(query);
  if (!parsed.success) throw new BadRequestException("Choose a valid week");
  const from = new Date(parsed.data.from);
  const to = new Date(parsed.data.to);
  const duration = to.getTime() - from.getTime();
  if (duration <= 0 || duration > 8 * 86_400_000) {
    throw new BadRequestException("Choose a period of up to eight days");
  }
  return { from, to };
}
