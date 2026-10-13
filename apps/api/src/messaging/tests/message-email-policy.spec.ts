import {
  decideMessageEmail,
  MESSAGE_EMAIL_BODY,
  MESSAGE_EMAIL_SUBJECT,
  type MessageEmailPolicyInput,
} from "../message-email-policy";

const eligible: MessageEmailPolicyInput = {
  activeParticipant: true,
  muted: false,
  activeAccount: true,
  permitted: true,
  emailEnabled: true,
  email: "guardian@example.test",
  quietHoursStart: null,
  quietHoursEnd: null,
  timezone: "Europe/London",
  now: new Date("2026-10-13T12:00:00Z"),
};

describe("message email policy", () => {
  it("allows a current opted-in recipient outside quiet hours", () => {
    expect(decideMessageEmail(eligible)).toEqual({ send: true });
  });

  it.each([
    [
      "removed participant",
      { activeParticipant: false },
      "REMOVED_PARTICIPANT",
    ],
    ["muted conversation", { muted: true }, "MUTED_CONVERSATION"],
    ["inactive account", { activeAccount: false }, "INACTIVE_ACCOUNT"],
    ["revoked access", { permitted: false }, "ACCESS_REVOKED"],
    ["email disabled", { emailEnabled: false }, "CHANNEL_DISABLED"],
    ["missing destination", { email: null }, "MISSING_EMAIL"],
    ["missing timezone", { timezone: null }, "INVALID_TIMEZONE"],
    [
      "incomplete quiet hours",
      { quietHoursStart: "22:00" },
      "INVALID_QUIET_HOURS",
    ],
  ] as const)("suppresses %s", (_label, change, reason) => {
    expect(decideMessageEmail({ ...eligible, ...change })).toEqual({
      send: false,
      reason,
    });
  });

  it("uses the school timezone across midnight and daylight saving", () => {
    const quiet = { quietHoursStart: "22:00", quietHoursEnd: "07:00" };
    expect(
      decideMessageEmail({
        ...eligible,
        ...quiet,
        now: new Date("2026-07-01T21:30:00Z"),
      }),
    ).toEqual({ send: false, reason: "QUIET_HOURS" });
    expect(
      decideMessageEmail({
        ...eligible,
        ...quiet,
        now: new Date("2026-07-02T06:00:00Z"),
      }),
    ).toEqual({ send: true });
  });

  it("keeps email copy generic", () => {
    expect(`${MESSAGE_EMAIL_SUBJECT} ${MESSAGE_EMAIL_BODY}`).toBe(
      "New NexSteps message You have a new NexSteps message. Sign in to your school portal to read it.",
    );
  });
});
