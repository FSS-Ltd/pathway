import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { act } from "react";

import * as behaviourApi from "@/lib/api/behaviour";
import { BehaviourStageReview } from "./behaviour-stage-review";
import { isValidSiteDate, siteToday } from "./behaviour-time";

const timeZone = "America/Los_Angeles";
const child = { id: "child-1", displayName: "Jordan Smith" };
const originalEntryId = "11111111-1111-4111-8111-111111111111";
const reviewId = "22222222-2222-4222-8222-222222222222";

const status = (): behaviourApi.DemeritStatus => ({
  childId: child.id,
  date: siteToday(timeZone),
  policyVersion: 4,
  stage: 1,
  stageLabel: "Stage 1",
  action: "review",
  requiresNote: true,
  headReview: true,
  manualStage: null,
  manualExpiresAt: null,
});

const review: behaviourApi.BehaviourReviewRequest = {
  id: reviewId,
  childId: child.id,
  behaviourEntryId: originalEntryId,
  demeritStageOverrideId: null,
  kind: "HEAD",
  stage: 3,
  policyVersion: 4,
  requestedAt: "2026-10-10T10:00:00.000Z",
};

const correctedFact: behaviourApi.BehaviourEntry = {
  id: "33333333-3333-4333-8333-333333333333",
  childId: child.id,
  category: "conduct",
  categoryPolicyVersion: 4,
  categoryIsSerious: false,
  type: "DEMERIT",
  visibility: "SENSITIVE",
  pointsDelta: -2,
  occurredAt: "2026-10-10T09:00:00.000Z",
  recordedByUserId: "reviewer-1",
  reason: "Current corrected reason",
  note: "Restricted follow-up",
  correctsBehaviourEntryId: originalEntryId,
  createdAt: "2026-10-10T09:05:00.000Z",
};

beforeEach(() => {
  jest
    .spyOn(behaviourApi, "fetchDemeritStatus")
    .mockImplementation(async () => status());
  jest.spyOn(behaviourApi, "fetchBehaviourReviewRequests").mockResolvedValue({
    items: [review],
    nextCursor: null,
  });
  jest.spyOn(behaviourApi, "fetchBehaviourReviewFact").mockResolvedValue({
    entry: correctedFact,
  });
  jest.spyOn(behaviourApi, "createDemeritOverride").mockResolvedValue({
    id: "override-1",
    stage: 2,
    expiresAt: "2026-10-11T07:00:00.000Z",
    duplicate: false,
  });
});

afterEach(() => jest.restoreAllMocks());

function view(canSensitive = true, canManagePolicy = true) {
  return (
    <BehaviourStageReview
      children={[child]}
      siteTimeZone={timeZone}
      canSensitive={canSensitive}
      canManagePolicy={canManagePolicy}
      accessLoading={false}
      refreshKey={0}
    />
  );
}

