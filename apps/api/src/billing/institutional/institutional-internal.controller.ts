import { timingSafeEqual } from "node:crypto";
import {
  Controller,
  Headers,
  Inject,
  Param,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { IndependentTransaction } from "../../common/database/independent-transaction.decorator";
import { InstitutionalOperationService } from "./institutional-operation.service";

function validInternalSecret(provided: string | undefined): boolean {
  const expected = process.env.INTERNAL_AUTH_SECRET;
  if (!expected || !provided) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

@IndependentTransaction()
@Controller("billing/institutional/internal")
export class InstitutionalBillingInternalController {
  constructor(
    @Inject(InstitutionalOperationService)
    private readonly operations: InstitutionalOperationService,
  ) {}

  @Post("operations/:id")
  async execute(
    @Param("id") id: string,
    @Headers("x-pathway-internal-secret") secret?: string,
  ): Promise<{ status: "ok" }> {
    if (!validInternalSecret(secret)) {
      throw new UnauthorizedException("Invalid internal auth secret");
    }
    await this.operations.execute(id);
    return { status: "ok" };
  }
}
