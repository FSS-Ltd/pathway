import { BadRequestException, Injectable } from "@nestjs/common";
import { MailerService } from "../mailer/mailer.service";
import { CreateFeedbackDto, decodeScreenshotAttachment } from "./dto";

export type FeedbackContext = {
  tenantId: string;
  orgId: string;
  orgSlug?: string;
  userId: string;
  email?: string;
  displayName?: string;
};

@Injectable()
export class FeedbackService {
  constructor(private readonly mailer: MailerService) {}

  async create(dto: CreateFeedbackDto, context: FeedbackContext): Promise<{ success: true }> {
    let attachment: { buffer: Buffer; filename: string; contentType: string } | undefined;
    try {
      attachment =
        decodeScreenshotAttachment(
          dto.screenshotBase64,
          dto.screenshotContentType,
          dto.screenshotFilename,
        ) ?? undefined;
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : "Invalid screenshot",
      );
    }

    // Deliberately not swallowed: unlike an invite email (where the invite row is
    // already persisted before the email attempt), there is no persisted record
    // here — the email is the entire operation, so a failure must surface to the
    // caller as a retryable error rather than be silently discarded.
    await this.mailer.sendFeedbackEmail({
      category: dto.category,
      subject: dto.subject,
      description: dto.description,
      reporterEmail: context.email,
      reporterName: context.displayName,
      tenantId: context.tenantId || undefined,
      orgId: context.orgId || undefined,
      orgSlug: context.orgSlug || undefined,
      attachment,
    });

    return { success: true };
  }
}
