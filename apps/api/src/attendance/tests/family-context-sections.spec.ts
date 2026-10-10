import { parentSectionsForSite } from "../family-context-sections";

describe("family section navigation", () => {
  const active = new Set([
    "ace.parent.notices.read",
    "messaging.conversations.read",
    "messaging.messages.read",
  ]);

  it("offers parent inboxes and ACE volunteering when readers are available", () => {
    expect(parentSectionsForSite(active, false, true)).toEqual([
      "attendance",
      "sessions",
      "subject-timetable",
      "notices",
      "messages",
      "volunteering",
    ]);
  });

  it("hides disabled inboxes and non-ACE volunteering", () => {
    expect(
      parentSectionsForSite(
        new Set(["messaging.conversations.read"]),
        false,
        false,
      ),
    ).toEqual(["attendance", "sessions", "subject-timetable"]);
  });

  it("does not advertise parent inboxes to an account with a student identity", () => {
    expect(parentSectionsForSite(active, true, true)).toEqual([
      "attendance",
      "sessions",
      "subject-timetable",
      "volunteering",
    ]);
  });
});
