import { Injectable } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import {
  requireSiteNoticeStaffAccess,
  type NoticeActor,
} from "./ace-notice-access";
import type { NoticeTargetQuery } from "./dto/ace-notice-target.dto";

function includeSelected<T extends { id: string }>(
  items: T[],
  selected: T | null,
): T[] {
  return selected && !items.some((item) => item.id === selected.id)
    ? [selected, ...items]
    : items;
}

@Injectable()
export class AceNoticeTargetsService {
  async list(query: NoticeTargetQuery, actor: NoticeActor) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const site = await requireSiteNoticeStaffAccess(tx, actor);
      if (site.vertical !== "ACE_SCHOOL") {
        return { available: false, items: [] };
      }
      const { scope, search, selectedId } = query;
      if (scope === "YEAR_BAND") {
        const [bands, selected] = await Promise.all([
          tx.aceYearBand.findMany({
            where: {
              tenantId: actor.tenantId,
              isActive: true,
              ...(search
                ? { name: { contains: search, mode: "insensitive" } }
                : {}),
            },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            take: 25,
            select: { id: true, name: true },
          }),
          selectedId
            ? tx.aceYearBand.findFirst({
                where: {
                  id: selectedId,
                  tenantId: actor.tenantId,
                  isActive: true,
                },
                select: { id: true, name: true },
              })
            : null,
        ]);
        return {
          available: true,
          items: includeSelected(bands, selected).map((band) => ({
            id: band.id,
            label: band.name,
          })),
        };
      }
      if (scope === "GROUP") {
        const [groups, selected] = await Promise.all([
          tx.group.findMany({
            where: {
              tenantId: actor.tenantId,
              isActive: true,
              ...(search
                ? { name: { contains: search, mode: "insensitive" } }
                : {}),
            },
            orderBy: { name: "asc" },
            take: 25,
            select: { id: true, name: true },
          }),
          selectedId
            ? tx.group.findFirst({
                where: {
                  id: selectedId,
                  tenantId: actor.tenantId,
                  isActive: true,
                },
                select: { id: true, name: true },
              })
            : null,
        ]);
        return {
          available: true,
          items: includeSelected(groups, selected).map((group) => ({
            id: group.id,
            label: group.name,
          })),
        };
      }
      const [children, selected] = await Promise.all([
        tx.child.findMany({
          where: {
            tenantId: actor.tenantId,
            isGuest: false,
            ...(search
              ? {
                  OR: [
                    { firstName: { contains: search, mode: "insensitive" } },
                    { lastName: { contains: search, mode: "insensitive" } },
                  ],
                }
              : {}),
          },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          take: 25,
          select: { id: true, firstName: true, lastName: true },
        }),
        selectedId
          ? tx.child.findFirst({
              where: {
                id: selectedId,
                tenantId: actor.tenantId,
                isGuest: false,
              },
              select: { id: true, firstName: true, lastName: true },
            })
          : null,
      ]);
      return {
        available: true,
        items: includeSelected(children, selected).map((child) => ({
          id: child.id,
          label: `${child.firstName} ${child.lastName}`,
        })),
      };
    });
  }
}
