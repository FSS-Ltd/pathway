import type { Metadata } from "next";
import TeamTrackerLanding from "./team-tracker-landing";

export const metadata: Metadata = {
  title: "Free One-Page Team Tracker",
  description:
    "A free Excel workbook for schools, youth groups, clubs, and charities to organise people, sessions, attendance, and follow-ups in one weekly view.",
};

export default function TeamTrackerPage() {
  return <TeamTrackerLanding />;
}
