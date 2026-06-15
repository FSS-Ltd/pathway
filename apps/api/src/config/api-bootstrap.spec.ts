import {
  createCorsOriginValidator,
  resolveApiListenOptions,
} from "./api-bootstrap";

const originalEnv = { ...process.env };

describe("api bootstrap config", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("allows same-origin/server requests and configured browser origins", () => {
    const validateOrigin = createCorsOriginValidator([
      "https://app.nexsteps.dev",
    ]);
    const callback = jest.fn();

    validateOrigin(undefined, callback);
    validateOrigin("https://app.nexsteps.dev", callback);

    expect(callback).toHaveBeenNthCalledWith(1, null, true);
    expect(callback).toHaveBeenNthCalledWith(2, null, true);
  });

  it("rejects unconfigured browser origins", () => {
    const validateOrigin = createCorsOriginValidator([
      "https://app.nexsteps.dev",
    ]);
    const callback = jest.fn();

    validateOrigin("https://evil.example", callback);

    expect(callback).toHaveBeenCalledWith(expect.any(Error), false);
    expect((callback.mock.calls[0]?.[0] as Error).message).toContain(
      "CORS origin not allowed",
    );
  });

  it("prefers API_PORT over PORT when resolving listen options", () => {
    process.env.API_PORT = "4000";
    process.env.PORT = "5000";
    process.env.API_BIND_HOST = "127.0.0.1";
    process.env.API_HOST = "api.example.test";

    expect(resolveApiListenOptions()).toEqual({
      bindHost: "127.0.0.1",
      host: "api.example.test",
      port: 4000,
    });
  });

  it("rejects invalid ports before binding the server", () => {
    process.env.API_PORT = "not-a-port";
    delete process.env.PORT;

    expect(() => resolveApiListenOptions()).toThrow("Invalid API port");
  });
});
