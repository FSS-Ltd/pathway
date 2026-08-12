import React from "react";
import { Badge } from "@pathway/ui";
import type { AdminPacePolicyResult } from "@/lib/api-client";

export function PolicyResultCallout({
  policy,
}: {
  policy: Pick<AdminPacePolicyResult, "decision" | "code">;
}) {
  if (policy.decision === "allow") return null;
  const content = policyCopy(policy);
  const isBlock = policy.decision === "block";

  return (
    <div
      className={`rounded-md border p-3 ${
        isBlock
          ? "border-status-danger/30 bg-status-danger/5"
          : "border-status-warning/30 bg-status-warning/5"
      }`}
      role={isBlock ? "alert" : "status"}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={isBlock ? "danger" : "warning"}>
          {isBlock ? "Blocked by policy" : "Policy warning"}
        </Badge>
        <p className="text-sm text-text-primary">{content}</p>
      </div>
    </div>
  );
}

function policyCopy(
  policy: Pick<AdminPacePolicyResult, "decision" | "code">,
): string {
  switch (policy.code) {
    case "score-below-threshold":
      return "The score is below the site threshold. The assessment was recorded without progression.";
    case "daily-limit":
      return "This learner has reached the site’s daily assessment limit.";
    case "duplicate-self-test":
      return "A Self Test for this PACE has already been recorded.";
    case "same-pace-same-day":
      return "The site policy does not allow another assessment for this PACE today.";
    case "progression-blocked":
      return "The assessment does not meet the learner’s current progression requirements.";
    case "override-required":
      return "A separately authorised policy override is required before recording this assessment.";
    case "allowed":
      return "The assessment was accepted by the active site policy.";
  }
}
