import type { Dispatch, SetStateAction } from "react";

type PreflightMode = "idle" | "checking" | "EXISTING_USER" | "NEW_USER";
type Props = {
  parentPortalEnabled: boolean;
  preflightMode: PreflightMode;
  runPreflight: () => Promise<void>;
  setPreflightMode: Dispatch<SetStateAction<PreflightMode>>;
  parentName: string;
  setParentName: Dispatch<SetStateAction<string>>;
  parentEmail: string;
  setParentEmail: Dispatch<SetStateAction<string>>;
  parentPassword: string;
  setParentPassword: Dispatch<SetStateAction<string>>;
  parentPasswordConfirm: string;
  setParentPasswordConfirm: Dispatch<SetStateAction<string>>;
  parentPhone: string;
  setParentPhone: Dispatch<SetStateAction<string>>;
  parentRelationship: string;
  setParentRelationship: Dispatch<SetStateAction<string>>;
};
export function GuardianSignupSection({
  parentPortalEnabled,
  preflightMode,
  runPreflight,
  setPreflightMode,
  parentName,
  setParentName,
  parentEmail,
  setParentEmail,
  parentPassword,
  setParentPassword,
  parentPasswordConfirm,
  setParentPasswordConfirm,
  parentPhone,
  setParentPhone,
  parentRelationship,
  setParentRelationship,
}: Props) {
  return (
    <section className="rounded-xl border border-pw-border bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold text-pw-text">
        Parent / Guardian
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-pw-text">
            Full name *
          </label>
          <input
            type="text"
            required
            value={parentName}
            onChange={(e) => setParentName(e.target.value)}
            className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-pw-text">
            Email *
          </label>
          <input
            type="email"
            required
            value={parentEmail}
            onChange={(e) => {
              setParentEmail(e.target.value);
              setPreflightMode("idle");
            }}
            onBlur={parentPortalEnabled ? runPreflight : undefined}
            className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
          />
          {parentPortalEnabled && preflightMode === "checking" ? (
            <p className="mt-1 text-xs text-pw-text-muted">Checking…</p>
          ) : null}
        </div>
        {parentPortalEnabled ? (
          <div>
            <label className="block text-sm font-medium text-pw-text">
              {preflightMode === "EXISTING_USER"
                ? "Your password *"
                : "Password *"}
            </label>
            <input
              type="password"
              required
              value={parentPassword}
              onChange={(e) => setParentPassword(e.target.value)}
              placeholder={
                preflightMode === "EXISTING_USER"
                  ? "Enter your password to link your children"
                  : "At least 8 characters with a letter and number"
              }
              className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
            />
            {preflightMode === "EXISTING_USER" ? (
              <p className="mt-1 text-xs text-pw-text-muted">
                This email is already registered. Enter your password to
                continue.
              </p>
            ) : (
              <p className="mt-1 text-xs text-pw-text-muted">
                You&apos;ll use this to sign in after registration.
              </p>
            )}
          </div>
        ) : null}
        {parentPortalEnabled && preflightMode !== "EXISTING_USER" ? (
          <div>
            <label className="block text-sm font-medium text-pw-text">
              Confirm password *
            </label>
            <input
              type="password"
              required
              value={parentPasswordConfirm}
              onChange={(e) => setParentPasswordConfirm(e.target.value)}
              placeholder="Re-enter your password"
              className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
            />
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-pw-text">
            Phone *
          </label>
          <input
            type="tel"
            required
            value={parentPhone}
            onChange={(e) => setParentPhone(e.target.value)}
            className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-pw-text">
            Relationship to child(ren)
          </label>
          <input
            type="text"
            value={parentRelationship}
            onChange={(e) => setParentRelationship(e.target.value)}
            placeholder="e.g. Parent, Guardian"
            className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
          />
        </div>
      </div>
    </section>
  );
}
