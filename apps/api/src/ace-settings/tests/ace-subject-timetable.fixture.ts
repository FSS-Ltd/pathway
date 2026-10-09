import { randomUUID } from "node:crypto";
import { Prisma } from "@pathway/db";

const yearStartsOn = new Date("2044-09-01T00:00:00.000Z");
const yearEndsOn = new Date("2045-08-31T00:00:00.000Z");
const periodStartsOn = new Date("2044-09-01T00:00:00.000Z");
const periodEndsOn = new Date("2044-12-20T00:00:00.000Z");

export async function createSubjectTimetableFixture(
  tx: Prisma.TransactionClient,
  siteId: string,
) {
  const actorId = randomUUID();
  const childId = randomUUID();
  const yearId = randomUUID();
  const periodId = randomUUID();
  const bandId = randomUUID();
  const subjectId = randomUUID();

  await tx.user.create({
    data: { id: actorId, email: `${actorId}@example.test`, tenantId: siteId },
  });
  await tx.siteMembership.create({
    data: { tenantId: siteId, userId: actorId },
  });
  await tx.child.create({
    data: {
      id: childId,
      tenantId: siteId,
      firstName: "Timetable",
      lastName: "Child",
    },
  });
  await tx.academicYear.create({
    data: {
      id: yearId,
      tenantId: siteId,
      name: `Timetable ${yearId}`,
      startsOn: yearStartsOn,
      endsOn: yearEndsOn,
      status: "ARCHIVED",
    },
  });
  await tx.academicPeriod.create({
    data: {
      id: periodId,
      tenantId: siteId,
      academicYearId: yearId,
      name: "Autumn",
      startsOn: periodStartsOn,
      endsOn: periodEndsOn,
      status: "ARCHIVED",
    },
  });
  await tx.aceYearBand.create({
    data: { id: bandId, tenantId: siteId, name: `Timetable ${bandId}` },
  });
  await tx.aceSchoolEnrollment.create({
    data: {
      tenantId: siteId,
      childId,
      academicYearId: yearId,
      yearBandId: bandId,
      startsOn: periodStartsOn,
    },
  });
  await tx.subject.create({
    data: { id: subjectId, tenantId: siteId, name: `Timetable ${subjectId}` },
  });

  const schedule = await tx.aceTimetableSchedule.create({
    data: {
      tenantId: siteId,
      academicPeriodId: periodId,
      yearBandId: bandId,
      teachingDays: ["TUESDAY"],
      updatedByUserId: actorId,
    },
  });
  const slot = await tx.aceTimetableSlot.create({
    data: {
      tenantId: siteId,
      scheduleId: schedule.id,
      position: 0,
      kind: "LESSON",
      label: "Morning",
      startMinutes: 540,
      endMinutes: 600,
    },
  });
  const draft = await tx.aceStudentTimetableDraft.create({
    data: {
      tenantId: siteId,
      childId,
      academicPeriodId: periodId,
      scheduleId: schedule.id,
      updatedByUserId: actorId,
    },
  });
  const entry = await tx.aceStudentTimetableEntry.create({
    data: {
      tenantId: siteId,
      draftId: draft.id,
      scheduleId: schedule.id,
      day: "TUESDAY",
      slotId: slot.id,
      subjectId,
    },
  });
  const publication = await tx.aceStudentTimetablePublication.create({
    data: {
      tenantId: siteId,
      draftId: draft.id,
      childId,
      academicPeriodId: periodId,
      periodName: "Autumn",
      periodStartsOn,
      periodEndsOn,
      yearBandName: "Year A",
      publishedByUserId: actorId,
    },
  });
  const publishedEntry = await tx.aceStudentTimetablePublicationEntry.create({
    data: {
      tenantId: siteId,
      publicationId: publication.id,
      day: "TUESDAY",
      slotPosition: 0,
      slotKind: "LESSON",
      slotLabel: "Morning",
      startMinutes: 540,
      endMinutes: 600,
      subjectId,
      subjectName: "Reading",
    },
  });
  await tx.aceStudentTimetablePublication.update({
    where: { id: publication.id },
    data: { publishedAt: new Date() },
  });
  return {
    actorId,
    yearId,
    childId,
    schedule,
    slot,
    draft,
    entry,
    publication,
    publishedEntry,
  };
}
