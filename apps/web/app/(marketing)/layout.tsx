import Image from "next/image";
import Link from "next/link";
import AnalyticsProvider from "../../components/analytics-provider";
import Footer from "../../components/footer";
import HeaderNav from "../../components/header-nav";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <AnalyticsProvider />
      <div className="sticky top-4 z-50 px-4">
        <header className="mx-auto flex max-w-7xl items-center justify-between rounded-xl border border-border-subtle bg-surface px-4 py-3 shadow-md md:px-6 md:py-4">
          <Link
            href="/"
            className="flex items-center gap-2 transition hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:ring-offset-2 focus-visible:ring-status-info"
          >
            <Image
              src="/favicon.svg"
              alt=""
              width={32}
              height={32}
              className="h-8 w-8"
              priority
            />
            <span className="text-xl font-bold text-text-primary">NexSteps</span>
          </Link>
          <div className="relative">
            <HeaderNav />
          </div>
        </header>
      </div>
      <main className="flex-1 bg-shell">{children}</main>
      <Footer />
    </div>
  );
}
