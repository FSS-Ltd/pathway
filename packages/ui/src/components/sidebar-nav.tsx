"use client";

import * as React from "react";
import {
  LayoutDashboard,
  Users,
  UserRound,
  GraduationCap,
  BookOpen,
  BookMarked,
  Layers,
  CalendarClock,
  CheckSquare,
  ClipboardCheck,
  Megaphone,
  ShieldCheck,
  CreditCard,
  BarChart3,
  Settings,
  UserCircle,
  Ticket,
  ArrowLeftRight,
  History,
  AlertTriangle,
  Newspaper,
  KeyRound,
  Gauge,
  Award,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../lib/cn";

export type SidebarNavItem = {
  label: string;
  href: string;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  /** Stable icon index so filtered lists still get correct icons. */
  iconIndex?: number;
  /** Optional access requirement - if not met, item will be filtered out */
  access?: string;
  /** Items sharing a group render inside a collapsible accordion section; ungrouped items render as top-level links. */
  group?: string;
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

// Icon components array - don't render here, render in component to avoid hydration issues.
// Every entry must be unique; iconIndex is a stable pointer into this array so filtered
// lists (e.g. by access) keep the correct icon per destination.
const iconComponents: LucideIcon[] = [
  LayoutDashboard, // 0 Dashboard
  Users, // 1 People
  GraduationCap, // 2 Children
  UserRound, // 3 Parents & Guardians
  BookOpen, // 4 Lessons
  Layers, // 5 Classes
  CalendarClock, // 6 Sessions & Rota
  CheckSquare, // 7 My schedule
  ClipboardCheck, // 8 Attendance
  Megaphone, // 9 Notices & Announcements
  ShieldCheck, // 10 Safeguarding
  CreditCard, // 11 Billing
  BarChart3, // 12 Reports
  Settings, // 13 Settings
  UserCircle, // 14 Profile
  Ticket, // 15 Guest pass
  ArrowLeftRight, // 16 Handover
  History, // 17 Handover logs
  AlertTriangle, // 18 Create concern
  Newspaper, // 19 Blog
  BookMarked, // 20 Learning
  KeyRound, // 21 Roles & Access
  Gauge, // 22 PACE workflow
  Award, // 23 Behaviour capture
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

  // Bucket items by their `group`, preserving first-seen group order. Ungrouped
  // items (e.g. Dashboard) render as top-level links above the accordion sections.
  const { ungroupedItems, groups } = React.useMemo(() => {
    const ungroupedItems: typeof itemsWithIcons = [];
    const order: string[] = [];
    const byGroup = new Map<string, typeof itemsWithIcons>();
    for (const item of itemsWithIcons) {
      if (!item.group) {
        ungroupedItems.push(item);
        continue;
      }
      if (!byGroup.has(item.group)) {
        byGroup.set(item.group, []);
        order.push(item.group);
      }
      byGroup.get(item.group)!.push(item);
    }
    return {
      ungroupedItems,
      groups: order.map((label) => ({ label, items: byGroup.get(label)! })),
    };
  }, [itemsWithIcons]);

  // Open the section containing the current page by default; the rest start collapsed.
  const [openGroups, setOpenGroups] = React.useState<Set<string>>(() => {
    const activeGroup = groups.find((group) =>
      group.items.some((item) => isActive(currentPath, item.href)),
    );
    return new Set(activeGroup ? [activeGroup.label] : []);
  });

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  const renderNavItem = (item: (typeof itemsWithIcons)[number]) => {
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
            {!isCollapsed && <span className="truncate">{item.label}</span>}
          </span>
          {!isCollapsed && (item.badge ?? null)}
        </a>
      </li>
    );
  };

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
        {isCollapsed ? (
          // Collapsed rail has no room for group labels - show every item flat.
          <ul className="flex flex-col gap-1">{itemsWithIcons.map(renderNavItem)}</ul>
        ) : (
          <>
            {ungroupedItems.length > 0 && (
              <ul className="flex flex-col gap-1">{ungroupedItems.map(renderNavItem)}</ul>
            )}
            {groups.map((group) => {
              const isOpen = openGroups.has(group.label);
              const panelId = `sidebar-group-${group.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
              return (
                <div key={group.label} className="mt-2">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.label)}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    className="flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-muted transition-colors hover:bg-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info focus-visible:ring-offset-2"
                  >
                    <span>{group.label}</span>
                    {renderSidebarIcon(
                      ChevronDown,
                      cn("h-4 w-4 transition-transform duration-150", isOpen && "rotate-180"),
                    )}
                  </button>
                  {isOpen && (
                    <ul id={panelId} className="mt-1 flex flex-col gap-1">
                      {group.items.map(renderNavItem)}
                    </ul>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
      {footer ? (
        <div className="border-t border-border-subtle pt-3 px-2">
          {footer}
        </div>
      ) : null}
    </nav>
  );
};
