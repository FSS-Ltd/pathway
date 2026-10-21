import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import type { RecordPhysicalResponseInput } from "./dto/record-physical-response.dto";
import { lockCurrentSlip } from "./permission-slip-response-access";
import { requireTripSlipStaff, type TripSlipActor } from "./trip-slip-access";

@Injectable()
export class PermissionSlipExceptionService {
  async record(
    slipId: string,
    input: RecordPhysicalResponseInput,
    actor: TripSlipActor,
  ) {
    const now = new Date();
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireTripSlipStaff(tx, actor);
      if (input.witnessUserId === actor.userId)
        throw new ConflictException("A separate staff witness is required");
      await requireTripSlipStaff(tx, {
        ...actor,
        userId: input.witnessUserId,
      });
      const { version, today } = await lockCurrentSlip(
        tx,
        slipId,
        actor,
        input.expectedVersionId,
        input.expectedVersionHash,
        now,
      );
      const recipient = await tx.permissionSlipRecipient.findFirst({
        where: {
          tenantId: actor.tenantId,
          permissionSlipVersionId: version.id,
          childId: input.childId,
          child: { isGuest: false },
        },
        select: { id: true },
      });
      if (!recipient) throw new NotFoundException("Permission slip not found");
      const enrollment = await tx.aceSchoolEnrollment.findFirst({
        where: {
          tenantId: actor.tenantId,
          childId: input.childId,
          startsOn: { lte: today },
          OR: [{ endsOn: null }, { endsOn: { gte: today } }],
        },
        select: { id: true },
      });
      if (!enrollment) throw new NotFoundException("Permission slip not found");
      const [response, existingException] = await Promise.all([
        tx.permissionSlipResponse.findFirst({
          where: {
            tenantId: actor.tenantId,
            permissionSlipVersionId: version.id,
            permissionSlipRecipientId: recipient.id,
          },
          select: { id: true },
        }),
        tx.permissionSlipException.findFirst({
          where: {
            tenantId: actor.tenantId,
            permissionSlipVersionId: version.id,
            permissionSlipRecipientId: recipient.id,
          },
          select: { id: true },
        }),
      ]);
      if (response || existingException)
        throw new ConflictException("Permission slip already answered");
      const exception = await tx.permissionSlipException.create({
        data: {
          tenantId: actor.tenantId,
          permissionSlipVersionId: version.id,
          permissionSlipRecipientId: recipient.id,
          childId: input.childId,
          versionHash: input.expectedVersionHash,
          decision: input.decision,
          source: input.source,
          reason: input.reason,
          recordedByUserId: actor.userId,
          witnessUserId: input.witnessUserId,
        },
        select: {
          id: true,
          decision: true,
          source: true,
          versionHash: true,
          recordedAt: true,
        },
      });
      await recordAuditEventInTransaction(tx, {
        actorUserId: actor.userId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        entityType: AuditEntityType.ACE_RECORD,
        entityId: exception.id,
        action: AuditAction.CREATED,
        metadata: {
          kind: "permission_slip_exception",
          slipId,
          versionId: version.id,
          source: input.source,
        },
      });
      return exception;
    });
  }
}
