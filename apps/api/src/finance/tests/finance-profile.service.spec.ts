import { ConflictException } from "@nestjs/common";
import type { Prisma } from "@pathway/db";

const mockFinanceProfileFindUnique = jest.fn();
const mockFinanceProfileCreate = jest.fn();
const mockFinanceProfileUpdate = jest.fn();
const mockInvoiceCount = jest.fn();
const mockCreditNoteCount = jest.fn();
const mockReceiptCount = jest.fn();
const mockStripeConnectionCount = jest.fn();
const mockBankTransferChangeCount = jest.fn();
const mockStatementCount = jest.fn();
const mockQueryRaw = jest.fn();
const mockWithTenantRlsContext = jest.fn();
const mockKnownRequestErrorClass = class extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
};

jest.mock("@pathway/db", () => ({
  Prisma: { PrismaClientKnownRequestError: mockKnownRequestErrorClass },
  withTenantRlsContext: mockWithTenantRlsContext,
}));

import type { FinanceAccessService } from "../access/finance-access.service";
import type { FinanceRequestActor } from "../finance-controller-support";
import { FinanceProfileService } from "../finance-profile.service";

describe("FinanceProfileService", () => {
  const actor: FinanceRequestActor = {
    tenantId: "tenant-a",
    orgId: "org-a",
    userId: "staff-a",
  };
  const settings = {
    legalEntityName: "Dutch School",
    countryCode: "NL" as const,
    currency: "EUR" as const,
  };

  let service: FinanceProfileService;
  let financeAccess: { assertStaffAction: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    const tx = {
      $queryRaw: mockQueryRaw,
      financeProfile: {
        findUnique: mockFinanceProfileFindUnique,
        create: mockFinanceProfileCreate,
        update: mockFinanceProfileUpdate,
      },
      financeInvoice: { count: mockInvoiceCount },
      financeCreditNote: { count: mockCreditNoteCount },
      financeReceipt: { count: mockReceiptCount },
      financeStripeConnection: { count: mockStripeConnectionCount },
      financeBankTransferChange: { count: mockBankTransferChangeCount },
      financeStatement: { count: mockStatementCount },
    };
    mockWithTenantRlsContext.mockImplementation(
      async (
        _tenantId: string,
        _orgId: string,
        callback: (client: Prisma.TransactionClient) => Promise<unknown>,
      ) => callback(tx as unknown as Prisma.TransactionClient),
    );
    mockFinanceProfileFindUnique.mockResolvedValue({
      id: "profile-a",
      legalEntityName: "British School",
      countryCode: "GB",
      currency: "GBP",
    });
    mockFinanceProfileCreate.mockResolvedValue(settings);
    mockFinanceProfileUpdate.mockResolvedValue(settings);
    mockQueryRaw.mockResolvedValue([{ id: "profile-a" }]);
    for (const count of [
      mockInvoiceCount,
      mockCreditNoteCount,
      mockReceiptCount,
      mockStripeConnectionCount,
      mockBankTransferChangeCount,
      mockStatementCount,
    ]) {
      count.mockResolvedValue(0);
    }
    financeAccess = {
      assertStaffAction: jest.fn().mockResolvedValue(undefined),
    };
    service = new FinanceProfileService(
      financeAccess as unknown as FinanceAccessService,
    );
  });

  it("saves a Dutch legal country with its EUR invoice currency", async () => {
    await expect(service.saveSettings(actor, settings)).resolves.toEqual(
      settings,
    );

    expect(mockWithTenantRlsContext).toHaveBeenCalledWith(
      "tenant-a",
      "org-a",
      expect.any(Function),
    );
    expect(mockFinanceProfileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "profile-a" },
        data: settings,
      }),
    );
  });

  it("creates a profile with the selected country and currency", async () => {
    mockFinanceProfileFindUnique.mockResolvedValue(null);
    mockQueryRaw.mockResolvedValue([]);

    await expect(service.saveSettings(actor, settings)).resolves.toEqual(
      settings,
    );

    expect(mockFinanceProfileCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          tenantId: "tenant-a",
          orgId: "org-a",
          ...settings,
        },
      }),
    );
  });

  it("locks country and currency after Finance activity", async () => {
    mockInvoiceCount.mockResolvedValue(1);

    await expect(service.saveSettings(actor, settings)).rejects.toThrow(
      ConflictException,
    );
    expect(mockFinanceProfileUpdate).not.toHaveBeenCalled();
  });

  it("allows an idempotent save after settings are locked", async () => {
    mockFinanceProfileFindUnique.mockResolvedValue({
      id: "profile-a",
      ...settings,
    });
    mockInvoiceCount.mockResolvedValue(1);

    await expect(service.saveSettings(actor, settings)).resolves.toEqual(
      settings,
    );
    expect(mockInvoiceCount).not.toHaveBeenCalled();
    expect(mockFinanceProfileUpdate).not.toHaveBeenCalled();
  });
});
