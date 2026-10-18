import { ForbiddenException } from "@nestjs/common";
import type { Prisma } from "@pathway/db";
import type { FinanceAccessService } from "../../access/finance-access.service";
import type { FinanceAccessScope } from "../../access/finance-access.reader";
import type { FinanceStripeConnectConfig } from "../finance-stripe-connect.config";
import type { FinanceStripeConnectProvider } from "../finance-stripe-connect.provider";

const mockProfileFindUnique = jest.fn();
const mockConnectionFindFirst = jest.fn();
const mockConnectionUpdateMany = jest.fn();
const mockConnectionRawQuery = jest.fn();
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

import { FinanceStripeConnectionService } from "../finance-stripe-connection.service";

describe("FinanceStripeConnectionService", () => {
  const actor = {
    tenantId: "tenant-a",
    orgId: "org-a",
    userId: "staff-a",
  } satisfies FinanceAccessScope & { userId: string };
  const config: FinanceStripeConnectConfig = {
    mode: "test",
    secretKey: "sk_test_unit_fixture",
    returnUrl: "https://school.example/return",
    refreshUrl: "https://school.example/refresh",
  };
  const connection: {
    id: "connection-a";
    stripeAccountId: "acct_test_school";
    status: "CONNECTING" | "READY" | "RESTRICTED" | "DISCONNECTED";
    livemode: false;
    disconnectedAt: Date | null;
    disconnectedByUserId: string | null;
  } = {
    id: "connection-a",
    stripeAccountId: "acct_test_school",
    status: "CONNECTING",
    livemode: false,
    disconnectedAt: null,
    disconnectedByUserId: null,
  };

  let currentConnection: typeof connection;
  let service: FinanceStripeConnectionService;
  let access: { assertStaffAction: jest.Mock };
  let provider: {
    createAccount: jest.Mock;
    createOnboardingLink: jest.Mock;
    retrieveAccount: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    currentConnection = { ...connection };
    mockProfileFindUnique.mockResolvedValue({ id: "profile-a" });
    mockConnectionFindFirst.mockImplementation(async () => currentConnection);
    mockConnectionUpdateMany.mockImplementation(async ({ data }) => {
      currentConnection = { ...currentConnection, ...data };
      return { count: 1 };
    });
    mockWithTenantRlsContext.mockImplementation(
      async (
        _tenantId: string,
        _orgId: string,
        callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
      ) =>
        callback({
          financeProfile: { findUnique: mockProfileFindUnique },
          financeStripeConnection: {
            findFirst: mockConnectionFindFirst,
            updateMany: mockConnectionUpdateMany,
          },
          $queryRaw: mockConnectionRawQuery,
        } as unknown as Prisma.TransactionClient),
    );

    access = { assertStaffAction: jest.fn().mockResolvedValue(undefined) };
    provider = {
      createAccount: jest.fn(),
      createOnboardingLink: jest.fn(),
      retrieveAccount: jest.fn().mockResolvedValue({
        id: "acct_test_school",
        livemode: false,
        country: "GB",
        cardPaymentsStatus: "active",
      }),
    };
    service = new FinanceStripeConnectionService(
      access as unknown as FinanceAccessService,
      config,
      provider as unknown as FinanceStripeConnectProvider,
    );
  });

  it("enables collection only after Stripe confirms active card payments", async () => {
    await expect(service.refresh(actor)).resolves.toEqual({
      status: "READY",
      livemode: false,
      canCollect: true,
      disconnectedAt: null,
    });
    expect(provider.retrieveAccount).toHaveBeenCalledWith("acct_test_school");
    expect(mockConnectionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "READY" } }),
    );
  });

  it("stops future collection after staff disconnects the account", async () => {
    currentConnection = { ...currentConnection, status: "READY" };

    await expect(service.disconnect(actor)).resolves.toMatchObject({
      status: "DISCONNECTED",
      canCollect: false,
      livemode: false,
    });
    expect(mockConnectionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "connection-a" }),
        data: expect.objectContaining({
          status: "DISCONNECTED",
          disconnectedByUserId: "staff-a",
          disconnectedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("refreshes the latest Stripe account state for a webhook under a row lock", async () => {
    mockConnectionRawQuery.mockResolvedValue([
      { id: "connection-a", status: "CONNECTING", livemode: false },
    ]);

    await service.refreshFromWebhook("tenant-a", "org-a", "acct_test_school");

    expect(provider.retrieveAccount).toHaveBeenCalledWith("acct_test_school");
    expect(mockConnectionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "connection-a",
          tenantId: "tenant-a",
          orgId: "org-a",
          status: { not: "DISCONNECTED" },
        }),
        data: { status: "READY" },
      }),
    );
  });

  it("does not revive a disconnected connection from a delayed webhook", async () => {
    mockConnectionRawQuery.mockResolvedValue([
      { id: "connection-a", status: "DISCONNECTED", livemode: false },
    ]);

    await service.refreshFromWebhook("tenant-a", "org-a", "acct_test_school");

    expect(provider.retrieveAccount).not.toHaveBeenCalled();
    expect(mockConnectionUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses collection-account changes when Finance is in servicing mode", async () => {
    access.assertStaffAction.mockRejectedValue(
      new ForbiddenException("Finance action unavailable"),
    );

    await expect(service.refresh(actor)).rejects.toThrow(ForbiddenException);
    expect(provider.retrieveAccount).not.toHaveBeenCalled();
    expect(mockConnectionFindFirst).not.toHaveBeenCalled();
  });
});
