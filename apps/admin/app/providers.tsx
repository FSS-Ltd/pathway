"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { SessionProvider } from "@/lib/use-session-compat";
import { OrgUiProvider } from "@/lib/use-org-ui";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <SessionProvider>
        <OrgUiProvider>{children}</OrgUiProvider>
      </SessionProvider>
    </ClerkProvider>
  );
}
