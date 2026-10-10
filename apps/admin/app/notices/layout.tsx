"use client";

import { usePathname } from "next/navigation";
import { useAdminAccess } from "@/lib/use-admin-access";
import { canAccessRoute } from "@/lib/permissions";
import { hasPermission, isSiteAdminOrHigher } from "@/lib/access";
import { NoAccessCard } from "@/components/no-access-card";

export default function NoticesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "/notices";
  const { role, permissions, isLoading } = useAdminAccess();
  const canAccess =
    canAccessRoute(pathname, role) &&
    hasPermission(permissions, "notices.read") &&
    (pathname === "/notices" ||
      (isSiteAdminOrHigher(role) &&
        hasPermission(permissions, "notices.manage")));

  if (isLoading) return null;
  if (!canAccess) {
    return (
      <NoAccessCard
        title="Notices & Announcements"
        message="You do not have access to notices for this site."
      />
    );
  }
  return <>{children}</>;
}
