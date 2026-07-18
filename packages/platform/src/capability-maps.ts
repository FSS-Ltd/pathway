import type { Vertical, Module } from "@prisma/client";
import type { Capability } from "./types";

// Starter capabilities (domain.action per dev-doc §4). The exact capability→nav
// contract is refined in Phase 2; adding a Vertical/Module enum value without a
// mapping breaks the build (Record) and the completeness test below.
export const VERTICAL_CAPABILITIES: Record<Vertical, Capability[]> = {
  CHURCH: [
    "attendance.read",
    "attendance.manage",
    "volunteers.manage",
    "giving.manage",
    "calendar.read",
  ],
  INDEPENDENT_SCHOOL: [
    "attendance.read",
    "attendance.manage",
    "students.manage",
    "classes.manage",
    "parents.read",
    "reports.read",
  ],
  ACE_SCHOOL: [
    "attendance.read",
    "attendance.manage",
    "students.manage",
    "classes.manage",
    "pace.manage",
    "parents.read",
    "reports.read",
  ],
  STATE_SCHOOL: [
    "attendance.read",
    "attendance.manage",
    "students.manage",
    "classes.manage",
    "parents.read",
    "reports.read",
  ],
  NURSERY: [
    "attendance.read",
    "attendance.manage",
    "children.manage",
    "parents.read",
  ],
  CHARITY: [
    "attendance.read",
    "attendance.manage",
    "volunteers.manage",
    "calendar.read",
  ],
  CLUB: [
    "attendance.read",
    "attendance.manage",
    "members.manage",
    "calendar.read",
  ],
};

export const MODULE_CAPABILITIES: Record<Module, Capability[]> = {
  FINANCE: ["finance.invoices", "finance.payments", "finance.reports"],
  EVENTS: ["events.booking", "events.manage"],
  TRANSPORT: ["transport.routes", "transport.manage"],
  MEALS: ["meals.manage", "meals.orders"],
  ASSET_MANAGEMENT: ["assets.manage", "assets.audit"],
  HR: ["hr.staff", "hr.leave"],
  AI_WORKSPACE: ["ai.workspace"],
  ADVANCED_REPORTING: ["reporting.advanced"],
};
