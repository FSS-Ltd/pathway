import { allowsSelfSignedCert } from "../lib/redeem-download-token";

describe("allowsSelfSignedCert", () => {
  it.each(["https://localhost:3003", "https://127.0.0.1:3003", "https://[::1]:3003"])(
    "allows %s outside production",
    (u) => {
      expect(allowsSelfSignedCert(new URL(u), "development")).toBe(true);
      expect(allowsSelfSignedCert(new URL(u), undefined)).toBe(true);
    },
  );

  it("never allows production", () => {
    expect(allowsSelfSignedCert(new URL("https://localhost:3003"), "production")).toBe(false);
  });

  it("never allows a remote host, even outside production", () => {
    expect(allowsSelfSignedCert(new URL("https://api.nexsteps.dev"), "development")).toBe(false);
    expect(allowsSelfSignedCert(new URL("https://localhost.evil.com"), "development")).toBe(false);
  });

  it("does not apply to plain http", () => {
    expect(allowsSelfSignedCert(new URL("http://localhost:3003"), "development")).toBe(false);
  });
});
