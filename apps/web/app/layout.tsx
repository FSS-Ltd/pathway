import type { Metadata } from "next";
import GoogleAnalytics from "../components/google-analytics";
import "./globals.css";

const baseUrl = "https://nexsteps.dev";

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
    icon: "/NSLogo.svg",
    shortcut: "/NSLogo.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-shell text-text-primary">
        {children} 
        <GoogleAnalytics />
      </body>
    </html>
  );
}
