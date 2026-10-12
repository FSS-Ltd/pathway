import { Injectable, Logger } from "@nestjs/common";
import { Resend } from "resend";
import { renderBehaviourNotification } from "./templates/behaviour-notification";

/** Resend requires: `email@example.com` or `Name <email@example.com>` */
const DEFAULT_FROM = "Nexsteps <noreply@mail.nexsteps.dev>";

const FEEDBACK_RECIPIENT = "support@faithfulsoftware.dev";
const DEMO_REQUEST_RECIPIENT = "sales@faithfulsoftware.dev";

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character] ?? character;
  });
}

function parseAndValidateFromAddress(
  raw: string | undefined,
): { from: string; usedFallback: boolean } {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { from: DEFAULT_FROM, usedFallback: false };

  // Plain email: something@domain.tld
  const plainEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (plainEmail.test(trimmed)) return { from: trimmed, usedFallback: false };

  // Name <email@domain.tld> format (allows optional space before <)
  const nameAndEmail = /^[^<]+<[^\s@]+@[^\s@]+\.[^\s@]+>$/;
  if (nameAndEmail.test(trimmed)) return { from: trimmed, usedFallback: false };

  return { from: DEFAULT_FROM, usedFallback: true };
}

type SendInviteEmailParams = {
  to: string;
  inviteUrl: string;
  orgName: string;
  invitedByName?: string;
};

/** Params for toolkit download link email. */
export type SendToolkitLinkParams = {
  to: string;
  name?: string;
  orgName?: string;
  downloadUrl: string;
};

export type SendTeamTrackerDeliveryParams = {
  to: string;
  name: string;
  downloadUrl: string;
  previewImageUrl: string;
  unsubscribeUrl?: string;
};

export type TeamTrackerFollowUpKind = "day_3" | "day_7" | "day_12";

export type ScheduleTeamTrackerFollowUpParams = {
  to: string;
  name: string;
  previewImageUrl: string;
  unsubscribeUrl: string;
  scheduledAt: string;
  kind: TeamTrackerFollowUpKind;
  callUrl?: string;
  trackerUrl?: string;
};

/** Params for shift-assignment notification (staff asked to accept a class shift). */
export type SendShiftAssignmentParams = {
  to: string;
  staffName: string;
  sessionTitle: string;
  sessionStartsAt: string;
  acceptUrl: string;
  orgName?: string;
};

/** Params for parent signup complete – "Complete your account" / sign-in link. */
export type SendParentSignupCompleteParams = {
  to: string;
  parentName: string;
  siteName: string;
  orgName: string;
  loginUrl: string;
};

export type SendBehaviourNotificationParams = {
  to: string;
  guardianName: string;
  childName: string;
  siteName: string;
  stage: 1 | 2 | 3;
  occurredOn: string;
  idempotencyKey: string;
};

/** Params for admin feedback / feature-request submissions, sent to the support inbox. */
export type SendFeedbackEmailParams = {
  category: "bug" | "feature-request" | "other";
  subject: string;
  description: string;
  reporterEmail?: string;
  reporterName?: string;
  tenantId?: string;
  orgId?: string;
  orgSlug?: string;
  attachment?: { buffer: Buffer; filename: string; contentType: string };
};

const FEEDBACK_CATEGORY_LABELS: Record<SendFeedbackEmailParams["category"], string> = {
  bug: "Bug",
  "feature-request": "Feature request",
  other: "Other",
};

/** Params for a household's "delete family account" request, sent to the support inbox. */
export type SendAccountDeletionRequestEmailParams = {
  requestId: string;
  tenantId: string;
  requesterEmail?: string;
  requesterName?: string;
  reason?: string;
};

