import { timingSafeEqual } from "node:crypto";
import { UnauthorizedException } from "@nestjs/common";

export function requireCronAuthorization(header: string | undefined): void {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16 || !header)
    throw new UnauthorizedException();
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new UnauthorizedException();
  }
}
