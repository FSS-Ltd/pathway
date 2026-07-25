"use client";

import { useState, useEffect } from "react";
import { OrderConfirmationModal } from "../../../components/order-confirmation-modal";

export default function BuyThanksPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    // Show modal after mount (confirmation that we reached this page successfully)
    setIsModalOpen(true);
  }, []);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-16 md:py-20">
      <h1 className="text-3xl font-semibold text-pw-text">
        Thank you - your subscription is being set up
      </h1>
      <p className="text-base text-pw-text-muted">
        We're processing your order via Stripe. You'll receive an email shortly.
        You can manage your plan in the Nexsteps admin under Billing once your
        subscription is active.
      </p>
      <div className="mt-4 flex gap-3">
        <a
          href="https://app.nexsteps.dev"
          className="rounded-md border border-pw-border px-4 py-2 text-sm font-medium text-pw-text transition hover:bg-white"
        >
          View billing
        </a>
        <a
          href="https://app.nexsteps.dev"
          className="rounded-md bg-pw-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600"
        >
          Go to admin
        </a>
      </div>

      <OrderConfirmationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </main>
  );
}
