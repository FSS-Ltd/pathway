import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { FinanceAccessService } from "../../access/finance-access.service";
import type { EffectivePermissionsService } from "../../../access-control/effective-permissions.service";
const mockProfile = jest.fn();
const mockConnection = jest.fn();
const mockRls = jest.fn();
jest.mock("@pathway/db", () => ({
  withTenantRlsContext: (...args: unknown[]) => mockRls(...args),
}));
import { FinanceStatementNameService } from "../finance-statement-name.service";

describe("FinanceStatementNameService", () => {
  const actor = { tenantId: "tenant-a", orgId: "org-a", userId: "staff-a" };
  const profile = {
    id: "profile-a",
    legalEntityName: "Example School",
    countryCode: "GB",
  };
  const connection = {
    id: "connection-a",
    stripeAccountId: "acct_school_a",
    status: "READY",
    livemode: false,
  };
  const account = {
    id: "acct_school_a",
    descriptor: "EXAMPLE SCHOOL",
    prefix: null,
    country: "GB",
    livemode: false,
    dashboard: "full",
  };
  let access: { assertStaffAction: jest.Mock; resolveMode: jest.Mock };
  let permissions: { resolve: jest.Mock };
  let reader: { retrieve: jest.Mock };
  let service: FinanceStatementNameService;
  beforeEach(() => {
    jest.resetAllMocks();
    mockProfile.mockResolvedValue(profile);
    mockConnection.mockResolvedValue(connection);
    mockRls.mockImplementation(
      async (
        _tenant: string,
        _org: string,
        fn: (tx: unknown) => Promise<unknown>,
      ) =>
        fn({
          financeProfile: { findUnique: mockProfile },
          financeStripeConnection: { findFirst: mockConnection },
        }),
    );
    access = {
      assertStaffAction: jest.fn().mockResolvedValue(undefined),
      resolveMode: jest.fn().mockResolvedValue("ACTIVE"),
    };
    permissions = { resolve: jest.fn().mockResolvedValue({ allowed: true }) };
    reader = { retrieve: jest.fn().mockResolvedValue(account) };
    service = new FinanceStatementNameService(
      access as unknown as FinanceAccessService,
      permissions as unknown as EffectivePermissionsService,
      reader,
    );
  });
  it("reads the server-owned school account and returns provider evidence", async () => {
    await expect(service.get(actor)).resolves.toMatchObject({
      status: "CONNECTED",
      schoolName: "Example School",
      accountReference: "acct_school_a",
      descriptor: "EXAMPLE SCHOOL",
      canPrepare: true,
      checkedAt: expect.any(String),
    });
    expect(reader.retrieve).toHaveBeenCalledWith("acct_school_a");
    expect(mockRls).toHaveBeenCalledWith(
      "tenant-a",
      "org-a",
      expect.any(Function),
    );
    expect(mockConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          financeProfileId: "profile-a",
          tenantId: "tenant-a",
          orgId: "org-a",
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    );
  });
  it.each(["NOT_CONFIGURED", "NOT_CONNECTED", "DISCONNECTED"])(
    "does not access Stripe for %s",
    async (status) => {
      if (status === "NOT_CONFIGURED") mockProfile.mockResolvedValue(null);
      if (status === "NOT_CONNECTED") mockConnection.mockResolvedValue(null);
      if (status === "DISCONNECTED")
        mockConnection.mockResolvedValue({ ...connection, status });
      await expect(service.get(actor)).resolves.toEqual({ status });
      expect(reader.retrieve).not.toHaveBeenCalled();
    },
  );
  it("blocks locked or unauthorised access before data lookup", async () => {
    access.assertStaffAction.mockRejectedValue(new ForbiddenException());
    await expect(service.get(actor)).rejects.toThrow(ForbiddenException);
    expect(mockRls).not.toHaveBeenCalled();
    expect(reader.retrieve).not.toHaveBeenCalled();
  });
  it("blocks a revoked payment-read permission", async () => {
    permissions.resolve.mockResolvedValue({ allowed: false });
    await expect(service.get(actor)).rejects.toThrow(ForbiddenException);
    expect(reader.retrieve).not.toHaveBeenCalled();
  });
  it("rechecks permission and entitlement after the provider request", async () => {
    permissions.resolve
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false });
    await expect(service.get(actor)).rejects.toThrow(ForbiddenException);
    expect(reader.retrieve).toHaveBeenCalledTimes(1);
    expect(access.assertStaffAction).toHaveBeenCalledTimes(2);
  });
  it.each([
    { ...connection, status: "DISCONNECTED" },
    { ...connection, stripeAccountId: "acct_changed" },
    { ...connection, id: "another" },
  ])(
    "blocks a changed connection during the provider read",
    async (changed) => {
      mockConnection
        .mockResolvedValueOnce(connection)
        .mockResolvedValueOnce(changed);
      await expect(service.get(actor)).rejects.toThrow(ConflictException);
    },
  );
  it.each([
    { ...account, country: "NL" },
    { ...account, livemode: true },
    { ...account, id: "acct_other" },
    { ...account, dashboard: "express" },
  ])("rejects incompatible provider evidence", async (value) => {
    reader.retrieve.mockResolvedValue(value);
    await expect(service.get(actor)).rejects.toThrow(/unavailable|changed/);
  });
  it("allows servicing reads but disables draft preparation", async () => {
    access.resolveMode.mockResolvedValue("SERVICING_ONLY");
    await expect(service.get(actor)).resolves.toMatchObject({
      canPrepare: false,
    });
  });
  it("does not enable preparation for staff without management permission", async () => {
    permissions.resolve.mockImplementation(async ({ permission }) => ({
      allowed: permission === "finance.payments.read",
    }));
    await expect(service.get(actor)).resolves.toMatchObject({
      canPrepare: false,
    });
  });
  it("does not return data when Finance locks during the last policy check", async () => {
    access.resolveMode.mockResolvedValue("LOCKED");
    await expect(service.get(actor)).rejects.toThrow(ForbiddenException);
  });
  it("does not invent a saved value after provider failure", async () => {
    reader.retrieve.mockRejectedValue(new ServiceUnavailableException());
    await expect(service.get(actor)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
