import { SetMetadata } from "@nestjs/common";
import type { PermissionKey } from "@pathway/platform";

export const REQUIRED_PERMISSION = "pathway:required_permission";

export const RequirePermission = (permission: PermissionKey) =>
  SetMetadata(REQUIRED_PERMISSION, permission);
