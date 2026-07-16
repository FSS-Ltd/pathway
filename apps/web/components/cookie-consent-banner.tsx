"use client";

import { useEffect, useState } from "react";
import GoogleAnalytics from "./google-analytics";
import { getStoredConsent, storeConsent, type ConsentValue } from "../lib/cookie-consent";

export default function CookieConsentBanner() {
  const [consent, setConsent] = useState<ConsentValue | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setConsent(getStoredConsent());
    setReady(true);
  }, []);

  const respond = (value: ConsentValue) => {
    storeConsent(value);
    setConsent(value);
  };

  return (
    <>
      {consent === "accepted" && <GoogleAnalytics />}

      {ready && consent === null && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border-subtle bg-surface px-4 py-4 shadow-card md:px-8">
          <div className="mx-auto flex max-w-5xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-text-muted">
              We use analytics cookies, including Google Analytics, to understand how Nexsteps is used.
              See our <a href="/cookies" className="underline">Cookie Policy</a> for details.
            </p>
            <div className="flex shrink-0 gap-3">
              <button
                type="button"
                onClick={() => respond("rejected")}
                className="rounded-md border border-border-subtle bg-surface px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-muted"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={() => respond("accepted")}
                className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-accent-strong"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
