import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import GoogleAnalytics from "../components/google-analytics";
import "./globals.css";

const baseUrl = "https://nexsteps.dev";
const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  variable: "--font-nunito",
});

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "Nexsteps - Connected Operations Platform",
    template: "%s | Nexsteps",
  },
  description:
    "Nexsteps helps schools, clubs, churches, and charities run attendance, teams, family communication, safeguarding, and reporting from one connected system.",
  alternates: {
    canonical: baseUrl,
  },
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
        {children}
        <GoogleAnalytics />
      </body>
    </html>
  );
}
