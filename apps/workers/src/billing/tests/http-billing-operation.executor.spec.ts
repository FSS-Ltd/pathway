import { BillingOperationReviewError } from "../billing-worker.job";
import { HttpBillingOperationExecutor } from "../http-billing-operation.executor";

describe("HttpBillingOperationExecutor", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("dispatches only an operation identifier with internal authentication", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    global.fetch = fetchMock;
    const executor = new HttpBillingOperationExecutor(
      new URL("http://127.0.0.1:3000/"),
      "test-secret",
    );
    await executor.execute("operation-1");
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "http://127.0.0.1:3000/billing/institutional/internal/operations/operation-1",
      ),
      expect.objectContaining({
        method: "POST",
        headers: { "x-pathway-internal-secret": "test-secret" },
      }),
    );
  });

  it("classifies conflicts for review and server errors for retry", async () => {
    const executor = new HttpBillingOperationExecutor(
      new URL("http://127.0.0.1:3000/"),
      "test-secret",
    );
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 409 });
    await expect(executor.execute("operation-1")).rejects.toBeInstanceOf(
      BillingOperationReviewError,
    );
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(executor.execute("operation-1")).rejects.toThrow("HTTP 503");
  });

  it("rejects an insecure remote API URL before sending the internal secret", () => {
    expect(
      () =>
        new HttpBillingOperationExecutor(
          new URL("http://billing.example.test/"),
          "test-secret",
        ),
    ).toThrow("HTTPS or local HTTP");
  });

  it("preserves a configured API path prefix", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    global.fetch = fetchMock;
    const executor = new HttpBillingOperationExecutor(
      new URL("https://api.example.test/api"),
      "test-secret",
    );
    await executor.execute("operation-1");
    expect(fetchMock.mock.calls[0]?.[0].toString()).toBe(
      "https://api.example.test/api/billing/institutional/internal/operations/operation-1",
    );
  });
});
