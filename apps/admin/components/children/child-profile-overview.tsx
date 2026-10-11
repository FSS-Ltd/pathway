import * as React from "react";
import { Badge, Card } from "@pathway/ui";
import type { AdminChildDetail } from "../../lib/api-client";

function Flag({
  active,
  label,
  variant,
}: {
  active: boolean;
  label: string;
  variant: "warning" | "accent" | "success";
}) {
  return (
    <Badge variant={active ? variant : "default"}>
      {active ? label : `No ${label.toLowerCase()}`}
    </Badge>
  );
}

export function ChildProfileOverview({
  detail,
  personLabel,
}: {
  detail: AdminChildDetail;
  personLabel: string;
}) {
  return (
    <section
      id="overview"
      aria-labelledby="profile-overview-heading"
      className="scroll-mt-6"
    >
      <Card className="p-6">
        <h2
          id="profile-overview-heading"
          className="text-lg font-bold text-text-primary"
        >
          Overview
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Key information for this {personLabel.toLowerCase()}.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-surface-alt p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Primary group
            </p>
            <p className="mt-1 font-semibold text-text-primary">
              {detail.primaryGroupLabel ?? "Unassigned"}
            </p>
          </div>
          <div className="rounded-lg bg-surface-alt p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Age group
            </p>
            <p className="mt-1 font-semibold text-text-primary">
              {detail.ageGroupLabel ?? "Not recorded"}
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2" aria-label="Profile flags">
          <Flag
            active={detail.hasAllergies}
            label="Allergies"
            variant="warning"
          />
          <Flag
            active={detail.hasAdditionalNeeds}
            label="Additional needs"
            variant="accent"
          />
          <Flag
            active={detail.hasPhotoConsent}
            label="Organisation photo/video consent"
            variant="success"
          />
        </div>
        <p className="mt-3 text-sm text-text-muted">
          Internal profile photos are separate from organisation photo/video
          consent.
        </p>
      </Card>
    </section>
  );
}
