import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Operations Toolkit | Nexsteps",
  description:
    "Download blank operational templates for attendance, incident and concern records, parent consent, volunteer onboarding, and weekly safeguarding checks.",
};

export default function ToolkitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
