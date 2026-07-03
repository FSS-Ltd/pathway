import { ForbiddenException, Injectable, Inject, forwardRef } from "@nestjs/common";
import { EntitlementsService } from "./entitlements.service";

export const AV30_SOFT_CAP_RATIO = 1.0;
export const AV30_GRACE_RATIO = 1.1;
export const AV30_HARD_CAP_RATIO = 1.2;
export const AV30_GRACE_DAYS = 14; // TODO: confirm exact business-configurable grace window

export type Av30EnforcementStatus = "OK" | "SOFT_CAP" | "GRACE" | "HARD_CAP";

export type Av30EnforcementResult = {
  orgId: string;
  currentAv30: number | null;
  av30Cap: number | null;
  status: Av30EnforcementStatus;
  graceUntil: Date | null;
  messageCode:
    | "av30.ok"
    | "av30.soft_cap"
    | "av30.grace"
    | "av30.hard_cap"
    | "av30.no_cap";
};

export class Av30HardCapExceededError extends ForbiddenException {
  public readonly code = "av30.hard_cap";
  constructor(orgId: string) {
    super({
      code: "av30.hard_cap",
      message: "AV30 hard cap reached; action blocked",
      orgId,
    });
  }
}

@Injectable()
export class EntitlementsEnforcementService {
  constructor(
    @Inject(forwardRef(() => EntitlementsService))
    private readonly entitlements: EntitlementsService,
  ) {}

  async checkAv30ForOrg(orgId: string): Promise<Av30EnforcementResult> {
    const resolved = await this.entitlements.resolve(orgId);
    const cap = resolved.av30Cap;
    const usage = resolved.currentAv30 ?? 0;

    if (!cap || cap <= 0) {
      return {
        orgId,
        currentAv30: usage,
        av30Cap: cap,
        status: "OK",
        graceUntil: null,
        messageCode: "av30.no_cap",
      };
    }

    const ratio = usage / cap;

    if (ratio >= AV30_HARD_CAP_RATIO) {
      return {
        orgId,
        currentAv30: usage,
        av30Cap: cap,
        status: "HARD_CAP",
        graceUntil: null,
        messageCode: "av30.hard_cap",
      };
    }

    if (ratio >= AV30_GRACE_RATIO) {
      return {
        orgId,
        currentAv30: usage,
        av30Cap: cap,
        status: "GRACE",
        graceUntil: this.calculateGraceUntil(resolved.usageCalculatedAt),
        messageCode: "av30.grace",
      };
    }

    if (ratio >= AV30_SOFT_CAP_RATIO) {
      return {
        orgId,
        currentAv30: usage,
        av30Cap: cap,
        status: "SOFT_CAP",
        graceUntil: null,
        messageCode: "av30.soft_cap",
      };
    }

    return {
      orgId,
      currentAv30: usage,
      av30Cap: cap,
      status: "OK",
      graceUntil: null,
      messageCode: "av30.ok",
    };
  }

  assertWithinHardCap(result: Av30EnforcementResult): void {
    if (result.status === "HARD_CAP") {
      throw new Av30HardCapExceededError(result.orgId);
    }
  }

  private calculateGraceUntil(calculatedAt: Date | null): Date | null {
    if (!calculatedAt) return null;
    const grace = new Date(calculatedAt);
    grace.setDate(grace.getDate() + AV30_GRACE_DAYS);
    return grace;
  }
}
