import { UnauthorizedException } from "@nestjs/common";
import { SignJWT } from "jose";
import { signTestToken, verifyBearerToken } from "../token-verifier";

const ORIGINAL_ENV = { ...process.env };
const TEST_SECRET = "unit-test-secret-not-real";

describe("token-verifier", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.NODE_ENV = "test";
    process.env.TEST_AUTH_TOKEN_SECRET = TEST_SECRET;
    delete process.env.AUTH0_ISSUER;
    delete process.env.CLERK_ISSUER;
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("verifies a validly signed test token and returns the principal", async () => {
    const token = await signTestToken({
      sub: "user-1",
      email: "person@example.test",
      emailVerified: true,
      name: "Person One",
    });

    const principal = await verifyBearerToken(`Bearer ${token}`);

    expect(principal).toMatchObject({
      provider: "auth0",
      sub: "user-1",
      email: "person@example.test",
      emailVerified: true,
      name: "Person One",
    });
  });

  it("carries externalId when the token asserts one", async () => {
    const token = await signTestToken({
      sub: "user-1",
      externalId: "internal-user-id",
      provider: "clerk",
    });

    const principal = await verifyBearerToken(`Bearer ${token}`);

    expect(principal.provider).toBe("clerk");
    expect(principal.externalId).toBe("internal-user-id");
  });

  it("retains only signed step-up evidence needed by protected routes", async () => {
    const token = await signTestToken({
      sub: "user-1",
      provider: "clerk",
      factorVerificationAgeMinutes: [1, 2],
    });

    await expect(verifyBearerToken(`Bearer ${token}`)).resolves.toMatchObject({
      provider: "clerk",
      factorVerificationAgeMinutes: [1, 2],
    });
  });

  it("rejects a missing Authorization header", async () => {
    await expect(verifyBearerToken(undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects a non-bearer scheme", async () => {
    await expect(
      verifyBearerToken("Basic dXNlcjpwYXNz"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a malformed token", async () => {
    await expect(
      verifyBearerToken("Bearer not-a-jwt"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a token whose issuer isn't configured for any known provider", async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("https://some-other-idp.example.com/")
      .setSubject("user-1")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(TEST_SECRET));

    await expect(verifyBearerToken(`Bearer ${token}`)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects an expired token", async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("pathway-test")
      .setSubject("user-1")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(TEST_SECRET));

    await expect(verifyBearerToken(`Bearer ${token}`)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects a token with a tampered signature", async () => {
    const token = await signTestToken({ sub: "user-1" });
    const tampered = token.slice(0, -4) + "aaaa";

    await expect(verifyBearerToken(`Bearer ${tampered}`)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects a token signed with the wrong secret", async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("pathway-test")
      .setSubject("user-1")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("wrong-secret"));

    await expect(verifyBearerToken(`Bearer ${token}`)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects a token missing the subject claim", async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("pathway-test")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(TEST_SECRET));

    await expect(verifyBearerToken(`Bearer ${token}`)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("never accepts a test-issuer token when no test secret is configured", async () => {
    const token = await signTestToken({ sub: "user-1" });
    delete process.env.TEST_AUTH_TOKEN_SECRET;

    await expect(verifyBearerToken(`Bearer ${token}`)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
