import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { AdminContextRuntime } from "@/lib/admin-context";
import type { SessionContextValue } from "@/lib/use-session-compat";
import MySchedulePage from "./page";
import { SwapCandidateForm, SwapRequestList } from "./swap-panels";
import {
  fetchMyAssignments,
  fetchSwapCandidates,
  fetchTeamSchedule,
  type AdminAssignmentRow,
  type AdminSwapRequestRow,
  type AdminTeamAssignment,
} from "@/lib/api-client";
import { AssignmentList } from "./assignment-list";
import { TeamRota, TeamRotaList } from "./team-rota";
import { SessionRotaKindField } from "@/components/session-rota-kind";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/my-schedule",
});
Object.assign(globalThis, {
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  Event: dom.window.Event,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});

const session = (
  status: "loading" | "unauthenticated",
): SessionContextValue => ({
  data: null,
  status,
  error: null,
  update: async () => undefined,
});

async function run(): Promise<void> {
  const { createRoot } = await import("react-dom/client");
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  try {
    let selectedPurpose = "";
    await act(async () => {
      root.render(
        <SessionRotaKindField
          value="STANDARD"
          onChange={(value) => {
            selectedPurpose = value;
          }}
        />,
      );
    });
    const purposeSelect =
      container.querySelector<HTMLSelectElement>("#rotaKind");
    assert.equal(purposeSelect?.options.length, 3);
    assert.equal(
      container.querySelector('label[for="rotaKind"]')?.textContent,
      "Purpose",
    );
    await act(async () => {
      if (purposeSelect) {
        purposeSelect.value = "COVER";
        purposeSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    assert.equal(selectedPurpose, "COVER");

    await act(async () => {
      root.render(
        <AdminContextRuntime session={session("loading")}>
          <MySchedulePage />
        </AdminContextRuntime>,
      );
    });
    assert.match(container.textContent ?? "", /Loading your schedule/);
    assert.doesNotMatch(
      container.textContent ?? "",
      /Sign in to see your schedule/,
    );

    await act(async () => {
      root.render(
        <AdminContextRuntime session={session("unauthenticated")}>
          <MySchedulePage />
        </AdminContextRuntime>,
      );
    });
    assert.match(container.textContent ?? "", /Sign in to see your schedule/);
    assert.equal(
      container.querySelector('a[href="/login"]')?.textContent,
      "Sign in",
    );

    let retries = 0;
    await act(async () => {
      root.render(
        <SwapCandidateForm
          candidates={[]}
          error={{ kind: "unavailable", message: "Staff could not load." }}
          loading={false}
          selectedUserId=""
          submitting={false}
          onCancel={() => undefined}
          onRetry={() => {
            retries += 1;
          }}
          onSelect={() => undefined}
          onSubmit={() => undefined}
        />,
      );
    });
    assert.equal(
      container
        .querySelector('[role="alert"]')
        ?.textContent?.includes("Staff could not load."),
      true,
    );
    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click();
    });
    assert.equal(retries, 1);

    await act(async () => {
      root.render(
        <SwapCandidateForm
          candidates={[{ id: "colleague", fullName: "Alex Morgan" }]}
          error={null}
          loading={false}
          selectedUserId=""
          submitting={false}
          onCancel={() => undefined}
          onRetry={() => undefined}
          onSelect={() => undefined}
          onSubmit={() => undefined}
        />,
      );
    });
    assert.equal(
      container.querySelector("select")?.options[1]?.text,
      "Alex Morgan",
    );
    assert.equal(
      container.querySelector<HTMLButtonElement>("button")?.disabled,
      true,
    );

    const swap: AdminSwapRequestRow = {
      id: "swap-1",
      assignmentId: "assignment-private-id",
      fromUserId: "staff-1",
      toUserId: "staff-2",
      status: "REQUESTED",
      createdAt: "2026-10-09T08:00:00.000Z",
      assignment: {
        session: {
          title: "Year 4 Maths",
          startsAt: "2026-10-12T09:00:00.000Z",
          endsAt: "2026-10-12T10:00:00.000Z",
        },
      },
      fromUser: { name: "Jamie Lee" },
      toUser: { name: "Alex Morgan" },
    };
    let acceptedId: string | null = null;
    await act(async () => {
      root.render(
        <SwapRequestList
          inbound={[swap]}
          outbound={[]}
          actionLoadingId={null}
          onAccept={(id) => {
            acceptedId = id;
          }}
          onDecline={() => undefined}
        />,
      );
    });
    assert.match(container.textContent ?? "", /Year 4 Maths/);
    assert.match(container.textContent ?? "", /Jamie Lee/);
    assert.doesNotMatch(container.textContent ?? "", /assignment-private-id/);
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label^="Accept swap"]')
        ?.click();
    });
    assert.equal(acceptedId, "swap-1");

    await act(async () => {
      root.render(
        <SwapRequestList
          inbound={[{ ...swap, status: "ACCEPTED" }]}
          outbound={[]}
          actionLoadingId={null}
          onAccept={() => undefined}
          onDecline={() => undefined}
        />,
      );
    });
    assert.match(container.textContent ?? "", /Accepted/);
    assert.equal(
      container.querySelector('button[aria-label^="Accept swap"]'),
      null,
    );

    const assignment: AdminAssignmentRow = {
      id: "assignment-1",
      sessionId: "session-1",
      staffId: "staff-1",
      staffName: "Jamie Lee",
      roleLabel: "Lead",
      status: "confirmed",
      sessionTitle: "Year 4 Maths",
      startsAt: "2026-10-12T09:00:00.000Z",
      endsAt: "2026-10-12T10:00:00.000Z",
    };
    let requestedId: string | null = null;
    await act(async () => {
      root.render(
        <AssignmentList
          assignments={[assignment]}
          activeSwapAssignmentId={null}
          busyAssignmentId={null}
          swapForm={null}
          onAccept={() => undefined}
          onDecline={() => undefined}
          onRequestSwap={(id) => {
            requestedId = id;
          }}
        />,
      );
    });
    assert.equal(
      container.querySelector('button[aria-label^="Accept "]'),
      null,
    );
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label^="Request swap"]')
        ?.click();
    });
    assert.equal(requestedId, "assignment-1");
    await act(async () => {
      root.render(
        <AssignmentList
          assignments={[
            { ...assignment, rotaKind: "COVER", sessionTitle: "Year 4 cover" },
          ]}
          activeSwapAssignmentId={null}
          busyAssignmentId={null}
          swapForm={null}
          onAccept={() => undefined}
          onDecline={() => undefined}
          onRequestSwap={() => undefined}
        />,
      );
    });
    assert.match(container.textContent ?? "", /Cover shift/);
    assert.match(container.textContent ?? "", /Year 4 cover/);
    await act(async () => {
      root.render(
        <AssignmentList
          assignments={[{ ...assignment, status: "declined" }]}
          activeSwapAssignmentId={null}
          busyAssignmentId={null}
          swapForm={null}
          onAccept={() => undefined}
          onDecline={() => undefined}
          onRequestSwap={() => undefined}
        />,
      );
    });
    assert.equal(
      container.querySelector('button[aria-label^="Request swap"]'),
      null,
    );

    const teamAssignment: AdminTeamAssignment = {
      assignmentId: "private-team-assignment",
      sessionId: "private-session",
      sessionTitle: "Year 4 Maths",
      startsAt: "2026-10-12T09:00:00.000Z",
      endsAt: "2026-10-12T10:00:00.000Z",
      groups: [{ id: "group-1", name: "Year 4" }],
      staffId: "private-staff",
      staffName: "Alex Morgan",
      role: "TEACHER",
      status: "CONFIRMED",
    };
    await act(async () => {
      root.render(<TeamRotaList rows={[teamAssignment]} />);
    });
    assert.match(container.textContent ?? "", /Year 4 Maths/);
    assert.match(container.textContent ?? "", /Alex Morgan/);
    assert.match(container.textContent ?? "", /Year 4/);
    assert.doesNotMatch(container.textContent ?? "", /private-/);
    await act(async () => {
      root.render(
        <TeamRotaList rows={[{ ...teamAssignment, rotaKind: "MEETING" }]} />,
      );
    });
    assert.match(container.textContent ?? "", /Staff meeting/);

    await act(async () => {
      root.render(
        <TeamRota siteId={null} dateFrom="2026-10-12" dateTo="2026-10-18" />,
      );
    });
    assert.match(container.textContent ?? "", /Choose a site/);
    assert.equal(
      container.querySelector('a[href="/staff/profile#weekly-availability"]')
        ?.textContent,
      "Set my availability",
    );

    const nativeFetch = globalThis.fetch;
    const calls: string[] = [];
    let teamMode: "ready" | "empty" | "denied" | "unavailable" = "ready";
    globalThis.fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/swaps/candidates?")) {
        return Response.json([{ id: "colleague", fullName: "Alex Morgan" }]);
      }
      if (url.includes("/assignments/team-schedule?")) {
        if (teamMode === "denied") {
          return Response.json({ message: "Forbidden" }, { status: 403 });
        }
        if (teamMode === "unavailable") {
          return Response.json(
            { message: "Service unavailable" },
            { status: 503 },
          );
        }
        return Response.json(teamMode === "empty" ? [] : [teamAssignment]);
      }
      if (url.includes("/sessions") || url.includes("/assignments")) {
        return Response.json([]);
      }
      throw new Error(`Unexpected request: ${url}`);
    };
    try {
      assert.deepEqual(
        await fetchMyAssignments({
          userId: "staff-1",
          dateFrom: "2026-10-12",
          dateTo: "2026-10-18",
        }),
        [],
      );
      assert.deepEqual(await fetchSwapCandidates("assignment-1"), [
        { id: "colleague", fullName: "Alex Morgan" },
      ]);
      assert.deepEqual(await fetchTeamSchedule("2026-10-12", "2026-10-18"), [
        teamAssignment,
      ]);
      await act(async () => {
        root.render(
          <TeamRota
            siteId="site-1"
            dateFrom="2026-10-12"
            dateTo="2026-10-18"
          />,
        );
      });
      assert.match(container.textContent ?? "", /Alex Morgan/);

      teamMode = "empty";
      await act(async () => {
        root.render(
          <TeamRota
            siteId="site-2"
            dateFrom="2026-10-12"
            dateTo="2026-10-18"
          />,
        );
      });
      assert.match(container.textContent ?? "", /No team sessions/);
      assert.doesNotMatch(container.textContent ?? "", /Alex Morgan/);

      teamMode = "denied";
      await act(async () => {
        root.render(
          <TeamRota
            siteId="site-3"
            dateFrom="2026-10-12"
            dateTo="2026-10-18"
          />,
        );
      });
      assert.match(
        container.querySelector('[role="alert"]')?.textContent ?? "",
        /available to staff/,
      );
      assert.equal(
        container.querySelector('a[href="/staff/profile#weekly-availability"]'),
        null,
      );

      teamMode = "unavailable";
      await act(async () => {
        root.render(
          <TeamRota
            siteId="site-4"
            dateFrom="2026-10-12"
            dateTo="2026-10-18"
          />,
        );
      });
      assert.match(
        container.querySelector('[role="alert"]')?.textContent ?? "",
        /Unable to load team rota/,
      );
      teamMode = "ready";
      await act(async () => {
        container.querySelector<HTMLButtonElement>("button")?.click();
      });
      assert.match(container.textContent ?? "", /Alex Morgan/);
      assert.equal(
        calls.some((url) => url.endsWith("/users")),
        false,
      );
      assert.equal(
        calls.some((url) =>
          url.includes("/swaps/candidates?assignmentId=assignment-1"),
        ),
        true,
      );
      assert.equal(
        calls.some((url) =>
          url.includes(
            "/assignments/team-schedule?dateFrom=2026-10-12&dateTo=2026-10-18",
          ),
        ),
        true,
      );
    } finally {
      globalThis.fetch = nativeFetch;
    }
  } finally {
    await act(async () => root.unmount());
  }
}

void run().then(
  () => process.stdout.write("schedule session states: passed\n"),
  (error: unknown) => {
    process.stderr.write(String(error));
    process.exitCode = 1;
  },
);
