"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { SessionProvider } from "@/lib/use-session-compat";
import { AdminContextProvider } from "@/lib/admin-context";
import { AdminShell } from "./admin-shell";
import { FamilyPortalShell } from "./family-portal-shell";

function RouteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (
    pathname?.startsWith("/family-invites/") ||
    pathname?.startsWith("/student-invites/")
  )
    return <>{children}</>;
  if (
    pathname === "/ace/family" ||
    pathname?.startsWith("/ace/family/") ||
    pathname?.startsWith("/ace/parent/") ||
    pathname?.startsWith("/ace/student/")
  ) {
    return <FamilyPortalShell>{children}</FamilyPortalShell>;
  }
  return (
    <AdminContextProvider>
      <AdminShell>{children}</AdminShell>
    </AdminContextProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <SessionProvider>
        <RouteShell>{children}</RouteShell>
      </SessionProvider>
    </ClerkProvider>
  );
}
