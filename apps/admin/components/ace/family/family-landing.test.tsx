import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { setApiClientToken } from "@/lib/api-client";
import { FamilyLandingView } from "./family-landing";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace/family",
});
Object.assign(globalThis, {
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Event: dom.window.Event,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});

async function run() {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const requested: string[] = [];
  let mode: "linked" | "partial" | "legacy" | "empty" | "denied" | "deferred" =
    "linked";
  let releaseDeferred: ((response: Response) => void) | undefined;
  const originalFetch = globalThis.fetch;
  const originalHomeworkWebFlag =
    process.env.NEXT_PUBLIC_ACE_HOMEWORK_WEB_ENABLED;
  process.env.NEXT_PUBLIC_ACE_HOMEWORK_WEB_ENABLED = "true";
  setApiClientToken("family-token");
  globalThis.fetch = async (input, init) => {
    requested.push(String(input));
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer family-token",
    );
    if (mode === "denied") return new Response("", { status: 403 });
    if (mode === "deferred") {
      return new Promise<Response>((resolve) => {
        releaseDeferred = resolve;
      });
    }
    return new Response(
      JSON.stringify({
        items:
          mode === "empty"
            ? []
            : [
                {
                  kind: "parent",
                  siteId: "school-one",
                  siteName: "Alpha School",
                  childId: "child-one",
                  childName: "Ari Alpha",
                  sections:
                    mode === "legacy"
                      ? undefined
                      : mode === "partial"
                        ? ["parent-summary", "attendance", "notices"]
                        : [
                            "parent-summary",
                            "ace-summary",
                            "attendance",
                            "sessions",
                            "subject-timetable",
                            "notices",
                            "messages",
                            "volunteering",
                          ],
                },
                {
                  kind: "parent",
                  siteId: "school-one",
                  siteName: "Alpha School",
                  childId: "child-three",
                  childName: "Cia Alpha",
                  sections:
                    mode === "legacy"
                      ? undefined
                      : mode === "partial"
                        ? ["parent-summary", "attendance", "notices"]
                        : [
                            "parent-summary",
                            "ace-summary",
                            "attendance",
                            "sessions",
                            "subject-timetable",
                            "notices",
                            "messages",
                            "volunteering",
                          ],
                },
                {
                  kind: "student",
                  siteId: "school-two",
                  siteName: "Bravo School",
                  childId: "child-two",
                  childName: "Bea Bravo",
                  sections:
                    mode === "legacy"
                      ? undefined
                      : mode === "partial"
                        ? ["attendance"]
                        : [
                            "student-summary",
                            "attendance",
                            "sessions",
                            "subject-timetable",
                          ],
                },
              ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    await act(async () =>
      root.render(
        <FamilyLandingView status="authenticated" accountId="family-a" />,
      ),
    );
    assert.deepEqual(requested, ["http://api.test/ace/family/contexts"]);
    assert.match(container.textContent ?? "", /Ari Alpha/);
    assert.match(container.textContent ?? "", /Cia Alpha/);
    assert.match(container.textContent ?? "", /Bea Bravo/);
    assert.deepEqual(
      Array.from(
        container.querySelectorAll(
          'section[aria-label="Children linked to you"] h3, section[aria-label="Your student access"] h3',
        ),
      ).map((heading) => heading.textContent?.trim()),
      ["Ari Alpha", "Cia Alpha", "Bea Bravo"],
    );
    assert.deepEqual(
      Array.from(container.querySelectorAll('a[href$="/summary"]')).map(
        (anchor) => anchor.getAttribute("href"),
      ),
      [
        "/ace/parent/sites/school-one/children/child-one/summary",
        "/ace/parent/sites/school-one/children/child-three/summary",
        "/ace/student/sites/school-two/summary",
      ],
    );
    assert.deepEqual(
      Array.from(container.querySelectorAll('a[href$="/summary"]')).map(
        (anchor) => anchor.textContent?.replace(/\s+/g, " ").trim(),
      ),
      [
        "Overview for Ari Alpha at Alpha School",
        "Overview for Cia Alpha at Alpha School",
        "Overview for Bea Bravo at Bravo School",
      ],
    );
    assert.equal(
      container.querySelector('a[href$="/summary"]')?.querySelector(".sr-only")
        ?.textContent,
      " for Ari Alpha at Alpha School",
    );
    const overview = container.querySelector<HTMLAnchorElement>(
      'a[href$="/summary"]',
    );
    assert.ok(overview);
    assert.equal(overview.tabIndex, 0);
    assert.deepEqual(
      Array.from(container.querySelectorAll("a[href*='/attendance']")).map(
        (anchor) => anchor.getAttribute("href"),
      ),
      [
        "/ace/parent/sites/school-one/children/child-one/attendance",
        "/ace/parent/sites/school-one/children/child-three/attendance",
        "/ace/student/sites/school-two/attendance",
      ],
    );
    assert.deepEqual(
      Array.from(container.querySelectorAll('a[href$="/timetable"]')).map(
        (anchor) => anchor.getAttribute("href"),
      ),
      [
        "/ace/parent/sites/school-one/children/child-one/timetable",
        "/ace/parent/sites/school-one/children/child-three/timetable",
        "/ace/student/sites/school-two/timetable",
      ],
    );
    assert.deepEqual(
      Array.from(
        container.querySelectorAll('a[href$="/subject-timetable"]'),
      ).map((anchor) => anchor.getAttribute("href")),
      [
        "/ace/parent/sites/school-one/children/child-one/subject-timetable",
        "/ace/parent/sites/school-one/children/child-three/subject-timetable",
        "/ace/student/sites/school-two/subject-timetable",
      ],
    );
    assert.deepEqual(
      Array.from(container.querySelectorAll('a[href$="/messages"]')).map(
        (anchor) => anchor.getAttribute("href"),
      ),
      ["/ace/parent/sites/school-one/messages"],
    );
    assert.match(
      container.querySelector('a[href$="/messages"]')?.textContent ?? "",
      /Messages at Alpha School/,
    );
    assert.deepEqual(
      Array.from(container.querySelectorAll('a[href$="/notices"]')).map(
        (anchor) => anchor.getAttribute("href"),
      ),
      ["/ace/parent/sites/school-one/notices"],
    );
    assert.deepEqual(
      Array.from(container.querySelectorAll('a[href$="/homework"]')).map(
        (anchor) => anchor.getAttribute("href"),
      ),
      [
        "/ace/parent/sites/school-one/children/child-one/homework",
        "/ace/parent/sites/school-one/children/child-three/homework",
      ],
    );

    process.env.NEXT_PUBLIC_ACE_HOMEWORK_WEB_ENABLED = "false";
    await act(async () =>
      root.render(
        <FamilyLandingView
          key="homework-off"
          status="authenticated"
          accountId="family-a"
        />,
      ),
    );
    assert.equal(container.querySelectorAll('a[href$="/homework"]').length, 0);
    process.env.NEXT_PUBLIC_ACE_HOMEWORK_WEB_ENABLED = "true";

    mode = "partial";
    await act(async () =>
      root.render(
        <FamilyLandingView status="unauthenticated" accountId={null} />,
      ),
    );
    await act(async () =>
      root.render(
        <FamilyLandingView status="authenticated" accountId="family-a" />,
      ),
    );
    assert.equal(container.querySelectorAll('a[href$="/messages"]').length, 0);
    assert.deepEqual(
      Array.from(container.querySelectorAll('a[href$="/overview"]')).map(
        (anchor) => anchor.getAttribute("href"),
      ),
      [
        "/family/sites/school-one/children/child-one/overview",
        "/family/sites/school-one/children/child-three/overview",
      ],
    );
    assert.equal(
      container.querySelectorAll('a[href$="/volunteering"]').length,
      0,
    );
    assert.equal(container.querySelectorAll('a[href$="/timetable"]').length, 0);
    assert.equal(
      container.querySelectorAll('a[href$="/subject-timetable"]').length,
      0,
    );
    assert.equal(container.querySelectorAll('a[href$="/notices"]').length, 1);
    assert.equal(container.querySelectorAll('a[href$="/homework"]').length, 0);

    mode = "legacy";
    await act(async () =>
      root.render(
        <FamilyLandingView status="unauthenticated" accountId={null} />,
      ),
    );
    await act(async () =>
      root.render(
        <FamilyLandingView status="authenticated" accountId="family-a" />,
      ),
    );
    assert.match(container.textContent ?? "", /Ari Alpha/);
    assert.match(container.textContent ?? "", /School services are updating/);
    assert.equal(
      container.querySelectorAll('a[href*="/ace/parent/sites/"]').length,
      0,
    );

    mode = "denied";
    const requestCount = requested.length;
    await act(async () =>
      root.render(
        <FamilyLandingView status="unauthenticated" accountId={null} />,
      ),
    );
    assert.equal(requested.length, requestCount);
    assert.match(container.textContent ?? "", /Sign in to continue/);
    await act(async () =>
      root.render(
        <FamilyLandingView status="authenticated" accountId="family-a" />,
      ),
    );
    assert.match(container.textContent ?? "", /could not be verified/);
    assert.doesNotMatch(container.textContent ?? "", /Ari Alpha/);

    mode = "empty";
    const retry = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Try again",
    );
    assert.ok(retry);
    await act(async () => retry.click());
    assert.match(container.textContent ?? "", /No school links yet/);
    assert.equal(
      container.querySelectorAll("a[href*='/attendance']").length,
      0,
    );

    mode = "linked";
    await act(async () =>
      root.render(
        <FamilyLandingView status="unauthenticated" accountId={null} />,
      ),
    );
    await act(async () =>
      root.render(
        <FamilyLandingView status="authenticated" accountId="family-a" />,
      ),
    );
    assert.match(container.textContent ?? "", /Ari Alpha/);

    mode = "deferred";
    await act(async () =>
      root.render(
        <FamilyLandingView status="authenticated" accountId="family-b" />,
      ),
    );
    assert.match(container.textContent ?? "", /Loading your school links/);
    assert.doesNotMatch(container.textContent ?? "", /Ari Alpha/);
    assert.equal(
      container.querySelectorAll("a[href*='/ace/parent/sites/']").length,
      0,
    );
    assert.ok(releaseDeferred);
    await act(async () =>
      releaseDeferred(
        new Response(JSON.stringify({ items: [] }), { status: 200 }),
      ),
    );
    assert.match(container.textContent ?? "", /No school links yet/);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    if (originalHomeworkWebFlag === undefined)
      delete process.env.NEXT_PUBLIC_ACE_HOMEWORK_WEB_ENABLED;
    else
      process.env.NEXT_PUBLIC_ACE_HOMEWORK_WEB_ENABLED =
        originalHomeworkWebFlag;
    setApiClientToken(null);
    container.remove();
  }
}

void run();
