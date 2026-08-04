import {
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
  Inject,
} from "@nestjs/common";
import { AuthIdentityService } from "./auth-identity.service";
import { UpsertIdentityDto } from "./dto/upsert-identity.dto";
import { UserRolesService } from "./user-roles.service";

const INTERNAL_SECRET_HEADER = "x-pathway-internal-secret";

@Controller("internal/auth/identity")
export class AuthIdentityController {
  constructor(
    @Inject(AuthIdentityService)
    private readonly authIdentityService: AuthIdentityService,
    @Inject(UserRolesService)
    private readonly userRolesService: UserRolesService,
  ) {}

  @Post("upsert")
  async upsertIdentity(
    @Body() body: UpsertIdentityDto,
    @Headers(INTERNAL_SECRET_HEADER) providedSecret?: string,
  ) {
    const expectedSecret = process.env.INTERNAL_AUTH_SECRET;
    if (!expectedSecret || providedSecret !== expectedSecret) {
      throw new UnauthorizedException("Invalid internal auth secret");
    }

    const result = await this.authIdentityService.upsertFromProvider(body);
    const roles = await this.userRolesService.getUserRoles(result.userId);
    return { ...result, roles };
  }
}

