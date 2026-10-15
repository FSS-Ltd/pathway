import { NotFoundException } from "@nestjs/common";
import type { Prisma } from "@pathway/db";
import type { AgreementDocument } from "@pathway/types";
import type { ComplianceActor } from "./compliance.service";
import { agreementScope } from "./agreement-access";
import { assignmentInclude, serializeVersion } from "./agreement-record";
export async function findAgreementVersion(
  tx: Prisma.TransactionClient,
  actor: ComplianceActor,
  id: string,
) {
  const row = await tx.complianceAgreementVersion.findFirst({
    where: { id, ...agreementScope(actor) },
    include: { document: true },
  });
  if (!row) throw new NotFoundException("Agreement version not found");
  return row;
}
export async function findAgreementAssignment(
  tx: Prisma.TransactionClient,
  actor: ComplianceActor,
  id: string,
  own: boolean,
) {
  const row = await tx.complianceAgreementAssignment.findFirst({
    where: {
      id,
      ...agreementScope(actor),
      ...(own ? { recipientUserId: actor.userId } : {}),
    },
    include: assignmentInclude,
  });
  if (!row) throw new NotFoundException("Agreement assignment not found");
  return row;
}
export async function findAgreementDocument(
  tx: Prisma.TransactionClient,
  actor: ComplianceActor,
  id: string,
): Promise<AgreementDocument> {
  const row = await tx.complianceAgreementDocument.findFirst({
    where: { id, ...agreementScope(actor) },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!row || !row.versions[0])
    throw new NotFoundException("Agreement document not found");
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    latestVersion: serializeVersion(row.versions[0]),
  };
}
