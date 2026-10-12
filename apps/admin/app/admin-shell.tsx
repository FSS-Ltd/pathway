"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/use-session-compat";
import { Menu, X, LifeBuoy } from "lucide-react";
import { APP_VERSION } from "@pathway/util/version";
import { TopBarActions } from "@/components/topbar-actions";
import { SidebarNav, TopBar } from "@pathway/ui";
import { useAdminAccess } from "@/lib/use-admin-access";
import { OnboardingModal } from "@/components/onboarding-modal";
import { useOrgUi } from "@/lib/use-org-ui";
import { orgLabel } from "@/lib/org-ui";
import { cn } from "@pathway/ui";
import { resolveAdminNavItems } from "./admin-navigation";

const getDevRuntimeState = () => {
  // Check if we have any API URL configured (supports both old and new env var names)
  const hasApiUrl = Boolean(
    process.env.NEXT_PUBLIC_API_URL || 
    process.env.NEXT_PUBLIC_API_BASE_URL
  );
  const isMockApi = !hasApiUrl;
  return { isMockApi };
};

const titleMap: Record<string, string> = {
  "/": "Today",
  "/dashboard": "Today",
  "/staff/profile": "Profile",
  "/people": "People",
  "/users": "People",
  "/children": "Children",
  "/parents": "Parents & Guardians",
  "/lessons": "Lessons",
  "/learning": "Learning",
  "/ace/pace": "PACE workflow",
  "/ace/behaviour": "Behaviour capture",
  "/classes": "Classes",
  "/sessions": "Sessions & Rota",
  "/my-schedule": "My schedule",
  "/attendance": "Attendance",
  "/guest-pass": "Guest pass",
  "/handover": "Next session handover",
  "/admin/handover": "Handover logs",
  "/notices": "Notices & Announcements",
  "/safeguarding": "Safeguarding",
  "/safeguarding/concerns/new": "Create concern",
  "/safeguarding/concerns": "Concern details",
  "/safeguarding/notes/new": "Create positive note",
  "/billing": "Billing & Usage",
  "/billing/buy-now": "Buy Now",
  "/admin/blog": "Blog",
  "/reports": "Reports & Insights",
  "/settings": "Settings & Organisation",
  "/settings/roles": "Roles & Access",
  "/feedback": "Feedback",
};

const resolveTitle = (path: string): string => {
  if (titleMap[path]) return titleMap[path];
  const topSegment = `/${path.split("/").filter(Boolean)[0] ?? ""}`;
  return titleMap[topSegment] ?? "Admin";
};

type AdminBrandLinkProps = {
  isCollapsed?: boolean;
  onClick?: () => void;
  /** Org's white-label logo. Falls back to the Nexsteps mark when absent or broken. */
  logoUrl?: string | null;
};

