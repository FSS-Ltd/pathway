import type { PacePolicyCode } from "../../../lib/api/pace-policy";

export type PacePolicyFeedback = {
  tone: "warning" | "block";
  message: string;
};

export function getPacePolicyFeedback(policy: {
  decision: "warn" | "block";
  code: PacePolicyCode;
}): PacePolicyFeedback {
  return {
    tone: policy.decision === "block" ? "block" : "warning",
    message: pacePolicyMessage(policy.code),
  };
}

export function createPaceSubmissionGate(): {
  run: (operation: () => Promise<void>) => Promise<boolean>;
} {
  let pending = false;

  return {
    async run(operation) {
      if (pending) return false;
      pending = true;
      try {
        await operation();
        return true;
      } finally {
        pending = false;
      }
    },
  };
}

function pacePolicyMessage(code: PacePolicyCode): string {
  switch (code) {
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
