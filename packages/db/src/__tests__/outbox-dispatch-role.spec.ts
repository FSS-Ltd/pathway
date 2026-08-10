import {
  grantOutboxDispatchRole,
  outboxDispatchRoleFromDatabaseUrl,
} from "../outbox-dispatch-role";

describe("outbox dispatch database role grant", () => {
  it("uses the runtime URL role with a safely quoted GRANT", async () => {
    const execute = jest.fn().mockResolvedValue(0);

    await grantOutboxDispatchRole(
      { $executeRawUnsafe: execute },
      "postgresql://outbox%22worker:password@db.example/pathway",
    );

    expect(execute).toHaveBeenCalledWith(
      'GRANT EXECUTE ON FUNCTION app.list_due_outbox_org_ids() TO "outbox""worker"',
    );
  });

  it("rejects a runtime URL without a database role", () => {
    expect(() =>
      outboxDispatchRoleFromDatabaseUrl("postgresql:///pathway"),
    ).toThrow("OUTBOX_DISPATCH_DATABASE_URL must include a database role");
  });
});
