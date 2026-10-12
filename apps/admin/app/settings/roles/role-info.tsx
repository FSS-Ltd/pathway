"use client";

import React from "react";
import type { MatrixRole } from "@/lib/roles-access-api";

export function RoleInfo({ role }: { role: MatrixRole }) {
  const [open, setOpen] = React.useState(false);
  const tooltipId = React.useId();
  return (
    <span
      className="group relative inline-flex align-middle"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label={`About ${role.name}`}
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="inline-flex size-5 items-center justify-center rounded-full border border-border-subtle text-xs font-semibold text-text-muted hover:border-accent-primary hover:text-accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info"
      >
        i
      </button>
      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute bottom-full left-0 z-20 mb-2 w-64 rounded-lg border border-border-subtle bg-surface p-3 text-left text-xs font-normal leading-relaxed text-text-secondary shadow-lg"
        >
          <strong className="block text-sm font-semibold text-text-primary">
            {role.name}
          </strong>
          <span className="mt-1 block">
            {role.description || "Fixed platform role."}
          </span>
          <span className="mt-2 block">
            Scope: {role.scope === "site" ? "Selected site" : "Organisation"}
          </span>
          <span className="mt-1 block">
            {role.permissionKeys.length} mapped permission
            {role.permissionKeys.length === 1 ? "" : "s"}
          </span>
          <span className="mt-1 block break-words text-text-muted">
            {role.permissionKeys.slice(0, 4).join(", ") ||
              "No permissions mapped"}
            {role.permissionKeys.length > 4 ? " and more" : ""}
          </span>
        </span>
      )}
    </span>
  );
}
