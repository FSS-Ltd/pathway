import {
  PaceRequestRlsRoleLease,
  type RlsRoleDatabaseClient,
} from "./pace-request-rls-role-lease";

function client(): jest.Mocked<RlsRoleDatabaseClient> {
  return {
    $executeRawUnsafe: jest.fn(),
    $disconnect: jest.fn(),
  };
}

describe("PaceRequestRlsRoleLease", () => {
  it("restores the database default role when setup disconnect fails after ALTER ROLE", async () => {
    const requestClient = client();
    const bootstrapClient = client();
    requestClient.$disconnect.mockRejectedValueOnce(new Error("disconnect failed"));
    const lease = new PaceRequestRlsRoleLease({
      enabled: true,
      bootstrapRole: "pathway_test_user",
      restrictedRole: "pathway_e2e_tenant_rls",
      requestClient,
      createBootstrapClient: () => bootstrapClient,
    });

    await expect(lease.enable()).rejects.toThrow("disconnect failed");

    await lease.restore();

    expect(bootstrapClient.$executeRawUnsafe).toHaveBeenCalledWith(
      'ALTER ROLE "pathway_test_user" RESET role',
    );
    expect(bootstrapClient.$disconnect).toHaveBeenCalledTimes(1);
  });
});