// Plain <img> (not next/image): logoUrl is a per-org Supabase URL not known at build
// time, and the admin app has no images.remotePatterns configured for it.
const BrandMark = ({ logoUrl, alt }: { logoUrl?: string | null; alt: string }) => {
  const [broken, setBroken] = React.useState(false);
  React.useEffect(() => setBroken(false), [logoUrl]);

  if (logoUrl && !broken) {
    return (
      <img
        src={logoUrl}
        alt={alt}
        width={32}
        height={32}
        className="h-8 w-8 rounded-md object-contain shadow-sm"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <Image
      src="/NSLogo.svg"
      alt={alt}
      width={32}
      height={32}
      className="rounded-md shadow-sm"
      priority
    />
  );
};

type FeedbackNavLinkProps = {
  isCollapsed?: boolean;
  isActive: boolean;
};

// Filled colored badge (vs. every other sidebar item's bare outline glyph) so this
// support/feedback entry point reads as visually distinct at a glance.
const FeedbackNavLink = ({ isCollapsed = false, isActive }: FeedbackNavLinkProps) => (
  <Link
    href="/feedback"
    title={isCollapsed ? "Feedback" : undefined}
    className={cn(
      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info focus-visible:ring-offset-2",
      isCollapsed && "justify-center",
      isActive ? "text-accent-strong" : "text-text-primary",
    )}
  >
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-status-info text-text-inverse">
      <LifeBuoy className="h-4 w-4" aria-hidden="true" />
    </span>
    {!isCollapsed && <span className="truncate">Feedback</span>}
  </Link>
);

const AppVersionTag = ({ isCollapsed = false }: { isCollapsed?: boolean }) =>
  isCollapsed ? null : (
    <span className="block px-3 pt-2 text-xs text-text-muted">v{APP_VERSION}</span>
  );

const AdminBrandLink = ({
  isCollapsed = false,
  onClick,
  logoUrl,
}: AdminBrandLinkProps) => (
  <Link
    href="/"
    onClick={onClick}
    className={cn(
      "group flex items-center gap-3 transition hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:ring-offset-2 focus-visible:ring-status-info",
      isCollapsed && "justify-center",
    )}
  >
    <BrandMark
      logoUrl={logoUrl}
      alt={isCollapsed ? "Nexsteps" : "Nexsteps Admin"}
    />
    {!isCollapsed && (
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-semibold tracking-tight text-text-primary">
          Nexsteps
        </span>
        <span className="text-xs text-text-muted">Admin</span>
      </div>
    )}
  </Link>
);

export const AdminShell: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const pathname = usePathname() || "/";
  const isAuthRoute = pathname === "/login";
  const { ui, logoUrl: orgLogoUrl } = useOrgUi();
  const title = orgLabel(ui, pathname, resolveTitle(pathname));
  const { isMockApi } = getDevRuntimeState();
  const { data: session } = useSession();

  // Only show mock banner if truly in mock mode
  const showMockBanner = isMockApi;

  // Get role information for access control
  const {
    role,
    currentOrgIsMasterOrg,
    capabilities,
    permissions,
    error: accessError,
    warning: accessWarning,
  } = useAdminAccess();

  // Org's white-label logo for the day-to-day brand swap, from OrgUiProvider.
  // Stays null pre-auth (login/accept-invite before sign-in), so those screens
  // keep the Nexsteps mark.

  // Collapsible sidebar state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = React.useState(false);
  const mobileMenuButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const mobileNavTitleId = "admin-mobile-navigation-title";
  const mobileNavPanelId = "admin-mobile-navigation";

  // Check if user needs onboarding (first login)
  // Show onboarding if user just logged in (firstLoginAt is recent, within last 5 minutes)
  const [showOnboarding, setShowOnboarding] = React.useState(false);
  const onboardingChecked = React.useRef(false);

  React.useEffect(() => {
    if (onboardingChecked.current || !session?.user) return;
    onboardingChecked.current = true;

    // Check if this is a first-time login
    // We'll check the session for a flag or check if name/displayName are missing
    const user = session.user as typeof session.user & {
      displayName?: string;
    };
    const needsOnboarding =
      !user.name?.trim() ||
      (!user.displayName?.trim() && user.email === user.displayName);

    if (needsOnboarding && !isAuthRoute) {
      setShowOnboarding(true);
    }
  }, [session, isAuthRoute]);

  React.useEffect(() => {
    setIsMobileNavOpen(false);
  }, [pathname]);

  const closeMobileNav = React.useCallback(() => {
    setIsMobileNavOpen(false);
    mobileMenuButtonRef.current?.focus();
  }, []);

  const handleMobileNavKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMobileNav();
    }
  };

  const isFeedbackActive =
    pathname === "/feedback" || pathname.startsWith("/feedback/");

  // Filter nav items based on user's role (hide billing for master orgs)
  const visibleNavItems = React.useMemo(
    () =>
      resolveAdminNavItems({
        role,
        currentOrgIsMasterOrg,
        capabilities,
        permissions,
        ui,
      }),
    [role, currentOrgIsMasterOrg, capabilities, permissions, ui],
  );

  if (isAuthRoute) {
    return <div className="min-h-screen bg-shell text-text-primary">{children}</div>;
  }

  return (
    <>
      {showOnboarding && (
        <OnboardingModal
          onComplete={() => {
            setShowOnboarding(false);
            // Refresh the page to get updated session data
            window.location.reload();
          }}
        />
      )}
      <div className="flex h-screen overflow-hidden bg-shell text-text-primary">
        <SidebarNav
          className="hidden lg:flex"
          items={visibleNavItems}
          currentPath={pathname}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          header={<AdminBrandLink isCollapsed={isSidebarCollapsed} logoUrl={orgLogoUrl} />}
          footer={
            <>
              <FeedbackNavLink isCollapsed={isSidebarCollapsed} isActive={isFeedbackActive} />
              <AppVersionTag isCollapsed={isSidebarCollapsed} />
            </>
          }
        />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-shell">
          <TopBar
            title={title}
            className="px-3 sm:px-4 md:px-6"
            breadcrumbs={
              <button
                ref={mobileMenuButtonRef}
                type="button"
                aria-label="Open admin navigation"
                aria-haspopup="dialog"
                aria-expanded={isMobileNavOpen}
                aria-controls={mobileNavPanelId}
                onClick={() => setIsMobileNavOpen(true)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-surface text-text-primary shadow-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info focus-visible:ring-offset-2 lg:hidden"
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </button>
            }
            rightSlot={<TopBarActions />}
          />
          <main className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
            <div
              className={cn(
                "mx-auto w-full space-y-4",
                pathname === "/sessions" ? "max-w-[90rem]" : "max-w-5xl",
              )}
            >
              {showMockBanner && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
                  Running in mock API mode - some data is sample only.
                </div>
              )}
              {accessError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900">
                  Role lookup failed: {accessError}
                </div>
              )}
              {accessWarning && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
                  Role lookup warning: {accessWarning}
                </div>
              )}
              {children}
            </div>
          </main>
        </div>
      </div>
      {isMobileNavOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby={mobileNavTitleId}
          id={mobileNavPanelId}
          onKeyDown={handleMobileNavKeyDown}
        >
          <button
            type="button"
            aria-label="Close admin navigation"
            className="absolute inset-0 h-full w-full bg-slate-950/40"
            onClick={closeMobileNav}
          />
          <div className="relative flex h-full w-[min(20rem,calc(100vw-2rem))] flex-col bg-surface shadow-2xl">
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-accent-secondary/30 px-3">
              <div id={mobileNavTitleId}>
                <AdminBrandLink onClick={closeMobileNav} logoUrl={orgLogoUrl} />
              </div>
              <button
                type="button"
                aria-label="Close admin navigation"
                onClick={closeMobileNav}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border-subtle bg-surface text-text-primary transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info focus-visible:ring-offset-2"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <SidebarNav
              className="!h-full !w-full border-r-0 shadow-none"
              items={visibleNavItems}
              currentPath={pathname}
              header={null}
              footer={
                <>
                  <FeedbackNavLink isActive={isFeedbackActive} />
                  <AppVersionTag />
                </>
              }
            />
          </div>
        </div>
      )}
    </>
  );
};
