import { createHash, randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma, withTenantRlsContext } from "@pathway/db";
import request from "supertest";
import { requireDatabase, seedE2eAuthUser } from "../../../test-helpers.e2e";
import { AppModule } from "../../app.module";
import { SupabaseStorageService } from "../../common/storage/supabase-storage.service";
import { HomeworkMalwareScanner } from "../../storage/homework-malware-scanner";

const orgId = randomUUID();
const siteId = randomUUID();
const otherSiteId = randomUUID();
const childId = randomUUID();
const otherChildId = randomUUID();
const studentId = randomUUID();
const otherStudentId = randomUUID();
const assignmentId = randomUUID();
const embargoId = randomUUID();
const lateId = randomUUID();
const academicYearId = randomUUID();
const yearBandId = randomUUID();
const subjectId = randomUUID();
const enrollmentId = randomUUID();
const otherEnrollmentId = randomUUID();
const authorId = randomUUID();
const day = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
const route = (id = assignmentId, site = siteId) =>
  `/ace/student/sites/${site}/homework/${id}`;
const pdf = Buffer.from("%PDF-1.7\nstudent work");

describe("ACE homework student submissions", () => {
  let app: INestApplication | undefined;
  let studentAuth = "";
  let otherAuth = "";
  let signedBody = pdf;
  let scanClean = true;
  const uploadedFinalKeys: string[] = [];
  const previousFlag = process.env.ACE_HOMEWORK_SUBMISSIONS_ENABLED;
  const storage = {
    isConfigured: () => true,
    privateBucketName: () => "test-private",
    createSignedUploadUrl: async () => "https://storage.test/signed-upload",
    downloadObject: async () => signedBody,
    uploadObject: async (input: { key: string }) => {
      uploadedFinalKeys.push(input.key);
      return { bucket: "test-private", key: input.key };
    },
  };
  const scanner = {
    isConfigured: () => true,
    scan: async () => scanClean,
  };

  async function markReturned(id: string) {
    await withTenantRlsContext(siteId, orgId, async (tx) => {
      const recipient = await tx.aceHomeworkRecipient.findFirstOrThrow({
        where: { tenantId: siteId, assignmentId: id, childId },
        select: { id: true },
      });
      await tx.aceHomeworkSubmission.update({
        where: {
          recipientId_tenantId: { recipientId: recipient.id, tenantId: siteId },
        },
        data: { status: "RETURNED" },
      });
    });
  }

  beforeAll(async () => {
    if (!requireDatabase()) return;
    process.env.ACE_HOMEWORK_SUBMISSIONS_ENABLED = "true";
    await prisma.org.create({
      data: {
        id: orgId,
        name: `Homework submissions ${orgId}`,
        slug: `homework-submissions-${orgId}`,
        planCode: "trial",
      },
    });
    await prisma.orgVertical.create({
      data: { orgId, vertical: "ACE_SCHOOL" },
    });
    await prisma.tenant.createMany({
      data: [siteId, otherSiteId].map((id) => ({
        id,
        orgId,
        name: `Homework site ${id}`,
        slug: `homework-submissions-${id}`,
        timezone: "Europe/London",
      })),
    });
    studentAuth = (
      await seedE2eAuthUser({
        subject: `homework-student-${studentId}`,
        userId: studentId,
        tenantId: siteId,
      })
    ).authorization;
    otherAuth = (
      await seedE2eAuthUser({
        subject: `homework-other-${otherStudentId}`,
        userId: otherStudentId,
        tenantId: siteId,
      })
    ).authorization;
    await seedE2eAuthUser({
      subject: `homework-author-${authorId}`,
      userId: authorId,
      tenantId: siteId,
      siteRole: "SITE_ADMIN",
      orgId,
    });
    await withTenantRlsContext(siteId, orgId, async (tx) => {
      await tx.academicYear.create({
        data: {
          id: academicYearId,
          tenantId: siteId,
          name: "Homework year",
          startsOn: new Date(day.getTime() - 90 * 86_400_000),
          endsOn: new Date(day.getTime() + 90 * 86_400_000),
          status: "ACTIVE",
        },
      });
      await tx.aceYearBand.create({
        data: { id: yearBandId, tenantId: siteId, name: "Year 5" },
      });
      await tx.subject.create({
        data: { id: subjectId, tenantId: siteId, name: "English" },
      });
      await tx.child.createMany({
        data: [
          { id: childId, firstName: "Sam", lastName: "Student" },
          { id: otherChildId, firstName: "Other", lastName: "Student" },
        ].map((child) => ({ ...child, tenantId: siteId })),
      });
      await tx.aceSchoolEnrollment.createMany({
        data: [
          { id: enrollmentId, childId },
          { id: otherEnrollmentId, childId: otherChildId },
        ].map((entry) => ({
          ...entry,
          tenantId: siteId,
          academicYearId,
          yearBandId,
          startsOn: new Date(day.getTime() - 30 * 86_400_000),
        })),
      });
      await tx.studentPortalPolicy.create({
        data: { tenantId: siteId, studentPortalEnabled: true },
      });
      for (const [userId, id] of [
        [studentId, childId],
        [otherStudentId, otherChildId],
      ]) {
        const identity = await tx.studentIdentity.create({
          data: { tenantId: siteId, userId },
        });
        await tx.studentIdentityLink.create({
          data: {
            tenantId: siteId,
            studentIdentityId: identity.id,
            childId: id,
          },
        });
      }
      for (const [id, dueAt] of [
        [assignmentId, new Date(day.getTime() + 7 * 86_400_000)],
        [embargoId, new Date(day.getTime() + 7 * 86_400_000)],
        [lateId, new Date(day.getTime() - 86_400_000)],
      ] as const) {
        await tx.aceHomeworkAssignment.create({
          data: {
            id,
            tenantId: siteId,
            academicYearId,
            yearBandId,
            subjectId,
            createdByUserId: authorId,
            title: `Assignment ${id}`,
            instructions: "Write a short answer.",
            dueAt,
          },
        });
        await tx.aceHomeworkRecipient.create({
          data: {
            tenantId: siteId,
            assignmentId: id,
            childId,
            enrollmentId,
          },
        });
        if (id !== embargoId) {
          await tx.aceHomeworkAssignment.update({
            where: { id_tenantId: { id, tenantId: siteId } },
            data: {
              status: "PUBLISHED",
              publishedAt: new Date(day.getTime() - 86_400_000),
            },
          });
        }
      }
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SupabaseStorageService)
      .useValue(storage)
      .overrideProvider(HomeworkMalwareScanner)
      .useValue(scanner)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (previousFlag === undefined)
      delete process.env.ACE_HOMEWORK_SUBMISSIONS_ENABLED;
    else process.env.ACE_HOMEWORK_SUBMISSIONS_ENABLED = previousFlag;
  });

  it("lists only released homework for the linked child", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const result = await request(server)
      .get(`/ace/student/sites/${siteId}/homework`)
      .set("Authorization", studentAuth);
    expect(result.status).toBe(200);
    expect(result.body.assignments).toHaveLength(2);
    expect(
      result.body.assignments.map((item: { id: string }) => item.id),
    ).not.toContain(embargoId);
    expect(
      (
        await request(server)
          .get(`/ace/student/sites/${otherSiteId}/homework`)
          .set("Authorization", studentAuth)
      ).status,
    ).toBe(404);
  });

  it("denies another student, an unreleased assignment and anonymous writes", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    expect(
      (
        await request(server)
          .patch(`${route()}/draft`)
          .set("Authorization", otherAuth)
          .send({ text: "No" })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(server)
          .patch(`${route(embargoId)}/draft`)
          .set("Authorization", studentAuth)
          .send({ text: "No" })
      ).status,
    ).toBe(404);
    expect(
      (await request(server).patch(`${route()}/draft`).send({ text: "No" }))
        .status,
    ).toBe(401);
  });

  it("keeps submitted versions immutable and retries idempotent", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    expect(
      (
        await request(server)
          .patch(`${route()}/draft`)
          .set("Authorization", studentAuth)
          .send({ text: "Draft" })
      ).status,
    ).toBe(200);
    const body = { text: "Final answer", idempotencyKey: randomUUID() };
    const first = await request(server)
      .post(`${route()}/submit`)
      .set("Authorization", studentAuth)
      .send(body);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ number: 1, late: false });
    const retry = await request(server)
      .post(`${route()}/submit`)
      .set("Authorization", studentAuth)
      .send(body);
    expect(retry.status).toBe(200);
    expect(retry.body.id).toBe(first.body.id);
    const conflictingRetry = await request(server)
      .post(`${route()}/submit`)
      .set("Authorization", studentAuth)
      .send({ ...body, text: "Different work" });
    expect(conflictingRetry.status).toBe(409);
    expect(
      (
        await request(server)
          .patch(`${route()}/draft`)
          .set("Authorization", studentAuth)
          .send({ text: "Changed" })
      ).status,
    ).toBe(409);
    await markReturned(assignmentId);
    expect(
      (
        await request(server)
          .patch(`${route()}/draft`)
          .set("Authorization", studentAuth)
          .send({ text: "Revision" })
      ).status,
    ).toBe(200);
    const resubmitted = await request(server)
      .post(`${route()}/submit`)
      .set("Authorization", studentAuth)
      .send({ text: "Revision", idempotencyKey: randomUUID() });
    expect(resubmitted.status).toBe(200);
    expect(resubmitted.body.number).toBe(2);
    const versions = await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.aceHomeworkSubmissionVersion.findMany({
        where: {
          tenantId: siteId,
          submission: { recipient: { assignmentId } },
        },
        orderBy: { number: "asc" },
      }),
    );
    expect(versions.map((version) => version.text)).toEqual([
      "Final answer",
      "Revision",
    ]);
  });

  it("marks work sent after the due time", async () => {
    if (!app) return;
    const result = await request(app.getHttpServer())
      .post(`${route(lateId)}/submit`)
      .set("Authorization", studentAuth)
      .send({ text: "Late answer", idempotencyKey: randomUUID() });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ number: 1, late: true });
  });

  it("rejects unsafe intent metadata and never attaches unscanned bytes", async () => {
    if (!app) return;
    await markReturned(lateId);
    const server = app.getHttpServer();
    const valid = {
      fileName: "answer.pdf",
      mimeType: "application/pdf",
      byteLength: pdf.length,
      sha256: createHash("sha256").update(pdf).digest("hex"),
    };
    for (const changed of [
      { fileName: "../private.pdf" },
      { mimeType: "text/html" },
      { byteLength: 2 * 1024 * 1024 + 1 },
    ]) {
      const denied = await request(server)
        .post(`${route(lateId)}/evidence-intents`)
        .set("Authorization", studentAuth)
        .send({ ...valid, ...changed });
      expect(denied.status).toBe(400);
    }
    const issued = await request(server)
      .post(`${route(lateId)}/evidence-intents`)
      .set("Authorization", studentAuth)
      .send(valid);
    expect(issued.status).toBe(201);
    expect(issued.body.uploadUrl).toContain("storage.test");
    const pendingSubmit = await request(server)
      .post(`${route(lateId)}/submit`)
      .set("Authorization", studentAuth)
      .send({
        text: "",
        evidenceId: issued.body.id,
        idempotencyKey: randomUUID(),
      });
    expect(pendingSubmit.status).toBe(404);
    signedBody = Buffer.from("<html>not a PDF</html>");
    const rejected = await request(server)
      .post(`${route(lateId)}/evidence-intents/${issued.body.id}/complete`)
      .set("Authorization", studentAuth);
    expect(rejected.status).toBe(400);
    signedBody = pdf;
    scanClean = false;
    const second = await request(server)
      .post(`${route(lateId)}/evidence-intents`)
      .set("Authorization", studentAuth)
      .send(valid);
    const scanResult = await request(server)
      .post(`${route(lateId)}/evidence-intents/${second.body.id}/complete`)
      .set("Authorization", studentAuth);
    expect(scanResult.status).toBe(200);
    expect(scanResult.body.status).toBe("REJECTED");
    scanClean = true;
  });

  it("promotes clean evidence away from the signed upload key", async () => {
    if (!app) return;
    const valid = {
      fileName: "answer.pdf",
      mimeType: "application/pdf",
      byteLength: pdf.length,
      sha256: createHash("sha256").update(pdf).digest("hex"),
    };
    const server = app.getHttpServer();
    const issued = await request(server)
      .post(`${route(lateId)}/evidence-intents`)
      .set("Authorization", studentAuth)
      .send(valid);
    expect(issued.status).toBe(201);
    const result = await request(server)
      .post(`${route(lateId)}/evidence-intents/${issued.body.id}/complete`)
      .set("Authorization", studentAuth);
    expect(result.status).toBe(200);
    expect(result.body.status).toBe("CLEAN");
    expect(uploadedFinalKeys.at(-1)).toContain("/clean.pdf");
    const evidence = await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.aceHomeworkEvidence.findUniqueOrThrow({
        where: { id: issued.body.id },
      }),
    );
    expect(evidence.objectKey).toContain("/clean.pdf");
    const submitted = await request(server)
      .post(`${route(lateId)}/submit`)
      .set("Authorization", studentAuth)
      .send({
        text: "",
        evidenceId: issued.body.id,
        idempotencyKey: randomUUID(),
      });
    expect(submitted.status).toBe(200);
    expect(submitted.body.number).toBe(2);
  });

  it("enforces tenant RLS for submissions, versions and evidence", async () => {
    if (!app || process.env.E2E_USE_GLOBAL_SETUP !== "true") return;
    const counts = async (tenantId: string) =>
      withTenantRlsContext(tenantId, orgId, async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL ROLE "pathway_e2e_tenant_rls"');
        return tx.$queryRaw<
          Array<{ submissions: bigint; versions: bigint; evidence: bigint }>
        >`
          SELECT
            (SELECT count(*) FROM "AceHomeworkSubmission") AS submissions,
            (SELECT count(*) FROM "AceHomeworkSubmissionVersion") AS versions,
            (SELECT count(*) FROM "AceHomeworkEvidence") AS evidence
        `;
      });
    const own = await counts(siteId);
    const other = await counts(otherSiteId);
    expect(own[0].submissions).toBeGreaterThan(0n);
    expect(own[0].versions).toBeGreaterThan(0n);
    expect(own[0].evidence).toBeGreaterThan(0n);
    expect(other).toEqual([{ submissions: 0n, versions: 0n, evidence: 0n }]);
  });
});
