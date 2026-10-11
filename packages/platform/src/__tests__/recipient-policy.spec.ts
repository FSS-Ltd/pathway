import {
  canStartConversation,
  type ConversationKind,
  type RecipientCandidate,
} from "../messaging/recipient-policy";

type AssertFalse<T extends false> = T;
type NoStudentDirectKind = AssertFalse<
  "STUDENT_DIRECT" extends ConversationKind ? true : false
>;
const noStudentDirectKind: NoStudentDirectKind = false;
void noStudentDirectKind;

const guardian: RecipientCandidate = {
  userId: "guardian",
  tenantId: "school-a",
  relationship: "guardian",
  isActive: true,
  isVisible: true,
  hasCurrentChild: true,
};
const staff: RecipientCandidate = {
  userId: "teacher",
  tenantId: "school-a",
  relationship: "staff",
  isActive: true,
  isVisible: true,
};
const colleague: RecipientCandidate = { ...staff, userId: "colleague" };

describe("messaging recipient policy", () => {
  it("allows a linked guardian with a visible responder and current staff conversations", () => {
    expect(
      canStartConversation({
        kind: "PARENT_STAFF",
        actor: guardian,
        recipients: [staff],
      }),
    ).toEqual({
      allowed: true,
      kind: "PARENT_STAFF",
    });
    for (const kind of ["STAFF_DIRECT", "STAFF_ROOM"] as const) {
      expect(
        canStartConversation({ kind, actor: staff, recipients: [colleague] }),
      ).toEqual({
        allowed: true,
        kind,
      });
    }
  });

  it.each([
    ["STUDENT_DIRECT", guardian, [staff], "UNSUPPORTED_KIND"],
    [
      "PARENT_STAFF",
      guardian,
      [{ ...staff, tenantId: "school-b" }],
      "CROSS_TENANT_PARTICIPANT",
    ],
    [
      "PARENT_STAFF",
      guardian,
      [{ ...staff, userId: guardian.userId }],
      "DUPLICATE_PARTICIPANT",
    ],
    [
      "PARENT_STAFF",
      { ...guardian, isActive: false },
      [staff],
      "INACTIVE_PARTICIPANT",
    ],
    [
      "PARENT_STAFF",
      guardian,
      [{ ...staff, isVisible: false }],
      "HIDDEN_PARTICIPANT",
    ],
    [
      "PARENT_STAFF",
      { ...guardian, hasCurrentChild: false },
      [staff],
      "UNRELATED_CHILD",
    ],
    ["STAFF_DIRECT", staff, [guardian], "INVALID_PARTICIPANTS"],
    [
      "STAFF_DIRECT",
      staff,
      [{ ...colleague, relationship: "student" }],
      "INVALID_PARTICIPANTS",
    ],
    ["STAFF_ROOM", staff, [], "INVALID_PARTICIPANTS"],
  ] as const)(
    "rejects %s participant policy violations",
    (kind, actor, recipients, code) => {
      expect(canStartConversation({ kind, actor, recipients })).toEqual({
        allowed: false,
        code,
      });
    },
  );
});
