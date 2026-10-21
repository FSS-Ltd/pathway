import { createHash } from "node:crypto";
import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { z } from "zod";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import type { RespondToSlipInput } from "./dto/respond-to-slip.dto";
import { validConsentVersionIds } from "./permission-slip-consent-versions";
import { requireGuardianSlipChild } from "./permission-slip-family-access";
import { lockCurrentSlip } from "./permission-slip-response-access";
import type { TripSlipActor } from "./trip-slip-access";

export interface SlipRequestMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

function responseFingerprint(input: RespondToSlipInput): string {
  const answers = [...input.answers].sort((a, b) =>
    a.questionId.localeCompare(b.questionId),
  );
  return createHash("sha256")
    .update(
      JSON.stringify([
        input.decision,
        input.typedName,
        input.signatureAcknowledged,
        answers,
      ]),
    )
    .digest("hex");
}

const storedResponseSchema = z.object({ requestFingerprint: z.string() });

@Injectable()
export class PermissionSlipResponseService {
  async respond(
    slipId: string,
    input: RespondToSlipInput,
    actor: TripSlipActor,
    metadata: SlipRequestMetadata,
  ) {
    if (process.env.ACE_TRIP_SLIP_RESPONSE_ENABLED !== "true")
      throw new ServiceUnavailableException(
        "Online permission-slip responses are not enabled",
      );
    const now = new Date();
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const { version, snapshot } = await lockCurrentSlip(
        tx,
        slipId,
        actor,
        input.expectedVersionId,
        input.expectedVersionHash,
        now,
      );
      const relationship = await requireGuardianSlipChild(
        tx,
        actor,
        input.childId,
        now,
      );
      const recipient = await tx.permissionSlipRecipient.findFirst({
        where: {
          tenantId: actor.tenantId,
          permissionSlipVersionId: version.id,
          childId: input.childId,
        },
        select: { id: true },
      });
      if (!recipient) throw new NotFoundException("Permission slip not found");

      const validQuestions = new Set(
        snapshot.questions.map((question) => question.id),
      );
      if (
        input.answers.some((answer) => !validQuestions.has(answer.questionId))
      )
        throw new ConflictException("Permission-slip questions changed");
      if (
        input.decision === "ACCEPTED" &&
        snapshot.questions.some(
          (question) =>
            question.required &&
            !input.answers.some((answer) => answer.questionId === question.id),
        )
      )
        throw new ConflictException("Answer every required question");

      const fingerprint = responseFingerprint(input);
      const versions = await tx.permissionSlipVersion.findMany({
        where: {
          tenantId: actor.tenantId,
          permissionSlipId: slipId,
          publishedAt: { not: null },
        },
        orderBy: { version: "desc" },
        select: { id: true, requiresReconsent: true },
      });
      const validIds = validConsentVersionIds(versions);
      const [previous, existingException] = await Promise.all([
        tx.permissionSlipResponse.findFirst({
          where: {
            tenantId: actor.tenantId,
            permissionSlipVersionId: { in: validIds },
            guardianChildRelationshipId: relationship.relationshipId,
          },
          orderBy: { respondedAt: "desc" },
          select: {
            id: true,
            permissionSlipVersionId: true,
            decision: true,
            versionHash: true,
            respondedAt: true,
            idempotencyKey: true,
            responsePayload: true,
          },
        }),
        tx.permissionSlipException.findFirst({
          where: {
            tenantId: actor.tenantId,
            permissionSlipVersionId: { in: validIds },
            childId: input.childId,
          },
          select: { id: true },
        }),
      ]);
      if (existingException)
        throw new ConflictException("Permission slip already answered");
      if (previous) {
        let payload: z.infer<typeof storedResponseSchema> | null = null;
        try {
          payload = storedResponseSchema.parse(
            JSON.parse(previous.responsePayload),
          );
        } catch {
          throw new ConflictException("Permission slip already answered");
        }
        if (
          previous.permissionSlipVersionId !== version.id ||
          previous.idempotencyKey !== input.idempotencyKey ||
          payload.requestFingerprint !== fingerprint
        )
          throw new ConflictException("Permission slip already answered");
        return {
          id: previous.id,
          decision: previous.decision,
          versionHash: previous.versionHash,
          respondedAt: previous.respondedAt,
        };
      }

      const response = await tx.permissionSlipResponse.create({
        data: {
          tenantId: actor.tenantId,
          permissionSlipVersionId: version.id,
          permissionSlipRecipientId: recipient.id,
          childId: input.childId,
          guardianChildRelationshipId: relationship.relationshipId,
          guardianIdentityId: relationship.guardianIdentityId,
          versionHash: input.expectedVersionHash,
          decision: input.decision,
          responsePayload: JSON.stringify({
            schemaVersion: 1,
            typedName: input.typedName,
            signatureAcknowledged: input.signatureAcknowledged,
            answers: input.answers,
            requestFingerprint: fingerprint,
            ipAddress: metadata.ipAddress,
            userAgent: metadata.userAgent,
          }),
          idempotencyKey: input.idempotencyKey,
        },
        select: {
          id: true,
          decision: true,
          versionHash: true,
          respondedAt: true,
        },
      });
      await recordAuditEventInTransaction(tx, {
        actorUserId: actor.userId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        entityType: AuditEntityType.ACE_RECORD,
        entityId: response.id,
        action: AuditAction.CREATED,
        metadata: {
          kind: "permission_slip_response",
          slipId,
          versionId: version.id,
        },
      });
      return response;
    });
  }
}
