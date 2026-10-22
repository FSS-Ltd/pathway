"use client";

import { useEffect, useState } from "react";

type CheckoutReturnBridgeProps = {
  returnedFromCheckout: boolean;
};

export function CheckoutReturnBridge({
  returnedFromCheckout,
}: CheckoutReturnBridgeProps) {
  const [appLink, setAppLink] = useState<string | null>(null);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const attemptId = query.get("attempt_id") ?? query.get("checkout_attempt");
    if (!attemptId || !/^[0-9a-f-]{36}$/i.test(attemptId)) return;
    const deepLink = new URL("nexsteps://finance/payment-return");
    deepLink.searchParams.set("attemptId", attemptId);
    setAppLink(deepLink.toString());
  }, []);

  return (
    <main className="min-h-screen bg-shell px-5 py-12 text-text-primary">
      <section className="mx-auto flex max-w-xl flex-col gap-6 rounded-3xl border border-black/10 bg-white p-8 shadow-sm sm:p-10">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF7DA] text-xl"
          aria-hidden="true"
        >
          £
        </div>
        <div className="space-y-2">
          <p className="text-sm font-bold uppercase tracking-wide text-[#79621B]">
            Family Space
          </p>
          <h1 className="text-3xl font-bold">
            {returnedFromCheckout ? "Checking payment" : "Payment status"}
          </h1>
          <p className="text-base leading-7 text-black/65">
            NexSteps checks payment status with the school’s account. A checkout
            return alone does not confirm payment.
          </p>
        </div>
        <p className="rounded-2xl bg-[#FFF7DA] p-4 text-sm leading-6 text-black/75">
          If the payment is still processing, please don’t pay again. The
          school’s confirmation will appear in Family Space.
        </p>
        {appLink ? (
          <a
            href={appLink}
            className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#FFD166] px-5 py-3 text-center font-bold text-[#333] outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#26766A]"
          >
            Open NexSteps Family Space
          </a>
        ) : (
          <p role="status" className="text-sm text-black/65">
            Return to Family Space and refresh the invoice to check its latest
            status.
          </p>
        )}
        <p className="text-sm text-black/55">
          You can close this page and reopen the app later. Your invoice will
          keep its latest server-checked status.
        </p>
      </section>
    </main>
  );
}
