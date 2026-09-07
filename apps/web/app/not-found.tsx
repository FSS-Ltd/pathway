import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page Not Found",
  robots: { index: false, follow: false },
};

export default function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-shell px-4 py-16">
      <div className="w-full max-w-2xl rounded-2xl border border-border-subtle bg-surface p-8 text-center shadow-card sm:p-12">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent-strong">
          404
        </p>
        <h1 className="mt-3 text-4xl font-bold text-text-primary sm:text-5xl">
          Page not found
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-lg text-text-muted">
          The address may have changed, or the page may no longer be available.
          Choose a useful place to continue.
        </p>
        <nav
          aria-label="Page recovery"
          className="mt-8 flex flex-wrap justify-center gap-3"
        >
          <Link
            href="/"
            className="rounded-md bg-accent-primary px-5 py-3 font-medium text-white transition hover:bg-accent-strong"
          >
            Go to homepage
          </Link>
          <Link
            href="/blog"
            className="rounded-md border border-border-subtle px-5 py-3 font-medium text-text-primary transition hover:bg-muted"
          >
            Browse guides
          </Link>
          <Link
            href="/demo"
            className="rounded-md border border-border-subtle px-5 py-3 font-medium text-text-primary transition hover:bg-muted"
          >
            Book a demo
          </Link>
        </nav>
      </div>
    </main>
  );
}
