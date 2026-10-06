import {
  attendanceHistoryCursorScope,
  decodeAttendanceHistoryCursor,
  encodeAttendanceHistoryCursor,
} from "../attendance-history-cursor";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const CORRECTED_AT = new Date("2026-08-12T10:00:00.000Z");

describe("attendance history cursor", () => {
  const originalSecret = process.env.INTERNAL_AUTH_SECRET;

  beforeEach(() => {
    process.env.INTERNAL_AUTH_SECRET = "attendance-history-test-secret";
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.INTERNAL_AUTH_SECRET;
    } else {
      process.env.INTERNAL_AUTH_SECRET = originalSecret;
    }
  });

  it("round-trips a scoped cursor and rejects a different attendance row or site", () => {
    const scope = attendanceHistoryCursorScope("site-a", "org-a", "row-a");
    const encoded = encodeAttendanceHistoryCursor(
      { correctedAt: CORRECTED_AT, id: EVENT_ID },
      scope,
    );
    expect(decodeAttendanceHistoryCursor(encoded, scope)).toEqual({
      correctedAt: CORRECTED_AT,
      id: EVENT_ID,
    });
    expect(() =>
      decodeAttendanceHistoryCursor(
        encoded,
        attendanceHistoryCursorScope("site-b", "org-a", "row-a"),
      ),
    ).toThrow();
    expect(() =>
      decodeAttendanceHistoryCursor(
        encoded,
        attendanceHistoryCursorScope("site-a", "org-a", "row-b"),
      ),
    ).toThrow();
  });

  it("rejects edited positions, malformed dates, and missing signing configuration", () => {
    const scope = attendanceHistoryCursorScope("site-a", "org-a", "row-a");
    const encoded = encodeAttendanceHistoryCursor(
      { correctedAt: CORRECTED_AT, id: EVENT_ID },
      scope,
    );
    const payload = Buffer.from(encoded, "base64url").toString("utf8");
    const tampered = Buffer.from(
      payload.replace(EVENT_ID, "22222222-2222-4222-8222-222222222222"),
    ).toString("base64url");
    expect(() => decodeAttendanceHistoryCursor(tampered, scope)).toThrow();
    const invalidDate = Buffer.from(
      payload.replace(CORRECTED_AT.toISOString(), "yesterday"),
    ).toString("base64url");
    expect(() => decodeAttendanceHistoryCursor(invalidDate, scope)).toThrow();

    delete process.env.INTERNAL_AUTH_SECRET;
    expect(() =>
      encodeAttendanceHistoryCursor(
        { correctedAt: CORRECTED_AT, id: EVENT_ID },
        scope,
      ),
    ).toThrow("signing key is unavailable");
  });
});
