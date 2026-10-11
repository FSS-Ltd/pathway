export const CONVERSATION_KINDS = [
  "PARENT_STAFF",
  "STAFF_DIRECT",
  "STAFF_ROOM",
] as const;

export type ConversationKind = (typeof CONVERSATION_KINDS)[number];

interface RecipientFacts {
  userId: string;
  tenantId: string;
  isActive: boolean;
  isVisible: boolean;
}

export type RecipientCandidate = RecipientFacts &
  (
    | { relationship: "guardian"; hasCurrentChild: boolean }
    | { relationship: "staff" | "student" }
  );

export interface RecipientPolicyInput {
  kind: unknown;
  actor: RecipientCandidate;
  recipients: readonly RecipientCandidate[];
}

export type RecipientPolicyDecision =
  | { allowed: true; kind: ConversationKind }
  | {
      allowed: false;
      code:
        | "UNSUPPORTED_KIND"
        | "CROSS_TENANT_PARTICIPANT"
        | "DUPLICATE_PARTICIPANT"
        | "INACTIVE_PARTICIPANT"
        | "HIDDEN_PARTICIPANT"
        | "UNRELATED_CHILD"
        | "INVALID_PARTICIPANTS";
    };

function isConversationKind(kind: unknown): kind is ConversationKind {
  return (
    typeof kind === "string" && CONVERSATION_KINDS.some((item) => item === kind)
  );
}

export function canStartConversation(
  input: RecipientPolicyInput,
): RecipientPolicyDecision {
  if (!isConversationKind(input.kind)) {
    return { allowed: false, code: "UNSUPPORTED_KIND" };
  }

  const participants = [input.actor, ...input.recipients];
  if (participants.some((person) => person.tenantId !== input.actor.tenantId)) {
    return { allowed: false, code: "CROSS_TENANT_PARTICIPANT" };
  }
  if (
    new Set(participants.map((person) => person.userId)).size !==
    participants.length
  ) {
    return { allowed: false, code: "DUPLICATE_PARTICIPANT" };
  }
  if (participants.some((person) => !person.isActive)) {
    return { allowed: false, code: "INACTIVE_PARTICIPANT" };
  }
  if (participants.some((person) => !person.isVisible)) {
    return { allowed: false, code: "HIDDEN_PARTICIPANT" };
  }

  const guardians = participants.filter(
    (person) => person.relationship === "guardian",
  );
  const staff = participants.filter(
    (person) => person.relationship === "staff",
  );
  if (input.kind === "PARENT_STAFF") {
    if (
      guardians.length !== 1 ||
      staff.length < 1 ||
      guardians.length + staff.length !== participants.length
    ) {
      return { allowed: false, code: "INVALID_PARTICIPANTS" };
    }
    if (!guardians[0].hasCurrentChild) {
      return { allowed: false, code: "UNRELATED_CHILD" };
    }
  } else if (
    staff.length !== participants.length ||
    (input.kind === "STAFF_DIRECT" && staff.length !== 2) ||
    (input.kind === "STAFF_ROOM" && staff.length < 2)
  ) {
    return { allowed: false, code: "INVALID_PARTICIPANTS" };
  }

  return { allowed: true, kind: input.kind };
}
