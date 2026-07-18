import { SetMetadata } from "@nestjs/common";
import type { Capability } from "@pathway/platform";

export const REQUIRE_CAPABILITY_KEY = "pathway:required_capability";

export const RequireCapability = (capability: Capability) =>
  SetMetadata(REQUIRE_CAPABILITY_KEY, capability);
