import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const enrolmentPeriodSchema = z.object({
  admittedOn: isoDate,
  leftOn: isoDate.nullable(),
});
export type EnrolmentPeriod = z.infer<typeof enrolmentPeriodSchema>;

export function assertDate(value: string): string {
  if (!isoDate.safeParse(value).success) {
    throw new BadRequestException("Date must use YYYY-MM-DD.");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException("Invalid calendar date.");
  }
  return value;
}

export function validatePeriods(value: unknown): EnrolmentPeriod[] {
  const parsed = z.array(enrolmentPeriodSchema).safeParse(value);
  if (!parsed.success)
    throw new BadRequestException("Invalid enrolment periods.");
  const periods = parsed.data;
  for (let index = 0; index < periods.length; index += 1) {
    const period = periods[index];
    assertDate(period.admittedOn);
    if (period.leftOn !== null) {
      assertDate(period.leftOn);
      if (period.leftOn <= period.admittedOn) {
        throw new BadRequestException("Leaving date must follow admission.");
      }
    }
    const previous = periods[index - 1];
    if (
      previous &&
      (previous.leftOn === null || previous.leftOn > period.admittedOn)
    ) {
      throw new BadRequestException(
        "Enrolment periods overlap or are out of order.",
      );
    }
  }
  return periods;
}

export function admitChild(
  periods: EnrolmentPeriod[],
  admittedOn: string,
): EnrolmentPeriod[] {
  assertDate(admittedOn);
  const last = periods.at(-1);
  if (last && (last.leftOn === null || admittedOn < last.leftOn)) {
    throw new BadRequestException(
      "Child is already enrolled or admission predates leaving.",
    );
  }
  return [...periods, { admittedOn, leftOn: null }];
}

export function leaveChild(
  periods: EnrolmentPeriod[],
  leftOn: string,
): EnrolmentPeriod[] {
  assertDate(leftOn);
  const last = periods.at(-1);
  if (!last || last.leftOn !== null || leftOn <= last.admittedOn) {
    throw new BadRequestException("No active enrolment can end on that date.");
  }
  return [...periods.slice(0, -1), { ...last, leftOn }];
}

export function isEnrolledOn(
  periods: EnrolmentPeriod[],
  effectiveOn: string,
): boolean {
  return periods.some(
    (period) =>
      period.admittedOn <= effectiveOn &&
      (period.leftOn === null || effectiveOn < period.leftOn),
  );
}
