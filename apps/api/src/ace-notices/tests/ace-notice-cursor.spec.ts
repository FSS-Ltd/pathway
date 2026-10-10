import { BadRequestException } from "@nestjs/common";
import {
  decodeNoticeCursor,
  encodeNoticeCursor,
  noticeCursorScope,
} from "../ace-notice-cursor";

describe("ACE notice inbox cursor", () => {
  const previousSecret = process.env.INTERNAL_AUTH_SECRET;
  const position = {
    publishedAt: new Date("2026-10-10T10:00:00.000Z"),
    id: "4ab50a6a-bb52-4b09-9cc0-1cf6a9f635dd",
  };

  beforeAll(() => {
    process.env.INTERNAL_AUTH_SECRET = "notice-cursor-test-secret";
  });

  afterAll(() => {
    if (previousSecret === undefined) delete process.env.INTERNAL_AUTH_SECRET;
    else process.env.INTERNAL_AUTH_SECRET = previousSecret;
  });

  it("round-trips a cursor only for the same site and reader", () => {
    const scope = noticeCursorScope("site-a", "user-a");
    const cursor = encodeNoticeCursor(position, scope);
    expect(decodeNoticeCursor(cursor, scope)).toEqual(position);
    expect(() =>
      decodeNoticeCursor(cursor, noticeCursorScope("site-b", "user-a")),
    ).toThrow(BadRequestException);
    expect(() =>
      decodeNoticeCursor(cursor, noticeCursorScope("site-a", "user-b")),
    ).toThrow(BadRequestException);
  });

  it("rejects tampering and malformed cursor data", () => {
    const scope = noticeCursorScope("site-a", "user-a");
    const cursor = encodeNoticeCursor(position, scope);
    expect(() => decodeNoticeCursor(`${cursor}A`, scope)).toThrow(
      BadRequestException,
    );
    expect(() => decodeNoticeCursor("not-base64!", scope)).toThrow(
      BadRequestException,
    );
  });
});
