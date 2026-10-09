import React from "react";
import Link from "next/link";
import type { FamilyTimetableScope } from "@/lib/family-timetable-api";

export function familyTimetableHref(
  scope: FamilyTimetableScope,
  view: "sessions" | "subjects",
): string {
  const site = encodeURIComponent(scope.siteId);
  const base =
    scope.kind === "student"
      ? `/ace/student/sites/${site}`
      : `/ace/parent/sites/${site}/children/${encodeURIComponent(scope.childId)}`;
  return `${base}/${view === "sessions" ? "timetable" : "subject-timetable"}`;
}

export function FamilyTimetableNavigation({
  scope,
  current,
}: {
  scope: FamilyTimetableScope;
  current: "sessions" | "subjects";
}) {
  return (
    <nav aria-label="Timetable views" className="flex flex-wrap gap-2">
      {(["subjects", "sessions"] as const).map((view) => (
        <Link
          key={view}
          href={familyTimetableHref(scope, view)}
          aria-current={current === view ? "page" : undefined}
          className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong ${
            current === view
              ? "border-accent-strong bg-accent-subtle text-text-primary"
              : "border-border-subtle bg-surface text-text-primary hover:border-accent-strong"
          }`}
        >
          {view === "subjects" ? "Subject timetable" : "Sessions"}
        </Link>
      ))}
    </nav>
  );
}
