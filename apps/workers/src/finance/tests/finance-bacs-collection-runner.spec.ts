import {
  loadFinanceBacsCollectionEndpoint,
  runFinanceBacsCollection,
} from "../finance-bacs-collection-runner";

describe("Finance Bacs collection worker configuration", () => {
  it("accepts only the secure internal run-due endpoint", () => {
    expect(
      loadFinanceBacsCollectionEndpoint({
        FINANCE_BACS_COLLECTION_JOB_URL:
          "https://api.example.test/internal/finance/bacs/run-due",
        FINANCE_BACS_COLLECTION_JOB_SECRET: "job-secret",
      }),
    ).toEqual({
      url: "https://api.example.test/internal/finance/bacs/run-due",
      secret: "job-secret",
    });
    expect(() =>
      loadFinanceBacsCollectionEndpoint({
        FINANCE_BACS_COLLECTION_JOB_URL:
          "http://api.example.test/internal/finance/bacs/run-due",
        FINANCE_BACS_COLLECTION_JOB_SECRET: "job-secret",
      }),
    ).toThrow("must target the secure Bacs collection endpoint");
  });

  it("rejects incomplete or redirected endpoint configuration", () => {
    expect(() =>
      loadFinanceBacsCollectionEndpoint({
        FINANCE_BACS_COLLECTION_JOB_SECRET: "job-secret",
      }),
    ).toThrow("FINANCE_BACS_COLLECTION_JOB_URL is required");
    expect(() =>
      loadFinanceBacsCollectionEndpoint({
        FINANCE_BACS_COLLECTION_JOB_URL:
          "https://api.example.test/internal/finance/bacs/run-due?redirect=https://other.test",
        FINANCE_BACS_COLLECTION_JOB_SECRET: "job-secret",
      }),
    ).toThrow("must target the secure Bacs collection endpoint");
  });
});

describe("runFinanceBacsCollection", () => {
  const endpoint = {
    url: "https://api.example.test/internal/finance/bacs/run-due",
    secret: "job-secret",
  };

  it("dispatches the job with the internal secret and validates the result", async () => {
    const fetcher = jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            scopes: 2,
            invoicesGenerated: 1,
            debitsSubmitted: 1,
            debitsPending: 0,
            debitsFailed: 0,
          }),
          { status: 200 },
        ),
    );

    await expect(runFinanceBacsCollection(endpoint, fetcher)).resolves.toEqual({
      scopes: 2,
      invoicesGenerated: 1,
      debitsSubmitted: 1,
      debitsPending: 0,
      debitsFailed: 0,
    });
    expect(fetcher).toHaveBeenCalledWith(
      endpoint.url,
      expect.objectContaining({
        method: "POST",
        body: "{}",
        redirect: "error",
        headers: {
          "content-type": "application/json",
          "x-pathway-internal-secret": "job-secret",
        },
      }),
    );
  });

  it("rejects an invalid response and non-success status", async () => {
    await expect(
      runFinanceBacsCollection(
        endpoint,
        jest.fn(async () => new Response("{}", { status: 200 })),
      ),
    ).rejects.toThrow("returned an invalid result");
    await expect(
      runFinanceBacsCollection(
        endpoint,
        jest.fn(async () => new Response("", { status: 503 })),
      ),
    ).rejects.toThrow("endpoint returned 503");
  });
});
