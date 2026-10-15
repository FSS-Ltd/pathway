"use client";
import React from "react";
import { Button } from "@pathway/ui";
export const fieldClass =
  "mt-1 block min-h-11 min-w-0 w-full max-w-full rounded-lg border border-border-subtle bg-surface p-3 text-text-primary";
export function Action(props: React.ComponentProps<typeof Button>) {
  return (
    <Button
      {...props}
      className={`min-h-11 h-auto max-w-full whitespace-normal break-words py-2 text-text-primary ${props.className ?? ""}`}
    />
  );
}
export function useAgreementRequest() {
  const controller = React.useRef(new AbortController());
  React.useEffect(() => {
    controller.current = new AbortController();
    return () => controller.current.abort();
  }, []);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  async function run(
    action: (signal: AbortSignal) => Promise<void>,
    message = "",
  ) {
    setBusy(true);
    setError("");
    setSuccess("");
    const signal = controller.current.signal;
    try {
      await action(signal);
      if (!signal.aborted) setSuccess(message);
    } catch (e) {
      if (!signal.aborted)
        setError(
          e instanceof Error ? e.message : "Request failed. Please retry.",
        );
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  return { busy, error, success, run };
}
export function Feedback({
  busy,
  error,
  success,
}: {
  busy: boolean;
  error: string;
  success: string;
}) {
  return (
    <>
      {busy && <p role="status">Working…</p>}
      {error && <p role="alert">{error}</p>}
      {success && <p role="status">{success}</p>}
    </>
  );
}
