import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { BlogAutomationTokenService } from "./blog-automation-token.service";

export type AutomationRequest = Request & {
  automationToken?: {
    id: string;
    name: string;
  };
};

@Injectable()
export class BlogAutomationTokenGuard implements CanActivate {
  constructor(
    @Inject(BlogAutomationTokenService)
    private readonly tokenService: BlogAutomationTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AutomationRequest>();
    const rawToken = this.readBearerToken(req);

    const token = await this.tokenService.authenticate(rawToken);
    this.tokenService.assertWithinRateLimit(token.id);

    req.automationToken = token;
    return true;
  }

  private readBearerToken(req: Request): string {
    const raw = req.headers.authorization;
    if (!raw) {
      throw new UnauthorizedException("Missing Authorization header");
    }

    const [scheme, token] = raw.split(" ");
    if (!scheme || scheme.toLowerCase() !== "bearer" || !token) {
      throw new UnauthorizedException("Unsupported Authorization header");
    }

    if (!token.trim()) {
      throw new UnauthorizedException("Empty bearer token");
    }

    return token.trim();
  }
}