describe("BehaviourStageReview", () => {
  it("shows the scoped stage, validates escalation, and refreshes after saving", async () => {
    const screen = render(view());
    fireEvent.press(screen.getByText(child.displayName));

    await waitFor(() => expect(screen.getByText("Stage 1")).toBeTruthy());
    expect(screen.getByText(/Head review is required/)).toBeTruthy();
    expect(behaviourApi.fetchDemeritStatus).toHaveBeenCalledWith(
      child.id,
      siteToday(timeZone),
    );
    await waitFor(() =>
      expect(screen.getByText("Save escalation")).toBeTruthy(),
    );

    fireEvent.press(screen.getByText("Save escalation"));
    expect(
      screen.getByText("Enter a reason for this escalation."),
    ).toBeTruthy();
    fireEvent.changeText(
      screen.getByLabelText("Escalation reason"),
      "Repeated concern",
    );
    fireEvent.press(screen.getByText("Save escalation"));
    await waitFor(() =>
      expect(screen.getByText("Escalation saved.")).toBeTruthy(),
    );
    expect(behaviourApi.createDemeritOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        childId: child.id,
        stage: 2,
        expectedPolicyVersion: 4,
        reason: "Repeated concern",
      }),
    );
    expect(behaviourApi.fetchDemeritStatus).toHaveBeenCalledTimes(2);
  });

  it("opens the corrected fact and clears it after permission loss", async () => {
    const screen = render(view());
    fireEvent.press(screen.getByText(child.displayName));
    await waitFor(() =>
      expect(screen.getByText("View current fact")).toBeTruthy(),
    );
    fireEvent.press(screen.getByText("View current fact"));
    await waitFor(() =>
      expect(screen.getByText("Current corrected reason")).toBeTruthy(),
    );
    expect(screen.getByText("Restricted follow-up")).toBeTruthy();
    expect(behaviourApi.fetchBehaviourReviewFact).toHaveBeenCalledWith(
      reviewId,
    );

    screen.rerender(view(false, false));
    expect(screen.queryByText("Current corrected reason")).toBeNull();
    expect(screen.getByText(/Stage details require sensitive/)).toBeTruthy();
  });

  it("clears the stage when opening a fact detects revoked access", async () => {
    let resolveStatus:
      | ((value: behaviourApi.DemeritStatus | null) => void)
      | null = null;
    jest.spyOn(behaviourApi, "fetchDemeritStatus").mockReturnValue(
      new Promise((resolve) => {
        resolveStatus = resolve;
      }),
    );
    jest
      .spyOn(behaviourApi, "fetchBehaviourReviewFact")
      .mockRejectedValue(
        new behaviourApi.BehaviourApiError("Denied", 403, null),
      );
    const screen = render(view());
    fireEvent.press(screen.getByText(child.displayName));
    await waitFor(() =>
      expect(screen.getByText("View current fact")).toBeTruthy(),
    );
    fireEvent.press(screen.getByText("View current fact"));
    await waitFor(() =>
      expect(
        screen.getByText("Stage access is no longer available."),
      ).toBeTruthy(),
    );
    expect(screen.queryByText("Stage 1")).toBeNull();
    expect(screen.queryByText("Current corrected reason")).toBeNull();
    await act(async () => resolveStatus?.(status()));
    expect(screen.queryByText("Stage 1")).toBeNull();
  });

  it("hides manager actions when the fixed reviewer check is denied", async () => {
    jest
      .spyOn(behaviourApi, "fetchBehaviourReviewRequests")
      .mockRejectedValue(
        new behaviourApi.BehaviourApiError("Denied", 403, null),
      );
    const screen = render(view());
    fireEvent.press(screen.getByText(child.displayName));
    await waitFor(() => expect(screen.getByText("Stage 1")).toBeTruthy());
    await waitFor(() =>
      expect(screen.getByText(/current Head or Lead role/)).toBeTruthy(),
    );
    expect(screen.queryByText("Save escalation")).toBeNull();
  });

  it("refreshes when Today is pressed again and keeps conflict feedback visible", async () => {
    jest
      .spyOn(behaviourApi, "createDemeritOverride")
      .mockRejectedValue(
        new behaviourApi.BehaviourApiError("Conflict", 409, null),
      );
    const screen = render(view());
    fireEvent.press(screen.getByText(child.displayName));
    await waitFor(() =>
      expect(screen.getByText("Save escalation")).toBeTruthy(),
    );
    fireEvent.press(screen.getByText("Today"));
    await waitFor(() =>
      expect(behaviourApi.fetchDemeritStatus).toHaveBeenCalledTimes(2),
    );
    await waitFor(() =>
      expect(screen.getByText("Save escalation")).toBeTruthy(),
    );

    fireEvent.changeText(screen.getByLabelText("Escalation reason"), "Concern");
    fireEvent.press(screen.getByText("Save escalation"));
    await waitFor(() =>
      expect(screen.getByText(/stage or policy changed/)).toBeTruthy(),
    );
    await waitFor(() =>
      expect(screen.getByText("Save escalation")).toBeTruthy(),
    );
    expect(screen.getByText(/stage or policy changed/)).toBeTruthy();
  });

  it("keeps stage reads unavailable without Sensitive permission or a valid date", async () => {
    const screen = render(view(false, false));
    expect(screen.getByText(/Stage details require sensitive/)).toBeTruthy();
    expect(behaviourApi.fetchDemeritStatus).not.toHaveBeenCalled();

    screen.rerender(view(true, false));
    fireEvent.press(screen.getByText(child.displayName));
    await waitFor(() => expect(screen.getByText("Stage 1")).toBeTruthy());
    fireEvent.changeText(
      screen.getByLabelText("Site-local date"),
      "9999-12-31",
    );
    expect(screen.getByText(/on or before today/)).toBeTruthy();
    expect(screen.queryByText("Stage 1")).toBeNull();
    fireEvent.changeText(
      screen.getByLabelText("Site-local date"),
      "2020-01-01",
    );
    await waitFor(() => expect(screen.getByText("Stage 1")).toBeTruthy());
    expect(screen.queryByText("Save escalation")).toBeNull();
  });

  it("loads bounded additional reviewer requests for the selected learner", async () => {
    jest
      .spyOn(behaviourApi, "fetchBehaviourReviewRequests")
      .mockResolvedValueOnce({ items: [review], nextCursor: reviewId })
      .mockResolvedValueOnce({
        items: [
          {
            ...review,
            id: "44444444-4444-4444-8444-444444444444",
            kind: "SITE",
            stage: 2,
            behaviourEntryId: null,
            demeritStageOverrideId: "override-1",
          },
        ],
        nextCursor: null,
      });
    const screen = render(view());
    fireEvent.press(screen.getByText(child.displayName));
    await waitFor(() =>
      expect(screen.getByText("Load more requests")).toBeTruthy(),
    );
    fireEvent.press(screen.getByText("Load more requests"));
    await waitFor(() =>
      expect(screen.getByText("Manual stage escalation")).toBeTruthy(),
    );
    expect(behaviourApi.fetchBehaviourReviewRequests).toHaveBeenLastCalledWith(
      child.id,
      reviewId,
    );
  });

  it("shows a no-policy state without offering an escalation", async () => {
    jest.spyOn(behaviourApi, "fetchDemeritStatus").mockResolvedValue(null);
    const screen = render(view());
    fireEvent.press(screen.getByText(child.displayName));
    await waitFor(() =>
      expect(
        screen.getByText("No demerit policy applies on this date."),
      ).toBeTruthy(),
    );
    expect(screen.queryByText("Save escalation")).toBeNull();
  });
});

describe("site-local dates", () => {
  it("uses the site calendar across UTC midnight and rejects invalid dates", () => {
    expect(siteToday(timeZone, new Date("2026-08-12T02:00:00.000Z"))).toBe(
      "2026-08-11",
    );
    expect(isValidSiteDate("2026-02-30", "2026-10-10")).toBe(false);
    expect(isValidSiteDate("2026-10-11", "2026-10-10")).toBe(false);
    expect(isValidSiteDate("2026-10-10", "2026-10-10")).toBe(true);
  });
});
