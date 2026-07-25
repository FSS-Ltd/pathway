import Link from "next/link";

export default function BuyCancelledPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-16 md:py-20">
      <h1 className="text-3xl font-semibold text-pw-text">
        Checkout cancelled
      </h1>
      <p className="text-base text-pw-text-muted">
        Your Stripe checkout was cancelled. You can adjust your selections and
        try again, or contact us if you need help completing your purchase.
      </p>
      <div className="mt-4 flex gap-3">
        <Link
          href="/configure"
          className="rounded-md bg-pw-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600"
        >
          Start over
        </Link>
        <a
          href="mailto:support@nexsteps.dev?subject=Need%20help%20with%20Buy%20Now"
          className="rounded-md border border-pw-border px-4 py-2 text-sm font-medium text-pw-text transition hover:bg-white"
        >
          Contact support
        </a>
      </div>
    </main>
  );
}
