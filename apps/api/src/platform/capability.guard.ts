import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Inject,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PathwayRequestContext } from "@pathway/auth";
import { orgHasCapability, type Capability } from "@pathway/platform";
import { REQUIRE_CAPABILITY_KEY } from "./capability.decorator";

@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Capability>(
      REQUIRE_CAPABILITY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) {
      return true;
    }

    const orgId = this.requestContext.currentOrgId;
    if (!orgId) {
      throw new ForbiddenException("No active organisation");
    }

    if (await orgHasCapability(orgId, required)) {
      return true;
    }

    throw new ForbiddenException(`Missing capability: ${required}`);
  }
}
