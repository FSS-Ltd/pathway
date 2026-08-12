export interface BehaviourNotificationTemplateInput {
  guardianName: string;
  childName: string;
  siteName: string;
  stage: 1 | 2 | 3;
  occurredOn: string;
}

export interface RenderedBehaviourNotification {
  subject: string;
  html: string;
  text: string;
}

export function renderBehaviourNotification(
  input: BehaviourNotificationTemplateInput,
): RenderedBehaviourNotification {
  const subject = `Behaviour update for ${input.childName}`;
  const heading = `A behaviour update is ready for ${input.childName}`;
  const explanation =
    "The notification deliberately excludes incident notes and other restricted narrative. Please contact the site if you need to discuss the update.";

  return {
    subject,
    html: `<!doctype html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;background:#f5f5f5;"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;border-radius:12px;background:#ffffff;"><tr><td style="padding:32px;"><p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Hello ${escapeHtml(input.guardianName)},</p><h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;">${escapeHtml(heading)}</h1><p style="margin:0 0 16px;font-size:16px;line-height:1.6;">A stage ${input.stage} behaviour update was recorded on ${escapeHtml(input.occurredOn)} by ${escapeHtml(input.siteName)}.</p><p style="margin:0;font-size:14px;line-height:1.6;color:#525252;">${escapeHtml(explanation)}</p></td></tr></table></td></tr></table></body></html>`,
    text: [
      `Hello ${input.guardianName},`,
      "",
      heading,
      "",
      `A stage ${input.stage} behaviour update was recorded on ${input.occurredOn} by ${input.siteName}.`,
      "",
      explanation,
    ].join("\n"),
  };
}

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
