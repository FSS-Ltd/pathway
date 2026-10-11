import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { CurrentOrg, CurrentTenant } from "@pathway/auth";
import type { Request } from "express";
import { z } from "zod";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { IndependentTransaction } from "../common/database/independent-transaction.decorator";
import { assertOrgAdminAccess } from "../orgs/org-admin-access";
import { FamilyIdentityImportService } from "./family-identity-import.service";

const common = {
  childId: z.string().uuid(),
  email: z.string().trim().email().max(254),
};
const rowSchema = z.discriminatedUnion("target", [
  z
    .object({
      ...common,
      target: z.literal("GUARDIAN"),
      reviewBasis: z.enum(["SCHOOL_RECORDS", "LEGAL_DOCUMENT"]),
      confirmedLegalAccess: z.literal(true),
    })
    .strict(),
  z
    .object({
      ...common,
      target: z.literal("STUDENT"),
      confirmedSchoolApproval: z.literal(true),
    })
    .strict(),
]);
const importSchema = z
  .object({ rows: z.array(rowSchema).min(1).max(10) })
  .strict();

interface AuthenticatedRequest extends Request {
  authUserId?: string;
}

@UseGuards(AuthUserGuard, PermissionGuard)
@IndependentTransaction()
@RequirePermission("students.manage")
@Controller("family-identity-import")
export class FamilyIdentityImportController {
  constructor(
    @Inject(FamilyIdentityImportService)
    private readonly service: FamilyIdentityImportService,
  ) {}

  @Post()
  async import(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
  ) {
    const parsed = importSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const actorUserId = await assertOrgAdminAccess(
      request.authUserId,
      orgId,
      "import family invitations",
    );
    return this.service.importRows(
      tenantId,
      orgId,
      actorUserId,
      parsed.data.rows,
    );
  }
}
