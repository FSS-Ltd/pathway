import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { Prisma } from "@pathway/db";
import type { FinanceAccessService } from "../../access/finance-access.service";
import type { FinanceAccessScope } from "../../access/finance-access.reader";
import type { FinanceStripeConnectConfig } from "../finance-stripe-connect.config";
import type { FinanceStripeConnectProvider } from "../finance-stripe-connect.provider";

const mockProfileFindUnique = jest.fn();
const mockConnectionFindFirst = jest.fn();
const mockConnectionCreate = jest.fn();
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
    financeProfileId: "profile-a";
    id: "connection-a";
    stripeAccountId: string | null;
    status: "CONNECTING" | "READY" | "RESTRICTED" | "DISCONNECTED";
    livemode: false;
    disconnectedAt: Date | null;
    disconnectedByUserId: string | null;
  } = {
    financeProfileId: "profile-a",
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
    mockProfileFindUnique.mockResolvedValue({
      id: "profile-a",
      legalEntityName: "NexSteps Test School",
      countryCode: "GB",
    });
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
            create: mockConnectionCreate,
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
      {
        id: "connection-a",
        status: "CONNECTING",
        livemode: false,
        countryCode: "GB",
      },
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
      {
        id: "connection-a",
        status: "DISCONNECTED",
        livemode: false,
        countryCode: "GB",
      },
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

  it("requires saved school country and currency settings before Stripe onboarding", async () => {
    mockProfileFindUnique.mockResolvedValue(null);

    await expect(service.createOnboardingLink(actor)).rejects.toThrow(
      BadRequestException,
    );
    expect(provider.createAccount).not.toHaveBeenCalled();
    expect(provider.createOnboardingLink).not.toHaveBeenCalled();
  });

  it("creates the connected account in the school's saved country", async () => {
    mockProfileFindUnique.mockResolvedValue({
      id: "profile-a",
      legalEntityName: "Dutch School",
      countryCode: "NL",
    });
    currentConnection = { ...currentConnection, stripeAccountId: null };
    provider.createAccount.mockResolvedValue({
      id: "acct_test_school",
      livemode: false,
      country: "NL",
      cardPaymentsStatus: "pending",
    });
    provider.retrieveAccount.mockResolvedValue({
      id: "acct_test_school",
      livemode: false,
      country: "NL",
      cardPaymentsStatus: "pending",
    });
    provider.createOnboardingLink.mockResolvedValue({
      url: "https://connect.stripe.com/test-onboarding",
      expiresAt: "2026-10-19T18:00:00.000Z",
    });

    await service.createOnboardingLink(actor);

    expect(provider.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        legalEntityName: "Dutch School",
        countryCode: "NL",
      }),
    );
  });

  it("locks the Finance profile before creating its first Stripe connection", async () => {
    mockProfileFindUnique.mockResolvedValue({
      id: "profile-a",
      legalEntityName: "Dutch School",
      countryCode: "NL",
    });
    mockConnectionFindFirst.mockResolvedValueOnce(null);
    mockConnectionRawQuery.mockResolvedValue([{ id: "profile-a" }]);
    mockConnectionCreate.mockResolvedValue({
      ...connection,
      id: "connection-new",
      financeProfileId: "profile-a",
      stripeAccountId: null,
    });
    provider.createAccount.mockResolvedValue({
      id: "acct_test_school",
      livemode: false,
      country: "NL",
      cardPaymentsStatus: "pending",
    });
    provider.retrieveAccount.mockResolvedValue({
      id: "acct_test_school",
      livemode: false,
      country: "NL",
      cardPaymentsStatus: "pending",
    });
    provider.createOnboardingLink.mockResolvedValue({
      url: "https://connect.stripe.com/test-onboarding",
      expiresAt: "2026-10-19T18:00:00.000Z",
    });

    await service.createOnboardingLink(actor);

    expect(mockConnectionRawQuery).toHaveBeenCalledTimes(1);
    expect(mockConnectionRawQuery.mock.invocationCallOrder[0]).toBeLessThan(
      mockConnectionCreate.mock.invocationCallOrder[0],
    );
  });
});
