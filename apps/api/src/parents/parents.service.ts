import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { prisma, withTenantRlsContext } from "@pathway/db";
import type {
  ParentChildSummaryDto,
  ParentDetailDto,
  ParentSummaryDto,
} from "./dto/parents.dto";
import type { UpdateParentDto } from "./dto/update-parent.dto";

const listSelect = (tenantId: string) =>
  ({
    id: true,
    name: true,
    email: true,
    hasFamilyAccess: true,
    children: {
      where: { tenantId },
      select: { id: true },
    },
  }) as const;

const detailSelect = (
  tenantId: string,
  parentId: string,
  approvedOnly: boolean,
) =>
  ({
    id: true,
    name: true,
    email: true,
    hasFamilyAccess: true,
    children: {
      where: {
        tenantId,
        ...(approvedOnly
          ? {
              guardianChildRelationships: {
                some: {
                  tenantId,
                  legalAccess: "FULL" as const,
                  startsAt: { lte: new Date() },
                  endedAt: null,
                  revokedAt: null,
                  guardianIdentity: { userId: parentId },
                },
              },
            }
          : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    },
  }) as const;

@Injectable()
export class ParentsService {
  async findAllForTenant(
    tenantId: string,
    orgId: string,
  ): Promise<ParentSummaryDto[]> {
    void orgId; // reserved for future org/org-role scoping
    // Include users who have children in this tenant (multi-tenant) OR legacy tenantId match
    const parents = await prisma.user.findMany({
      where: {
        hasFamilyAccess: true,
        OR: [{ tenantId }, { children: { some: { tenantId } } }],
      },
      select: listSelect(tenantId),
      orderBy: [{ name: "asc" }, { email: "asc" }],
    });

    return parents.map((parent) => ({
      id: parent.id,
      fullName: parent.name ?? "",
      email: parent.email ?? null,
      childrenCount: parent.children.length,
    }));
  }

  async findOneForTenant(
    tenantId: string,
    orgId: string,
    parentId: string,
    approvedOnly = false,
  ): Promise<ParentDetailDto | null> {
    void orgId; // reserved for future org/org-role scoping
    const parent = await prisma.user.findFirst({
      where: {
        id: parentId,
        hasFamilyAccess: true,
        OR: [{ tenantId }, { children: { some: { tenantId } } }],
      },
      select: detailSelect(tenantId, parentId, approvedOnly),
    });

    if (!parent) return null;

    const children: ParentChildSummaryDto[] = parent.children.map((child) => ({
      id: child.id,
      fullName: [child.firstName, child.lastName]
        .filter(Boolean)
        .join(" ")
        .trim(),
    }));

    return {
      id: parent.id,
      fullName: parent.name ?? "",
      email: parent.email ?? null,
      children,
    };
  }

  /**
   * Update parent profile (display name) and linked children.
   * Idempotent: re-linking same children does not duplicate rows.
   */
  async updateForTenant(
    tenantId: string,
    orgId: string,
    parentId: string,
    input: UpdateParentDto,
    approvedOnly = false,
  ): Promise<ParentDetailDto> {
    const parent = await prisma.user.findFirst({
      where: {
        id: parentId,
        hasFamilyAccess: true,
        OR: [{ tenantId }, { children: { some: { tenantId } } }],
      },
      select: {
        id: true,
        children: {
          where: { tenantId },
          select: { id: true },
        },
      },
    });
    if (!parent) throw new NotFoundException("Parent not found");

    if (input.childIds !== undefined) {
      const requestedChildIds = input.childIds;
      const removedChildIds = parent.children
        .filter((child) => !requestedChildIds.includes(child.id))
        .map((child) => child.id);
      if (removedChildIds.length > 0) {
        const approvedRelationship = await withTenantRlsContext(
          tenantId,
          orgId,
          (tx) =>
            tx.guardianChildRelationship.findFirst({
              where: {
                tenantId,
                childId: { in: removedChildIds },
                guardianIdentity: { userId: parentId },
                legalAccess: "FULL",
                startsAt: { lte: new Date() },
                endedAt: null,
                revokedAt: null,
              },
              select: { id: true },
            }),
        );
        if (approvedRelationship) {
          throw new ConflictException(
            "Revoke guardian access before unlinking an approved child",
          );
        }
      }
      if (requestedChildIds.length > 0) {
        const children = await prisma.child.findMany({
          where: { id: { in: requestedChildIds }, tenantId },
          select: { id: true },
        });
        if (children.length !== new Set(requestedChildIds).size) {
          throw new BadRequestException(
            "one or more children not found or not in tenant",
          );
        }
      }
      await prisma.user.update({
        where: { id: parentId },
        data: {
          children: {
            disconnect: removedChildIds.map((id) => ({ id })),
            connect: requestedChildIds.map((id) => ({ id })),
          },
        },
      });
    }

    if (input.displayName !== undefined) {
      const safeName =
        input.displayName.trim() && !input.displayName.includes("@")
          ? input.displayName.trim()
          : null;
      await prisma.user.update({
        where: { id: parentId },
        data: {
          name: safeName,
          displayName: safeName,
        },
      });
    }

    const updated = await this.findOneForTenant(
      tenantId,
      orgId,
      parentId,
      approvedOnly,
    );
    if (!updated) throw new NotFoundException("Parent not found");
    return updated;
  }
}
