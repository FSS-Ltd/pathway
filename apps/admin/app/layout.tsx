import React from "react";
import type { Metadata } from "next";
import { AdminShell } from "./admin-shell";
import { Providers } from "./providers";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexsteps Admin",
  description: "Nexsteps admin console for schools and youth organisations.",
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
      <body className="bg-shell">
        <Providers>
          <AdminShell>{children}</AdminShell>
        </Providers>
        <Toaster />
      </body>
    </html>
  );
}
