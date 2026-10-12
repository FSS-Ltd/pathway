import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { prisma } from "@pathway/db";
import type {
  ParentChildSummaryDto,
  ParentDetailDto,
  ParentSummaryDto,
} from "./dto/parents.dto";
import type { UpdateParentDto } from "./dto/update-parent.dto";

const listSelect = {
  id: true,
  name: true,
  email: true,
  hasFamilyAccess: true,
  children: {
    select: { id: true },
  },
} as const;

const detailSelect = {
  id: true,
  name: true,
  email: true,
  hasFamilyAccess: true,
  children: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  },
} as const;

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
        OR: [
          { tenantId },
          { children: { some: { tenantId } } },
        ],
      },
      select: listSelect,
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
  ): Promise<ParentDetailDto | null> {
    void orgId; // reserved for future org/org-role scoping
    const parent = await prisma.user.findFirst({
      where: {
        id: parentId,
        hasFamilyAccess: true,
        OR: [
          { tenantId },
          { children: { some: { tenantId } } },
        ],
      },
      select: detailSelect,
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
  ): Promise<ParentDetailDto> {
    void orgId;
    const parent = await prisma.user.findFirst({
      where: {
        id: parentId,
        hasFamilyAccess: true,
        OR: [
          { tenantId },
          { children: { some: { tenantId } } },
        ],
      },
      select: { id: true },
    });
    if (!parent) throw new NotFoundException("Parent not found");

    if (input.childIds !== undefined) {
      if (input.childIds.length > 0) {
        const children = await prisma.child.findMany({
          where: { id: { in: input.childIds }, tenantId },
          select: { id: true },
        });
        if (children.length !== input.childIds.length) {
          throw new BadRequestException("one or more children not found or not in tenant");
        }
      }
      await prisma.user.update({
        where: { id: parentId },
        data: {
          children: { set: input.childIds.map((id) => ({ id })) },
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

    const updated = await this.findOneForTenant(tenantId, orgId, parentId);
    if (!updated) throw new NotFoundException("Parent not found");
    return updated;
  }
}
