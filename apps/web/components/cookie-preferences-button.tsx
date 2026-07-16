"use client";

import { clearConsent } from "../lib/cookie-consent";

export default function CookiePreferencesButton() {
  const reset = () => {
    clearConsent();
    window.location.reload();
  };

  return (
    <button
      type="button"
      onClick={reset}
      className="mt-3 rounded-md border border-pw-border bg-white px-4 py-2 text-sm font-medium text-pw-text transition hover:bg-pw-surface"
    >
      Change my cookie choice
    </button>
  );
}
