const mockDownloadAsync = jest.fn();
const mockDeleteAsync = jest.fn();
const mockShareAsync = jest.fn();
const mockIsAvailableAsync = jest.fn();

jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///finance-cache/",
  downloadAsync: (...args: unknown[]) => mockDownloadAsync(...args),
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
}));

jest.mock("expo-sharing", () => ({
  shareAsync: (...args: unknown[]) => mockShareAsync(...args),
  isAvailableAsync: (...args: unknown[]) => mockIsAvailableAsync(...args),
}));

jest.mock("@/config/env", () => ({
  env: { apiUrl: "https://api.example.test" },
}));

jest.mock("@/lib/api/client", () => ({
  apiClient: { getAccessToken: () => "payer-token" },
  ApiError: class ApiError extends Error {
    readonly status: number;
    readonly body: string;

    constructor(message: string, status: number, body: string) {
      super(message);
      this.status = status;
      this.body = body;
    }
  },
}));

import { downloadFamilyDocument } from "./family-finance-api";

describe("downloadFamilyDocument", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteAsync.mockResolvedValue(undefined);
    mockIsAvailableAsync.mockResolvedValue(true);
    mockShareAsync.mockResolvedValue(undefined);
  });

  it("uses the signed-in payer token and removes the private PDF after sharing", async () => {
    mockDownloadAsync.mockResolvedValue({
      uri: "file:///finance-cache/invoice.pdf",
      status: 200,
    });

    await downloadFamilyDocument("/finance/invoice.pdf", "invoice.pdf");

    expect(mockDownloadAsync).toHaveBeenCalledWith(
      "https://api.example.test/finance/invoice.pdf",
      "file:///finance-cache/invoice.pdf",
      {
        headers: {
          Accept: "application/pdf",
          Authorization: "Bearer payer-token",
          "Cache-Control": "no-store",
        },
      },
    );
    expect(mockShareAsync).toHaveBeenCalledWith(
      "file:///finance-cache/invoice.pdf",
      expect.objectContaining({ mimeType: "application/pdf" }),
    );
    expect(mockDeleteAsync).toHaveBeenCalledWith(
      "file:///finance-cache/invoice.pdf",
      { idempotent: true },
    );
  });

  it.each([401, 403])(
    "preserves an authorization denial (%s) and removes the unshared file",
    async (status) => {
      mockDownloadAsync.mockResolvedValue({
        uri: "file:///finance-cache/invoice.pdf",
        status,
      });
      await expect(
        downloadFamilyDocument("/finance/invoice.pdf", "invoice.pdf"),
      ).rejects.toMatchObject({ status });
      expect(mockShareAsync).not.toHaveBeenCalled();
      expect(mockDeleteAsync).toHaveBeenCalledWith(
        "file:///finance-cache/invoice.pdf",
        { idempotent: true },
      );
    },
  );

  it("removes a partial file if the download fails", async () => {
    mockDownloadAsync.mockRejectedValue(new Error("Network unavailable"));

    await expect(
      downloadFamilyDocument("/finance/invoice.pdf", "invoice.pdf"),
    ).rejects.toThrow("Network unavailable");
    expect(mockDeleteAsync).toHaveBeenCalledWith(
      "file:///finance-cache/invoice.pdf",
      { idempotent: true },
    );
  });
});
