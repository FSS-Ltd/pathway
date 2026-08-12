import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { resolveAdminNavItems } from "@/app/admin-navigation";
import { AceOverview } from "./ace-overview";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace",
});

Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLButtonElement: dom.window.HTMLButtonElement,
  MouseEvent: dom.window.MouseEvent,
  Node: dom.window.Node,
  Text: dom.window.Text,
  Event: dom.window.Event,
  KeyboardEvent: dom.window.KeyboardEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});

const dashboard = {
  localDate: "2026-08-12",
  timezone: "Europe/London",
  attendance: { present: 7, absent: 0, late: 2, unmarked: 3 },
  pace: {
    ahead: 1,
    onTrack: 4,
    atRisk: 2,
    behind: 1,
    blocked: 1,
    stale: 3,
  },
  behaviour: { siteReview: 2, headReview: 1 },
};

const emptyDashboard = {
  localDate: "2026-08-12",
  timezone: "Europe/London",
  attendance: { present: 0, absent: 0, late: 0, unmarked: 0 },
  pace: {
    ahead: 0,
    onTrack: 0,
    atRisk: 0,
    behind: 0,
    blocked: 0,
    stale: 0,
  },
  behaviour: { siteReview: 0, headReview: 0 },
};

const staffRole = {
  isOrgAdmin: false,
  isOrgOwner: false,
  isSiteAdmin: false,
  isStaff: true,
  isSafeguardingStaff: false,
  isSuperUser: false,
};

type Root = { render: (node: React.ReactNode) => void; unmount: () => void };

async function render(root: Root, node: React.ReactNode): Promise<void> {
  await act(async () => root.render(node));
}

async function run(): Promise<void> {
  const hiddenNavigation = resolveAdminNavItems({
    role: staffRole,
    currentOrgIsMasterOrg: false,
    capabilities: [],
    permissions: [],
    ui: { labels: {} },
  });
  assert.equal(
    hiddenNavigation.some((item) => item.href === "/ace"),
    false,
    "keeps the ACE overview navigation hidden without ace.dashboard.read",
  );
  const visibleNavigation = resolveAdminNavItems({
    role: staffRole,
    currentOrgIsMasterOrg: false,
    capabilities: [],
    permissions: ["ace.dashboard.read"],
    ui: { labels: {} },
  });
  assert.deepEqual(
    visibleNavigation.find((item) => item.href === "/ace"),
    expectNavItem(),
    "shows the ACE overview navigation only with ace.dashboard.read",
  );

  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  try {
    await render(root, <AceOverview dashboard={dashboard} />);
    assert.equal(
      container.querySelector("h1")?.textContent,
      "ACE overview",
      "renders the overview heading",
    );
    assert.match(container.textContent ?? "", /Late:\s*2/);
    assert.match(container.textContent ?? "", /Site review:\s*2/);
    assert.match(container.textContent ?? "", /Head review:\s*1/);
    assert.match(container.textContent ?? "", /On track\s*4/);
    assert.doesNotMatch(
      container.textContent ?? "",
      /reason|note|guardian|family|add-on|child/i,
      "never renders sensitive or person-level content",
    );

    const attentionSections = container.querySelectorAll("section");
    assert.ok(
      attentionSections.length >= 2,
      "renders separate aggregate attention regions",
    );
    assert.match(
      container.textContent ?? "",
      /Present:\s*7[\s\S]*Absent:\s*0[\s\S]*Late:\s*2[\s\S]*Unmarked:\s*3/,
      "attendance states are communicated with text rather than colour alone",
    );

    const paceRegion = container.querySelector<HTMLElement>(
      '[role="region"][aria-label="PACE status table"]',
    );
    assert.ok(
      paceRegion,
      "labels the scrollable PACE table for keyboard users",
    );
    assert.equal(
      paceRegion.tabIndex,
      0,
      "PACE table region is keyboard focusable",
    );
    paceRegion.focus();
    assert.equal(
      document.activeElement,
      paceRegion,
      "keyboard focus remains visible on the PACE table region",
    );
    assert.deepEqual(
      Array.from(container.querySelectorAll("thead th")).map((cell) =>
        cell.textContent?.trim(),
      ),
      ["PACE status", "Count"],
      "keeps table labels available to assistive technology",
    );

    await render(root, <AceOverview dashboard={emptyDashboard} />);
    assert.match(
      container.querySelector('[role="status"]')?.textContent ?? "",
      /No activity has been recorded for this date\./,
      "renders a distinct zero-count state",
    );
    assert.match(container.textContent ?? "", /Late:\s*0/);

    await render(root, <AceOverview dashboard={null} isLoading error={null} />);
    assert.ok(
      container.querySelector('[aria-label="Loading ACE overview…"]'),
      "announces the loading state",
    );

    let retries = 0;
    await render(
      root,
      <AceOverview
        dashboard={null}
        isLoading={false}
        error="The overview is temporarily unavailable."
        onRetry={() => {
          retries += 1;
        }}
      />,
    );
    assert.equal(
      container.querySelector('[role="alert"]')?.textContent,
      "The overview is temporarily unavailable.",
      "announces a recoverable load error",
    );
    const retry = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Retry",
    );
    assert.ok(retry, "offers a retry action");
    await act(async () => {
      retry.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      );
    });
    assert.equal(retries, 1, "invokes the retry action once");

    Object.defineProperty(dom.window, "innerWidth", {
      value: 320,
      configurable: true,
    });
    document.documentElement.style.fontSize = "200%";
    await render(root, <AceOverview dashboard={dashboard} />);
    assert.ok(
      container.querySelector("main")?.classList.contains("min-w-0"),
      "allows the overview to shrink at a 320pt viewport",
    );
    for (const label of [
      "Present:",
      "Absent:",
      "Late:",
      "Unmarked:",
      "Site review:",
      "Head review:",
      "Ahead",
      "On track",
      "At risk",
      "Behind",
      "Blocked",
      "Stale",
    ]) {
      const element = Array.from(container.querySelectorAll("*")).find(
        (candidate) => candidate.textContent?.trim() === label,
      );
      assert.ok(element, `keeps ${label} visible at 320pt and 200% text`);
      assert.equal(element.hasAttribute("hidden"), false);
    }
  } finally {
    await act(async () => root.unmount());
    container.remove();
    document.documentElement.style.fontSize = "";
  }
}

function expectNavItem() {
  return {
    label: "ACE overview",
    href: "/ace",
    iconIndex: 24,
    access: "staff-or-admin",
    permission: "ace.dashboard.read",
    group: "Teaching",
  };
}

void run()
  .then(() => console.log("ace-overview.test.tsx: all assertions passed"))
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
