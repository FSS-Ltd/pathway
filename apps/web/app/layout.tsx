import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import CookieConsentBanner from "../components/cookie-consent-banner";
import JsonLd from "../components/seo/json-ld";
import { organizationJsonLd, SITE_ORIGIN } from "../lib/seo";
import "./globals.css";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  variable: "--font-nunito",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: "Nexsteps | Connected Operations Software",
    template: "%s | Nexsteps",
  },
  description:
    "Nexsteps helps schools, clubs, churches, and charities run attendance, teams, family communication, safeguarding, and reporting from one connected system.",
  robots:
    process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production"
      ? { index: false, follow: false }
      : { index: true, follow: true },
  icons: {
    icon: [{ url: "/NSLogo.svg", type: "image/svg+xml" }],
    shortcut: ["/NSLogo.svg"],
    apple: [{ url: "/NSLogo.svg" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${nunito.variable} bg-shell text-text-primary`}>
        <JsonLd data={organizationJsonLd()} />
        {children}
        <CookieConsentBanner />
      </body>
    </html>
  );
}
