import { parseFinanceRecoveryCliArgs } from "../finance-recovery-cli-args";
const args = [
  "--tenant",
  "school",
  "--org",
  "organisation",
  "--connection",
  "11111111-1111-4111-8111-111111111111",
  "--stream",
  "events",
];
describe("reconciliation CLI arguments", () => {
  it("defaults to dry run and maps an explicit apply to sync", () => {
    expect(parseFinanceRecoveryCliArgs(args)).toEqual({
      kind: "run",
      request: {
        tenantId: "school",
        orgId: "organisation",
        connectionId: args[5],
        stream: "events",
        mode: "dry-run",
      },
    });
    expect(parseFinanceRecoveryCliArgs([...args, "--apply"])).toMatchObject({
      request: { mode: "sync" },
    });
    expect(parseFinanceRecoveryCliArgs([...args, "--dry-run"])).toMatchObject({
      request: { mode: "dry-run" },
    });
  });
  it("shows help without requiring scope", () => {
    expect(parseFinanceRecoveryCliArgs(["--help"])).toEqual({ kind: "help" });
  });
  it.each(
    [
      [],
      [...args, "--apply", "--dry-run"],
      [...args, "--apply", "--apply"],
      [...args, "--stream", "refunds"],
      [...args, "--secret", "private"],
      [...args.slice(0, -1)],
      [...args.slice(0, -1), "invalidStream"],
      [...args.slice(0, 5), "not-a-uuid", ...args.slice(6)],
      [...args, "--help"],
    ].map((value) => ({ value })),
  )(
    "rejects ambiguous or malformed input without echoing scope or secrets",
    ({ value }) => {
      expect(() => parseFinanceRecoveryCliArgs(value)).toThrow(
        "Invalid reconciliation arguments",
      );
    },
  );
});
