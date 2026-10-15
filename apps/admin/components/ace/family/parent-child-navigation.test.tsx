import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { setApiClientToken } from "@/lib/api-client";
import {
  childSectionForRoute,
  ParentChildNavigationView,
} from "./parent-child-navigation";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace/parent/sites/school-one/children/child-one/summary",
});
Object.assign(globalThis, {
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});

const contexts = [
  {
    kind: "parent",
    siteId: "school-one",
    siteName: "Alpha School",
    childId: "child-one",
    childName: "Ari Alpha",
    sections: [
      "parent-summary",
      "ace-summary",
      "attendance",
      "sessions",
      "subject-timetable",
    ],
  },
  {
    kind: "parent",
    siteId: "school-one",
    siteName: "Alpha School",
    childId: "child-two",
    childName: "Bea Alpha",
    sections: [
      "parent-summary",
      "ace-summary",
      "attendance",
      "subject-timetable",
    ],
  },
  {
    kind: "parent",
    siteId: "school-one",
    siteName: "Alpha School",
    childId: "child-three",
    childName: "Cia Alpha",
    sections: ["parent-summary", "attendance"],
  },
  {
    kind: "parent",
    siteId: "school-two",
    siteName: "Bravo School",
    childId: "child-four",
    childName: "Dan Bravo",
    sections: ["parent-summary", "ace-summary", "attendance"],
  },
  {
    kind: "student",
    siteId: "school-one",
    siteName: "Alpha School",
    childId: "child-five",
    childName: "Eli Student",
    sections: ["student-summary", "attendance"],
  },
];

async function run() {
  assert.equal(childSectionForRoute("overview"), "parent-summary");
  assert.equal(childSectionForRoute("summary"), "ace-summary");
  assert.equal(childSectionForRoute("attendance"), "attendance");
  assert.equal(childSectionForRoute("timetable"), "sessions");
  assert.equal(childSectionForRoute("subject-timetable"), "subject-timetable");
  assert.equal(childSectionForRoute("unknown"), null);

  const { createRoot } = await import("react-dom/client");
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  let mode: "linked" | "error" | "deferred" = "linked";
  let releaseOld!: (response: Response) => void;
  let requests = 0;
  setApiClientToken("family-token");
  globalThis.fetch = async (input, init) => {
    requests += 1;
    assert.equal(String(input), "http://api.test/ace/family/contexts");
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer family-token",
    );
    if (mode === "error") return new Response("", { status: 503 });
    if (mode === "deferred") {
      return new Promise<Response>((resolve) => {
        releaseOld = resolve;
      });
    }
    return Response.json({ items: contexts });
  };

  const render = async (
    childId: string,
    section:
      | "parent-summary"
      | "ace-summary"
      | "attendance"
      | "sessions"
      | "subject-timetable",
    key: string,
    status: "authenticated" | "unauthenticated" = "authenticated",
  ) => {
    await act(async () => {
      root.render(
        <ParentChildNavigationView
          key={key}
          siteId="school-one"
          childId={childId}
          section={section}
          status={status}
        />,
      );
    });
  };

  try {
    await render("child-one", "parent-summary", "generic-overview");
    assert.deepEqual(
      Array.from(container.querySelectorAll("nav a")).map((link) =>
        link.getAttribute("href"),
      ),
      [
        "/family/sites/school-one/children/child-one/overview",
        "/family/sites/school-one/children/child-two/overview",
        "/family/sites/school-one/children/child-three/overview",
      ],
    );

    await render("child-one", "ace-summary", "summary");
    assert.match(container.textContent ?? "", /Ari Alpha at Alpha School/);
    assert.equal(
      container.querySelector("nav")?.getAttribute("aria-label"),
      "Choose child for overview",
    );
    assert.deepEqual(
      Array.from(container.querySelectorAll("nav a")).map((link) => [
        link.getAttribute("href"),
        link.getAttribute("aria-current"),
      ]),
      [
        ["/ace/parent/sites/school-one/children/child-one/summary", "page"],
        ["/ace/parent/sites/school-one/children/child-two/summary", null],
      ],
    );
    assert.doesNotMatch(container.textContent ?? "", /Cia|Dan|Eli/);

    await render("child-one", "subject-timetable", "subjects");
    assert.deepEqual(
      Array.from(container.querySelectorAll("nav a")).map((link) =>
        link.getAttribute("href"),
      ),
      [
        "/ace/parent/sites/school-one/children/child-one/subject-timetable",
        "/ace/parent/sites/school-one/children/child-two/subject-timetable",
      ],
    );

    await render("child-three", "attendance", "attendance");
    assert.match(container.textContent ?? "", /Cia Alpha at Alpha School/);
    assert.equal(container.querySelectorAll("nav a").length, 3);
    assert.equal(
      container
        .querySelector('a[href$="/child-three/attendance"]')
        ?.getAttribute("aria-current"),
      "page",
    );

    await render("child-three", "sessions", "unreleased");
    assert.match(
      container.textContent ?? "",
      /not linked to your account for this school service/,
    );
    assert.equal(container.querySelectorAll("nav a").length, 0);

    mode = "error";
    await render("child-one", "ace-summary", "error");
    assert.match(
      container.textContent ?? "",
      /Child links could not be loaded/,
    );
    mode = "linked";
    const retry = container.querySelector<HTMLButtonElement>("button");
    assert.ok(retry);
    await act(async () => retry.click());
    assert.match(container.textContent ?? "", /Ari Alpha at Alpha School/);

    mode = "deferred";
    await render("child-one", "ace-summary", "old-account");
    assert.match(container.textContent ?? "", /Checking your child link/);
    mode = "linked";
    await render("child-two", "ace-summary", "new-account");
    await act(async () =>
      releaseOld(
        Response.json({
          items: [{ ...contexts[0], childName: "Former Account Child" }],
        }),
      ),
    );
    assert.match(container.textContent ?? "", /Bea Alpha at Alpha School/);
    assert.doesNotMatch(container.textContent ?? "", /Former Account Child/);
    assert.equal(
      container
        .querySelector('nav a[aria-current="page"]')
        ?.getAttribute("href"),
      "/ace/parent/sites/school-one/children/child-two/summary",
    );

    const beforeSignOut = requests;
    await render("child-two", "ace-summary", "signed-out", "unauthenticated");
    assert.equal(requests, beforeSignOut);
    assert.equal(container.textContent, "");
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    setApiClientToken(null);
    container.remove();
  }
}

void run();
