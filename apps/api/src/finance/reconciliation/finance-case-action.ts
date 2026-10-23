import { ConflictException } from "@nestjs/common";

export function assertFinanceCaseAction(
  status: string,
  lastSeenAt: Date,
  expected: Date,
): void {
  if (status === "RESOLVED" || lastSeenAt.getTime() !== expected.getTime()) {
    throw new ConflictException(
      "Case changed. Refresh its evidence before acting.",
    );
  }
}
