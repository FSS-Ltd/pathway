import * as React from "react";
import { Card } from "@pathway/ui";

const sections = [
  { id: "overview", label: "Overview" },
  { id: "details", label: "Details" },
  { id: "guardians", label: "Contacts" },
  { id: "registration", label: "Registration" },
  { id: "attendance", label: "Attendance" },
] as const;

export function ChildProfileNavigation({
  showAttendance,
  showRegistration = false,
}: {
  showAttendance: boolean;
  showRegistration?: boolean;
}) {
  return (
    <Card className="p-2">
      <nav
        aria-label="Profile sections"
        className="flex flex-wrap gap-1 sm:flex-nowrap"
      >
        {sections
          .filter(
            ({ id }) =>
              (id !== "attendance" || showAttendance) &&
              (id !== "registration" || showRegistration),
          )
          .map(({ id, label }) => (
            <a
              key={id}
              href={`#${id}`}
              className="shrink-0 rounded-md px-4 py-2 text-sm font-semibold text-text-muted hover:bg-surface-alt hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-strong"
            >
              {label}
            </a>
          ))}
      </nav>
    </Card>
  );
}