/** Params for demo request notifications, sent to the sales inbox. */
export type SendDemoRequestEmailParams = {
  name: string;
  email: string;
  organisation?: string;
  role?: string;
  sector?: string;
  message?: string;
};

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly resend: Resend | null = null;
  private readonly fromAddress: string;
  private readonly isEnabled: boolean;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    const { from, usedFallback } = parseAndValidateFromAddress(
      process.env.RESEND_FROM,
    );
    this.fromAddress = from;

    if (usedFallback) {
      this.logger.warn(
        `[📧 MAILER] RESEND_FROM is invalid or empty. Using default. ` +
          `Resend requires: email@example.com or "Name <email@example.com>"`,
      );
    }

    if (apiKey) {
      this.resend = new Resend(apiKey);
      this.isEnabled = true;
      this.logger.log("Resend email service initialized");
    } else {
      this.isEnabled = false;
      this.logger.warn(
        "RESEND_API_KEY not set - email sending disabled (emails will be logged only)",
      );
    }
  }

  async sendBehaviourNotification(
    params: SendBehaviourNotificationParams,
  ): Promise<void> {
    const rendered = renderBehaviourNotification(params);
    if (!this.isEnabled || !this.resend) {
      this.logger.log(
        `[MAILER] MOCK MODE - Would send behaviour notification to ${params.to}`,
      );
      return;
    }

    const result = await this.resend.emails.send(
      {
        from: this.fromAddress,
        to: params.to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      },
      { idempotencyKey: params.idempotencyKey },
    );
    if (result.error) {
      throw new Error(
        `Failed to send behaviour notification: ${result.error.message}`,
      );
    }
  }

  /**
   * Send toolkit download link email.
   * In dev without RESEND_API_KEY, logs the download URL to console.
   */
  async sendToolkitLink(params: SendToolkitLinkParams): Promise<void> {
    const { to, name, orgName, downloadUrl } = params;

    this.logger.log(`[📧 MAILER] Sending toolkit link to ${to}`);
    const subject = "Your Nexsteps Attendance + Safeguarding Toolkit";
    const html = this.buildToolkitLinkHtml({ name, orgName, downloadUrl });
    const text = this.buildToolkitLinkText({ name, orgName, downloadUrl });

    if (!this.isEnabled || !this.resend) {
      this.logger.log(
        `[📧 MAILER] MOCK MODE - Would send toolkit link to ${to}\nSubject: ${subject}\nDownload URL: ${downloadUrl}`,
      );
      return;
    }

    try {
      const result = await this.resend.emails.send({
        from: this.fromAddress,
        to,
        subject,
        html,
        text,
      });

      if (result.error) {
        this.logger.error(`[📧 MAILER] Toolkit link error:`, result.error);
        throw new Error(`Resend API error: ${JSON.stringify(result.error)}`);
      }

      this.logger.log(`[📧 MAILER] Toolkit link sent to ${to}`);
    } catch (error) {
      this.logger.error(`[📧 MAILER] Exception sending toolkit link to ${to}:`, error);
      throw new Error(`Failed to send toolkit link: ${String(error)}`);
    }
  }

  private buildToolkitLinkHtml(params: {
    name?: string;
    orgName?: string;
    downloadUrl: string;
  }): string {
    const { name, orgName, downloadUrl } = params;
    const greeting = name ? `Hi ${name},` : "Hi,";
    const orgLine = orgName ? ` for ${orgName}` : "";

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Toolkit</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #e5e5e5;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #1a1a1a;">Nexsteps</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #1a1a1a;">${greeting}</h2>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.5; color: #525252;">
                Here's your download link${orgLine} for the Attendance + Safeguarding Toolkit. The link expires in 48 hours.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
                <tr>
                  <td style="border-radius: 6px; background-color: #0066cc;">
                    <a href="${downloadUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none;">Download Toolkit</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #737373;">
                If you didn't request this, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }

  private buildToolkitLinkText(params: {
    name?: string;
    orgName?: string;
    downloadUrl: string;
  }): string {
    const { name, orgName, downloadUrl } = params;
    const greeting = name ? `Hi ${name},` : "Hi,";
    const orgLine = orgName ? ` for ${orgName}` : "";

    return `
Nexsteps

${greeting}

Here's your download link${orgLine} for the Attendance + Safeguarding Toolkit. The link expires in 48 hours.

Download: ${downloadUrl}

If you didn't request this, you can safely ignore this email.
    `.trim();
  }

  async sendTeamTrackerDelivery(
    params: SendTeamTrackerDeliveryParams,
  ): Promise<string | null> {
    return this.sendTeamTrackerEmail({
      ...params,
      heading: "Your clearer week starts here.",
      subject: "Your free Nexsteps One-Page Team Tracker",
      body: "Your workbook is ready. Start with the role tab that matches your work, then replace or delete the yellow example row. The dashboard will do the counting for you.",
      ctaLabel: "Download the tracker",
      safetyNote:
        "For day-to-day coordination only. Do not store safeguarding concerns or sensitive personal information in this workbook; use your organisation’s approved secure process.",
    });
  }

  async scheduleTeamTrackerFollowUp(
    params: ScheduleTeamTrackerFollowUpParams,
  ): Promise<string | null> {
    const messages: Record<
      TeamTrackerFollowUpKind,
      { subject: string; heading: string; body: string; ctaLabel: string; ctaUrl: string }
    > = {
      day_3: {
        subject: "What are you still tracking somewhere else?",
        heading: "One useful question for this week.",
        body: "The tracker works best when it becomes the place your team checks first. What are you still tracking in a chat, notebook or another spreadsheet? Hit reply and tell us. We read every response.",
        ctaLabel: "Reply to this email",
        ctaUrl: "mailto:hello@nexsteps.dev?subject=What%20we%20are%20still%20tracking",
      },
      day_7: {
        subject: "A 10-minute review that keeps actions moving",
        heading: "Make Friday’s work visible before Monday.",
        body: "Set aside ten minutes at the end of the week. Open the Dashboard, scan open and overdue follow-ups, then agree the next owner and date. It is a small habit that prevents important actions becoming hidden work.",
        ctaLabel: "Open the free tracker",
        ctaUrl: params.trackerUrl ?? "https://nexsteps.dev/team-tracker",
      },
      day_12: {
        subject: "When one page stops being enough",
        heading: "Your team may be ready for the next step.",
        body: "One page is a strong place to start. If you are coordinating a larger team, several sites, or information spread across multiple tools, a short operational-readiness call can help you decide what should be connected next.",
        ctaLabel: "Book an operational-readiness call",
        ctaUrl: params.callUrl ?? "https://nexsteps.dev/demo",
      },
    };
    const message = messages[params.kind];

    return this.sendTeamTrackerEmail({
      to: params.to,
      name: params.name,
      previewImageUrl: params.previewImageUrl,
      unsubscribeUrl: params.unsubscribeUrl,
      subject: message.subject,
      heading: message.heading,
      body: message.body,
      ctaLabel: message.ctaLabel,
      ctaUrl: message.ctaUrl,
      scheduledAt: params.scheduledAt,
    });
  }

  async cancelScheduledEmail(emailId: string): Promise<void> {
    if (!this.isEnabled || !this.resend) {
      this.logger.log(`[📧 MAILER] MOCK MODE - Would cancel scheduled email ${emailId}`);
      return;
    }

    const result = await this.resend.emails.cancel(emailId);
    if (result.error) {
      throw new Error(`Resend API error: ${JSON.stringify(result.error)}`);
    }
  }

  private async sendTeamTrackerEmail(params: {
    to: string;
    name: string;
    previewImageUrl: string;
    subject: string;
    heading: string;
    body: string;
    ctaLabel: string;
    ctaUrl?: string;
    downloadUrl?: string;
    unsubscribeUrl?: string;
    safetyNote?: string;
    scheduledAt?: string;
  }): Promise<string | null> {
    const ctaUrl = params.ctaUrl ?? params.downloadUrl;
    if (!ctaUrl) {
      throw new Error("Team tracker email requires a call-to-action URL");
    }

    const html = this.buildTeamTrackerEmailHtml({ ...params, ctaUrl });
    const text = this.buildTeamTrackerEmailText({ ...params, ctaUrl });
    const schedule = params.scheduledAt ? ` for ${params.scheduledAt}` : "";

    if (!this.isEnabled || !this.resend) {
      this.logger.log(`[📧 MAILER] MOCK MODE - Would send team tracker email to ${params.to}${schedule}\nSubject: ${params.subject}`);
      return null;
    }

    const result = await this.resend.emails.send({
      from: this.fromAddress,
      to: params.to,
      subject: params.subject,
      html,
      text,
      ...(params.scheduledAt ? { scheduledAt: params.scheduledAt } : {}),
      ...(params.unsubscribeUrl
        ? { headers: { "List-Unsubscribe": `<${params.unsubscribeUrl}>` } }
        : {}),
    });

    if (result.error) {
      throw new Error(`Resend API error: ${JSON.stringify(result.error)}`);
    }

    return result.data?.id ?? null;
  }

  private buildTeamTrackerEmailHtml(params: {
    name: string;
    previewImageUrl: string;
    heading: string;
    body: string;
    ctaLabel: string;
    ctaUrl: string;
    unsubscribeUrl?: string;
    safetyNote?: string;
  }): string {
    const greeting = `Hi ${escapeHtml(params.name)},`;
    const unsubscribe = params.unsubscribeUrl
      ? `<p style="margin: 20px 0 0; font-size: 12px; line-height: 1.5; color: #65758b;">You are receiving this because you asked for Nexsteps updates. <a href="${escapeHtml(params.unsubscribeUrl)}" style="color: #65758b;">Unsubscribe</a>.</p>`
      : "";
    const safetyNote = params.safetyNote
      ? `<p style="margin: 24px 0 0; padding: 14px 16px; border-radius: 10px; background: #fff7df; font-size: 13px; line-height: 1.55; color: #76590b;">${escapeHtml(params.safetyNote)}</p>`
      : "";

    return `<!doctype html><html><body style="margin:0;padding:0;background:#edf2f4;font-family:Arial,Helvetica,sans-serif;color:#112035;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;background:#edf2f4;"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;overflow:hidden;border-radius:18px;background:#ffffff;"><tr><td style="padding:24px 32px;background:#0c1726;"><table role="presentation" width="100%"><tr><td style="font-size:20px;font-weight:700;letter-spacing:-0.02em;color:#ffffff;">Nexsteps</td><td align="right" style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#a9f1df;">Forward together</td></tr></table></td></tr><tr><td><img src="${escapeHtml(params.previewImageUrl)}" alt="Nexsteps One-Page Team Tracker" width="600" style="display:block;width:100%;height:auto;border:0;" /></td></tr><tr><td style="padding:32px;"><p style="margin:0 0 16px;font-size:16px;line-height:1.5;">${greeting}</p><h1 style="margin:0 0 16px;font-size:30px;line-height:1.12;letter-spacing:-0.035em;color:#112035;">${escapeHtml(params.heading)}</h1><p style="margin:0;font-size:16px;line-height:1.6;color:#46566b;">${escapeHtml(params.body)}</p><table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:28px;"><tr><td style="border-radius:10px;background:#149b7e;"><a href="${escapeHtml(params.ctaUrl)}" style="display:inline-block;padding:14px 20px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">${escapeHtml(params.ctaLabel)}</a></td></tr></table>${safetyNote}${unsubscribe}</td></tr></table></td></tr></table></body></html>`;
  }

  private buildTeamTrackerEmailText(params: {
    name: string;
    heading: string;
    body: string;
    ctaLabel: string;
    ctaUrl: string;
    unsubscribeUrl?: string;
    safetyNote?: string;
  }): string {
    return [
      "Nexsteps",
      "",
      `Hi ${params.name},`,
      "",
      params.heading,
      "",
      params.body,
      "",
      `${params.ctaLabel}: ${params.ctaUrl}`,
      ...(params.safetyNote ? ["", params.safetyNote] : []),
      ...(params.unsubscribeUrl
        ? ["", `Unsubscribe from Nexsteps updates: ${params.unsubscribeUrl}`]
        : []),
    ].join("\n");
  }

  /**
   * Send an invite email to a new user.
   * 
   * Note: This only sends the invitation link. Auth0 handles all email verification
   * for new accounts automatically.
   */
  async sendInviteEmail(params: SendInviteEmailParams): Promise<void> {
    const { to, inviteUrl, orgName, invitedByName } = params;

    this.logger.log(`[📧 MAILER] Starting to send invite email to ${to}`);
    this.logger.log(`[📧 MAILER] Config: { from: "${this.fromAddress}", enabled: ${this.isEnabled} }`);

    const subject = `You've been invited to join ${orgName} on Nexsteps`;
    const html = this.buildInviteEmailHtml({
      inviteUrl,
      orgName,
      invitedByName,
    });
    const text = this.buildInviteEmailText({
      inviteUrl,
      orgName,
      invitedByName,
    });

    if (!this.isEnabled || !this.resend) {
      this.logger.log(
        `[📧 MAILER] MOCK MODE - Would send invite to ${to}\nSubject: ${subject}\nLink: ${inviteUrl}`,
      );
      return;
    }

    try {
      this.logger.log(`[📧 MAILER] Calling Resend API...`);
      const result = await this.resend.emails.send({
        from: this.fromAddress,
        to,
        subject,
        html,
        text,
      });

      if (result.error) {
        this.logger.error(`[📧 MAILER] ❌ Resend API returned error:`, result.error);
        throw new Error(`Resend API error: ${JSON.stringify(result.error)}`);
      }

      this.logger.log(`[📧 MAILER] ✅ Email sent successfully to ${to}`);
      this.logger.log(`[📧 MAILER] Resend Email ID: ${result.data?.id}`);
    } catch (error) {
      this.logger.error(`[📧 MAILER] ❌ Exception while sending email to ${to}:`, error);
      throw new Error(`Failed to send invite email: ${String(error)}`);
    }
  }

  /**
   * Send an email asking staff to accept a class shift.
   * In the future this will be complemented by mobile push notifications.
   */
  async sendShiftAssignmentNotification(
    params: SendShiftAssignmentParams,
  ): Promise<void> {
    const { to, staffName, sessionTitle, sessionStartsAt, acceptUrl, orgName } =
      params;

    this.logger.log(
      `[📧 MAILER] Step 9: sendShiftAssignmentNotification called for to=${to}, sessionTitle=${sessionTitle}`,
    );

    const subject = `You've been assigned: ${sessionTitle} – please accept or decline`;
    const html = this.buildShiftAssignmentHtml({
      staffName,
      sessionTitle,
      sessionStartsAt,
      acceptUrl,
      orgName,
    });
    const text = this.buildShiftAssignmentText({
      staffName,
      sessionTitle,
      sessionStartsAt,
      acceptUrl,
      orgName,
    });

    this.logger.log(
      `[📧 MAILER] Step 10: isEnabled=${this.isEnabled}, resend=${!!this.resend}, fromAddress=${this.fromAddress ?? "(not set)"}`,
    );
    if (!this.isEnabled || !this.resend) {
      this.logger.log(
        `[📧 MAILER] Step 10b: MOCK MODE - not sending. Would send to ${to}, Subject: ${subject}, Accept: ${acceptUrl}`,
      );
      return;
    }

    this.logger.log(`[📧 MAILER] Step 11: Calling Resend API...`);
    try {
      const result = await this.resend.emails.send({
        from: this.fromAddress,
        to,
        subject,
        html,
        text,
      });

      if (result.error) {
        this.logger.error(
          `[📧 MAILER] Step 12 FAIL: Resend API returned error:`,
          result.error,
        );
        throw new Error(`Resend API error: ${JSON.stringify(result.error)}`);
      }

      this.logger.log(`[📧 MAILER] Step 12: ✅ Shift assignment email sent to ${to}, id=${result.data?.id ?? "n/a"}`);
    } catch (error) {
      this.logger.error(
        `[📧 MAILER] Step 12 FAIL: Exception sending shift assignment to ${to}:`,
        error,
      );
      throw new Error(
        `Failed to send shift assignment email: ${String(error)}`,
      );
    }
  }

  private buildShiftAssignmentHtml(params: {
    staffName: string;
    sessionTitle: string;
    sessionStartsAt: string;
    acceptUrl: string;
    orgName?: string;
  }): string {
    const { staffName, sessionTitle, sessionStartsAt, acceptUrl, orgName } =
      params;
    const footer = orgName
      ? `This assignment was sent by ${orgName}.`
      : "If you didn't expect this, you can safely ignore this email.";

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Shift assignment</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #e5e5e5;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #1a1a1a;">Nexsteps</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #1a1a1a;">
                Hi ${staffName},
              </h2>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.5; color: #525252;">
                You've been assigned to the following session. Please accept or decline so the rota can be updated.
              </p>
              <p style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #1a1a1a;">${sessionTitle}</p>
              <p style="margin: 0 0 24px; font-size: 14px; color: #737373;">${sessionStartsAt}</p>
              <table cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
                <tr>
                  <td style="border-radius: 6px; background-color: #0066cc;">
                    <a href="${acceptUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none;">View schedule &amp; respond</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #737373;">${footer}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }

  private buildShiftAssignmentText(params: {
    staffName: string;
    sessionTitle: string;
    sessionStartsAt: string;
    acceptUrl: string;
    orgName?: string;
  }): string {
    const { staffName, sessionTitle, sessionStartsAt, acceptUrl, orgName } =
      params;
    const footer = orgName
      ? `This assignment was sent by ${orgName}.`
      : "If you didn't expect this, you can safely ignore this email.";

    return `
Nexsteps

Hi ${staffName},

You've been assigned to the following session. Please accept or decline so the rota can be updated.

${sessionTitle}
${sessionStartsAt}

View your schedule and respond: ${acceptUrl}

${footer}
    `.trim();
  }

  private buildInviteEmailHtml(params: {
    inviteUrl: string;
    orgName: string;
    invitedByName?: string;
  }): string {
    const { inviteUrl, orgName, invitedByName } = params;
    const invitedBy = invitedByName
      ? `${invitedByName} has invited you`
      : "You've been invited";

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitation to ${orgName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #e5e5e5;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #1a1a1a;">Nexsteps</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #1a1a1a;">
                ${invitedBy} to join ${orgName}
              </h2>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.5; color: #525252;">
                Click the button below to accept your invitation and get started with Nexsteps.
              </p>
              
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
                <tr>
                  <td style="border-radius: 6px; background-color: #0066cc;">
                    <a href="${inviteUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.5; color: #737373;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #0066cc; word-break: break-all;">
                ${inviteUrl}
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; border-top: 1px solid #e5e5e5; text-align: center;">
              <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #a3a3a3;">
                This invitation was sent to you by ${orgName}.<br>
                If you didn't expect this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }

  private buildInviteEmailText(params: {
    inviteUrl: string;
    orgName: string;
    invitedByName?: string;
  }): string {
    const { inviteUrl, orgName, invitedByName } = params;
    const invitedBy = invitedByName
      ? `${invitedByName} has invited you`
      : "You've been invited";

    return `
Nexsteps

${invitedBy} to join ${orgName}

Click the link below to accept your invitation and get started:

${inviteUrl}

If you didn't expect this invitation, you can safely ignore this email.
    `.trim();
  }

  /**
   * Send "Complete your account" email after parent signup (invite-only flow).
   * Contains link to app login so parent can sign in with Auth0.
   */
  async sendParentSignupCompleteEmail(
    params: SendParentSignupCompleteParams,
  ): Promise<void> {
    const { to, parentName, siteName, orgName, loginUrl } = params;

    this.logger.log(
      `[📧 MAILER] Sending parent signup complete email to ${to}`,
    );

    const subject = `Complete your ${siteName} account – sign in to Nexsteps`;
    const html = this.buildParentSignupCompleteHtml({
      parentName,
      siteName,
      orgName,
      loginUrl,
    });
    const text = this.buildParentSignupCompleteText({
      parentName,
      siteName,
      orgName,
      loginUrl,
    });

    if (!this.isEnabled || !this.resend) {
      this.logger.log(
        `[📧 MAILER] MOCK MODE - Would send parent signup complete to ${to}\nSubject: ${subject}\nLink: ${loginUrl}`,
      );
      return;
    }

    try {
      const result = await this.resend.emails.send({
        from: this.fromAddress,
        to,
        subject,
        html,
        text,
      });

      if (result.error) {
        this.logger.error(
          `[📧 MAILER] Parent signup complete email error:`,
          result.error,
        );
        throw new Error(
          `Resend API error: ${JSON.stringify(result.error)}`,
        );
      }

      this.logger.log(
        `[📧 MAILER] Parent signup complete email sent to ${to}`,
      );
    } catch (error) {
      this.logger.error(
        `[📧 MAILER] Exception sending parent signup complete to ${to}:`,
        error,
      );
      throw new Error(
        `Failed to send parent signup complete email: ${String(error)}`,
      );
    }
  }

  private buildParentSignupCompleteHtml(params: {
    parentName: string;
    siteName: string;
    orgName: string;
    loginUrl: string;
  }): string {
    const { parentName, siteName, orgName, loginUrl } = params;
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Complete your account</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #e5e5e5;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #1a1a1a;">Nexsteps</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #1a1a1a;">
                Hi ${parentName},
              </h2>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.5; color: #525252;">
                You've completed registration for ${siteName}. Use the link below to sign in to your account.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
                <tr>
                  <td style="border-radius: 6px; background-color: #0066cc;">
                    <a href="${loginUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none;">Sign in</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #737373;">
                If you didn't register with ${orgName}, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }

  private buildParentSignupCompleteText(params: {
    parentName: string;
    siteName: string;
    orgName: string;
    loginUrl: string;
  }): string {
    const { parentName, siteName, orgName, loginUrl } = params;
    return `
Nexsteps

Hi ${parentName},

You've completed registration for ${siteName}. Sign in here:

${loginUrl}

If you didn't register with ${orgName}, you can safely ignore this email.
    `.trim();
  }

  /**
   * Send an admin feedback / feature-request submission to the support inbox.
   * Optional screenshot travels as an email attachment (no storage involved).
   */
  async sendFeedbackEmail(params: SendFeedbackEmailParams): Promise<void> {
    const categoryLabel = FEEDBACK_CATEGORY_LABELS[params.category];
    const subject = `[Feedback: ${categoryLabel}] ${params.subject}`;
    const html = this.buildFeedbackEmailHtml(params, categoryLabel);
    const text = this.buildFeedbackEmailText(params, categoryLabel);

    if (!this.isEnabled || !this.resend) {
      this.logger.log(
        `[📧 MAILER] MOCK MODE - Would send feedback email\nSubject: ${subject}\nReporter: ${params.reporterEmail ?? "unknown"}\nScreenshot: ${params.attachment ? `attached (${params.attachment.buffer.length} bytes)` : "none"}`,
      );
      return;
    }

    try {
      const result = await this.resend.emails.send({
        from: this.fromAddress,
        to: FEEDBACK_RECIPIENT,
        subject,
        html,
        text,
        replyTo: params.reporterEmail,
        attachments: params.attachment
          ? [
              {
                filename: params.attachment.filename,
                content: params.attachment.buffer,
                contentType: params.attachment.contentType,
              },
            ]
          : undefined,
      });

      if (result.error) {
        this.logger.error(`[📧 MAILER] Feedback email error:`, result.error);
        throw new Error(`Resend API error: ${JSON.stringify(result.error)}`);
      }

      this.logger.log(`[📧 MAILER] Feedback email sent to ${FEEDBACK_RECIPIENT}`);
    } catch (error) {
      this.logger.error(`[📧 MAILER] Exception sending feedback email:`, error);
      throw new Error(`Failed to send feedback email: ${String(error)}`);
    }
  }

  private buildFeedbackEmailHtml(
    params: SendFeedbackEmailParams,
    categoryLabel: string,
  ): string {
    const escapeHtml = (value: string): string =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const { reporterEmail, reporterName, tenantId, orgId, orgSlug, attachment } = params;
    const subject = escapeHtml(params.subject);
    const description = escapeHtml(params.description);
    const reporter = escapeHtml(
      reporterName
        ? `${reporterName}${reporterEmail ? ` (${reporterEmail})` : ""}`
        : reporterEmail ?? "Unknown",
    );
    const org = escapeHtml(orgSlug || orgId || "Not set");
    const tenant = escapeHtml(tenantId || "Not set");

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Feedback: ${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #e5e5e5;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #1a1a1a;">Nexsteps Admin Feedback</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #737373;">${categoryLabel}</p>
              <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #1a1a1a;">${subject}</h2>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #525252; white-space: pre-wrap;">${description}</p>
              <table cellpadding="0" cellspacing="0" style="width: 100%; border-top: 1px solid #e5e5e5; padding-top: 16px;">
                <tr><td style="padding: 4px 0; font-size: 14px; color: #737373;">Reported by</td><td style="padding: 4px 0; font-size: 14px; color: #1a1a1a; text-align: right;">${reporter}</td></tr>
                <tr><td style="padding: 4px 0; font-size: 14px; color: #737373;">Organisation</td><td style="padding: 4px 0; font-size: 14px; color: #1a1a1a; text-align: right;">${org}</td></tr>
                <tr><td style="padding: 4px 0; font-size: 14px; color: #737373;">Tenant / site</td><td style="padding: 4px 0; font-size: 14px; color: #1a1a1a; text-align: right;">${tenant}</td></tr>
                <tr><td style="padding: 4px 0; font-size: 14px; color: #737373;">Screenshot</td><td style="padding: 4px 0; font-size: 14px; color: #1a1a1a; text-align: right;">${attachment ? "Attached" : "None"}</td></tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }

  private buildFeedbackEmailText(
    params: SendFeedbackEmailParams,
    categoryLabel: string,
  ): string {
    const { subject, description, reporterEmail, reporterName, tenantId, orgId, orgSlug, attachment } = params;
    const reporter = reporterName
      ? `${reporterName}${reporterEmail ? ` (${reporterEmail})` : ""}`
      : reporterEmail ?? "Unknown";

    return `
Nexsteps Admin Feedback

[${categoryLabel}] ${subject}

${description}

Reported by: ${reporter}
Organisation: ${orgSlug || orgId || "Not set"}
Tenant / site: ${tenantId || "Not set"}
Screenshot: ${attachment ? "Attached" : "None"}
    `.trim();
  }

  /**
   * Notify the support inbox that a household requested "delete family
   * account". This does not delete anything - it only routes the request to
   * support for manual review, same as sendFeedbackEmail's inbox.
   */
  async sendAccountDeletionRequestEmail(
    params: SendAccountDeletionRequestEmailParams,
  ): Promise<void> {
    const subject = `[Account deletion request] ${params.tenantId}`;
    const requester = params.requesterName
      ? `${params.requesterName}${params.requesterEmail ? ` (${params.requesterEmail})` : ""}`
      : (params.requesterEmail ?? "Unknown");
    const text = `
Nexsteps Account Deletion Request

Request ID: ${params.requestId}
Household (tenant): ${params.tenantId}
Requested by: ${requester}
Reason: ${params.reason ?? "Not provided"}
    `.trim();

    if (!this.isEnabled || !this.resend) {
      this.logger.log(
        `[📧 MAILER] MOCK MODE - Would send account deletion request email\n${text}`,
      );
      return;
    }

    try {
      const result = await this.resend.emails.send({
        from: this.fromAddress,
        to: FEEDBACK_RECIPIENT,
        subject,
        text,
        replyTo: params.requesterEmail,
      });

      if (result.error) {
        this.logger.error(`[📧 MAILER] Account deletion request email error:`, result.error);
        throw new Error(`Resend API error: ${JSON.stringify(result.error)}`);
      }

      this.logger.log(`[📧 MAILER] Account deletion request email sent to ${FEEDBACK_RECIPIENT}`);
    } catch (error) {
      this.logger.error(`[📧 MAILER] Exception sending account deletion request email:`, error);
      throw new Error(`Failed to send account deletion request email: ${String(error)}`);
    }
  }

  /**
   * Notify the sales inbox of a new demo request, with the submitted form contents.
   */
  async sendDemoRequestEmail(params: SendDemoRequestEmailParams): Promise<void> {
    const subject = `New demo request: ${params.name}${params.organisation ? ` (${params.organisation})` : ""}`;
    const html = this.buildDemoRequestEmailHtml(params);
    const text = this.buildDemoRequestEmailText(params);

    if (!this.isEnabled || !this.resend) {
      this.logger.log(
        `[📧 MAILER] MOCK MODE - Would send demo request email\nSubject: ${subject}\nFrom: ${params.name} <${params.email}>`,
      );
      return;
    }

    try {
      const result = await this.resend.emails.send({
        from: this.fromAddress,
        to: DEMO_REQUEST_RECIPIENT,
        subject,
        html,
        text,
        replyTo: params.email,
      });

      if (result.error) {
        this.logger.error(`[📧 MAILER] Demo request email error:`, result.error);
        throw new Error(`Resend API error: ${JSON.stringify(result.error)}`);
      }

      this.logger.log(`[📧 MAILER] Demo request email sent to ${DEMO_REQUEST_RECIPIENT}`);
    } catch (error) {
      this.logger.error(`[📧 MAILER] Exception sending demo request email:`, error);
      throw new Error(`Failed to send demo request email: ${String(error)}`);
    }
  }

  private buildDemoRequestEmailHtml(params: SendDemoRequestEmailParams): string {
    const escapeHtml = (value: string): string =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const { name, email, organisation, role, sector, message } = params;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New demo request</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #e5e5e5;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #1a1a1a;">New demo request</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <table cellpadding="0" cellspacing="0" style="width: 100%;">
                <tr><td style="padding: 4px 0; font-size: 14px; color: #737373;">Name</td><td style="padding: 4px 0; font-size: 14px; color: #1a1a1a; text-align: right;">${escapeHtml(name)}</td></tr>
                <tr><td style="padding: 4px 0; font-size: 14px; color: #737373;">Email</td><td style="padding: 4px 0; font-size: 14px; color: #1a1a1a; text-align: right;">${escapeHtml(email)}</td></tr>
                <tr><td style="padding: 4px 0; font-size: 14px; color: #737373;">Organisation</td><td style="padding: 4px 0; font-size: 14px; color: #1a1a1a; text-align: right;">${escapeHtml(organisation || "Not set")}</td></tr>
                <tr><td style="padding: 4px 0; font-size: 14px; color: #737373;">Role</td><td style="padding: 4px 0; font-size: 14px; color: #1a1a1a; text-align: right;">${escapeHtml(role || "Not set")}</td></tr>
                <tr><td style="padding: 4px 0; font-size: 14px; color: #737373;">Sector</td><td style="padding: 4px 0; font-size: 14px; color: #1a1a1a; text-align: right;">${escapeHtml(sector || "Not set")}</td></tr>
              </table>
              ${message ? `<p style="margin: 24px 0 0; font-size: 14px; line-height: 1.6; color: #525252; white-space: pre-wrap; border-top: 1px solid #e5e5e5; padding-top: 16px;">${escapeHtml(message)}</p>` : ""}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }

  private buildDemoRequestEmailText(params: SendDemoRequestEmailParams): string {
    const { name, email, organisation, role, sector, message } = params;

    return `
New demo request

Name: ${name}
Email: ${email}
Organisation: ${organisation || "Not set"}
Role: ${role || "Not set"}
Sector: ${sector || "Not set"}
${message ? `\n${message}` : ""}
    `.trim();
  }
}
