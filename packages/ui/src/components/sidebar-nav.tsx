"use client";

import * as React from "react";
import {
  LayoutDashboard,
  Users,
  UserRound,
  GraduationCap,
  BookOpen,
  Layers,
  CalendarClock,
  CheckSquare,
  Megaphone,
  ShieldCheck,
  CreditCard,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../lib/cn";

export type SidebarNavItem = {
  label: string;
  href: string;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  /** Stable icon index (0–12) so filtered lists still get correct icons. */
  iconIndex?: number;
  /** Optional access requirement - if not met, item will be filtered out */
  access?: string;
};

export type SidebarNavProps = {
  items?: SidebarNavItem[];
  currentPath?: string;
  className?: string;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
};

// Icon components array - don't render here, render in component to avoid hydration issues
const iconComponents: LucideIcon[] = [
  LayoutDashboard,
  Users,
  GraduationCap,
  UserRound,
  BookOpen,
  Layers,
  CalendarClock,
  CheckSquare,
  Megaphone,
  ShieldCheck,
  CreditCard,
  BarChart3,
  Settings,
];

// Avoid JSX component identity mismatches when CI resolves lucide/react type versions differently.
const renderSidebarIcon = (Icon: LucideIcon, className: string) =>
  React.createElement(Icon as React.ElementType, {
    "aria-hidden": true,
    className,
  });

// Base items without icons - icons will be added in the component to avoid SSR hydration issues.
// iconIndex is stable so when admin filters by access, each item keeps the correct icon.
export const defaultSidebarItems: SidebarNavItem[] = [
  { label: "Dashboard", href: "/", icon: undefined, iconIndex: 0 },
  { label: "People", href: "/people", icon: undefined, iconIndex: 1 },
  { label: "Children", href: "/children", icon: undefined, iconIndex: 2 },
  { label: "Parents & Guardians", href: "/parents", icon: undefined, iconIndex: 3 },
  { label: "Lessons", href: "/lessons", icon: undefined, iconIndex: 4 },
  { label: "Classes", href: "/classes", icon: undefined, iconIndex: 5 },
  { label: "Sessions & Rota", href: "/sessions", icon: undefined, iconIndex: 6 },
  { label: "My schedule", href: "/my-schedule", icon: undefined, iconIndex: 7 },
  { label: "Attendance", href: "/attendance", icon: undefined, iconIndex: 8 },
  { label: "Notices & Announcements", href: "/notices", icon: undefined, iconIndex: 9 },
  { label: "Safeguarding", href: "/safeguarding", icon: undefined, iconIndex: 10 },
  { label: "Billing", href: "/billing", icon: undefined, iconIndex: 11 },
  { label: "Reports", href: "/reports", icon: undefined, iconIndex: 12 },
  { label: "Settings", href: "/settings", icon: undefined, iconIndex: 13 },
];

const isActive = (currentPath: string, href: string) =>
  currentPath === href || currentPath.startsWith(`${href}/`);

export const SidebarNav: React.FC<SidebarNavProps> = ({
  items = defaultSidebarItems,
  currentPath = "/",
  className,
  header,
  footer,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  // Track if component has mounted (client-side only)
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  // Add icons to items on client side only to avoid hydration mismatches.
  // Use item.iconIndex when present so filtered lists (e.g. by access) keep correct icons.
  const itemsWithIcons = React.useMemo(() => {
    return items.map((item, index) => {
      if (item.icon !== undefined && item.icon !== null) {
        return item;
      }
      if (!isMounted) {
        return { ...item, icon: null };
      }
      const iconIndex =
        typeof item.iconIndex === "number" && item.iconIndex >= 0 && item.iconIndex < iconComponents.length
          ? item.iconIndex
          : index;
      const IconComponent = iconComponents[iconIndex];
      return {
        ...item,
        icon: IconComponent ? renderSidebarIcon(IconComponent, "h-4 w-4") : null,
      };
    });
  }, [items, isMounted]);

  return (
    <nav
      aria-label="Admin navigation"
      className={cn(
        "flex h-screen flex-col border-r border-border-subtle bg-surface shadow-soft transition-[width] duration-200 ease-out",
        isCollapsed ? "w-16" : "w-64",
        className,
      )}
    >
      {/* Logo at the top, aligned with top bar */}
      {header ? (
        <div className={cn("flex h-16 shrink-0 items-center border-b border-accent-secondary/30 px-3", isCollapsed && "justify-center")}>
          {header}
        </div>
      ) : null}
      {/* Collapse button below logo */}
      {onToggleCollapse ? (
        <div className="px-2 py-2">
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!isCollapsed}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info focus-visible:ring-offset-2",
              isCollapsed && "justify-center border border-border-subtle bg-surface",
            )}
          >
            {isCollapsed ? (
              renderSidebarIcon(ChevronRight, "h-5 w-5 text-text-primary")
            ) : (
              <>
                {renderSidebarIcon(ChevronLeft, "h-4 w-4 text-text-muted")}
                <span className="text-xs text-text-muted">Collapse</span>
              </>
            )}
          </button>
        </div>
      ) : null}
      <div className="flex-1 overflow-y-auto px-3 py-6">
        <ul className="flex flex-col gap-1">
          {itemsWithIcons.map((item) => {
            const active = isActive(currentPath, item.href);
            return (
              <li key={item.href}>
                <a
                  href={item.href}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm font-medium text-text-primary transition-all duration-150 ease-out hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info focus-visible:ring-offset-2 motion-safe:hover:translate-x-0.5",
                    isCollapsed && "justify-center",
                    active
                      ? "bg-accent-subtle text-accent-strong"
                      : "hover:text-text-primary",
                  )}
                  title={isCollapsed ? item.label : undefined}
                >
                  <span className="flex items-center gap-2">
                    {item.icon}
                    {!isCollapsed && (
                      <span className="truncate">{item.label}</span>
                    )}
                  </span>
                  {!isCollapsed && (item.badge ?? null)}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
      {footer ? (
        <div className="border-t border-border-subtle pt-3 px-2">
          {footer}
        </div>
      ) : null}
    </nav>
  );
};
