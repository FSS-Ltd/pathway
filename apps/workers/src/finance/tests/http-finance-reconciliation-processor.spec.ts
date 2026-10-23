import { HttpFinanceReconciliationProcessor } from "../http-finance-reconciliation-processor";
const work = {
  tenantId: "tenant",
  orgId: "org",
  connectionId: "00000000-0000-4000-8000-000000000001",
  stream: "events" as const,
};
const summary = {
  mode: "sync",
  status: "completed",
  pages: 1,
  objects: 2,
  recoverable: 1,
  exceptions: 0,
};
function setup(body: unknown) {
  const fetcher = jest
    .fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>()
    .mockResolvedValue(Response.json(body));
  return {
    fetcher,
    processor: new HttpFinanceReconciliationProcessor(
      new URL("https://api.example.test/api"),
      "synthetic-secret",
      fetcher,
    ),
  };
}
describe("internal scoped Finance recovery HTTP", () => {
  it("sends only scoped identifiers to the authenticated endpoint with bounded timeout and no redirects", async () => {
    const { processor, fetcher } = setup(summary);
    await expect(processor.run(work, "sync")).resolves.toEqual(summary);
    expect(fetcher).toHaveBeenCalledWith(
      new URL(
        "https://api.example.test/api/internal/finance/reconciliation/run",
      ),
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        signal: expect.any(AbortSignal),
        headers: {
          "content-type": "application/json",
          "x-pathway-internal-secret": "synthetic-secret",
        },
        body: JSON.stringify({ ...work, mode: "sync" }),
      }),
    );
  });
  it.each([
    { ...summary, mode: "dry-run" },
    { ...summary, pages: 2 },
    { ...summary, objects: -1 },
    { ...summary, status: "success" },
  ])("rejects invalid mode, counts or outcomes", async (body) => {
    await expect(setup(body).processor.run(work, "sync")).rejects.toThrow();
  });
  it("accepts explicit API servicing-disabled responses without inventing successful pages", async () => {
    await expect(
      setup({ mode: "sync", status: "disabled" }).processor.run(work, "sync"),
    ).resolves.toEqual({
      mode: "sync",
      status: "disabled",
      pages: 0,
      objects: 0,
      recoverable: 0,
      exceptions: 0,
    });
  });
  it.each([
    "http://api.example.test",
    "https://user:password@api.example.test",
    "https://api.example.test?token=x",
    "https://api.example.test#fragment",
  ])("rejects unsafe internal URLs", (url) => {
    expect(
      () =>
        new HttpFinanceReconciliationProcessor(
          new URL(url),
          "synthetic-secret",
        ),
    ).toThrow();
  });
});
