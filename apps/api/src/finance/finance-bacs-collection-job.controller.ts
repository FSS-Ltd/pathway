import { timingSafeEqual } from "node:crypto";
import {
  Controller,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { FinanceBacsCollectionService } from "./finance-bacs-collection.service";

@Controller("internal/finance/bacs")
export class FinanceBacsCollectionJobController {
  constructor(
    @Inject(FinanceBacsCollectionService)
    private readonly collections: FinanceBacsCollectionService,
  ) {}

  @Post("run-due")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "private, no-store")
  runDue(
    @Headers("x-pathway-internal-secret") providedSecret: string | undefined,
  ) {
    if (
      !isValidSecret(
        providedSecret,
        process.env.FINANCE_BACS_COLLECTION_JOB_SECRET,
      )
    ) {
      throw new UnauthorizedException("Invalid internal auth secret");
    }
    return this.collections.runDue();
  }
}

function isValidSecret(
  provided: string | undefined,
  expected: string | undefined,
): boolean {
  if (!provided || !expected) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
