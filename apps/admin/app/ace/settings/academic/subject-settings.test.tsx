import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { notifyActiveSiteChanged } from "@/lib/active-site-events";
import { setApiClientToken } from "@/lib/api-client";
import type { AceSubject } from "@/lib/ace-settings-api";
import { SubjectSettings } from "./subject-settings";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace/settings/academic",
});

Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLFormElement: dom.window.HTMLFormElement,
  Node: dom.window.Node,
  Text: dom.window.Text,
  Event: dom.window.Event,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});

type Root = { render: (node: React.ReactNode) => void; unmount: () => void };

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function input(container: HTMLElement, id: string): HTMLInputElement {
  const element = container.querySelector<HTMLInputElement>(`#${id}`);
  assert.ok(element, `expected #${id}`);
  return element;
}

async function changeInput(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    "value",
  )?.set;
  assert.ok(setter);
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

async function click(container: HTMLElement, label: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (item) =>
      item.getAttribute("aria-label") === label ||
      item.textContent?.trim() === label,
  );
  assert.ok(button, `expected button ${label}`);
  await act(async () => button.click());
}

async function submit(form: HTMLFormElement) {
  await act(async () => {
    form.dispatchEvent(
      new dom.window.Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}

async function render(root: Root, canManage: boolean) {
  await act(async () => root.render(<SubjectSettings canManage={canManage} />));
}

async function run() {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  const firstSite: AceSubject[] = [
    { id: "subject-a", name: "Mathematics", isActive: true },
  ];
  const secondSite: AceSubject[] = [
    { id: "subject-b", name: "Literature", isActive: true },
  ];
  let site: "first" | "second" | "empty" | "error" = "first";
  let nextRead: Promise<Response> | null = null;
  let nextWrite: Promise<Response> | null = null;
  let conflictNext = false;
  const writes: Array<{ path: string; body: Record<string, string> }> = [];

  setApiClientToken("test-token");
  globalThis.fetch = async (url, init) => {
    const path = String(url).replace("http://api.test", "");
    assert.ok(path.startsWith("/ace/subjects"));
    assert.equal(init?.credentials, "include");
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer test-token",
    );
    if (!init?.method || init.method === "GET") {
      if (nextRead) {
        const pending = nextRead;
        nextRead = null;
        return pending;
      }
      if (site === "error")
        return jsonResponse({ message: "Subjects unavailable" }, 503);
      return jsonResponse(
        site === "first" ? firstSite : site === "second" ? secondSite : [],
      );
    }
    const body = JSON.parse(String(init.body)) as Record<string, string>;
    writes.push({ path, body });
    if (nextWrite) {
      const pending = nextWrite;
      nextWrite = null;
      return pending;
    }
    if (conflictNext) {
      conflictNext = false;
      return jsonResponse(
        { message: "A subject with this name already exists at this site" },
        409,
      );
    }
    if (path === "/ace/subjects") {
      const created = {
        id: "subject-created",
        name: body.name,
        isActive: true,
      };
      firstSite.push(created);
      return jsonResponse(created, 201);
    }
    if (path.endsWith("/deactivate")) {
      return jsonResponse({ id: "subject-a", name: "Maths", isActive: false });
    }
    return jsonResponse({ id: "subject-a", name: body.name, isActive: true });
  };

  try {
    await render(root, true);
    assert.match(container.textContent ?? "", /Mathematics/);
    assert.ok(container.querySelector('ul[aria-label="Site subjects"]'));
    assert.equal(container.querySelectorAll("form").length, 1);

    const createForm = container.querySelector("form");
    assert.ok(createForm);
    await submit(createForm);
    assert.equal(writes.length, 0, "invalid form cannot write");
    assert.equal(
      input(container, "ace-subject-name").getAttribute("aria-invalid"),
      "true",
    );
    await changeInput(input(container, "ace-subject-name"), "Science");
    await changeInput(
      input(container, "ace-subject-reason"),
      "New PACE subject",
    );
    await submit(createForm);
    assert.deepEqual(writes[0], {
      path: "/ace/subjects",
      body: { name: "Science", reason: "New PACE subject" },
    });
    assert.match(container.textContent ?? "", /Subject created for this site/);
    assert.match(container.textContent ?? "", /Science/);

    await click(container, "Rename Mathematics");
    await changeInput(input(container, "subject-name-subject-a"), "Maths");
    const actionForm = container.querySelectorAll("form")[1];
    assert.ok(actionForm);
    await submit(actionForm);
    assert.equal(writes.length, 1, "rename requires a reason");
    await changeInput(
      input(container, "subject-reason-subject-a"),
      "Use school wording",
    );
    await submit(actionForm);
    assert.deepEqual(writes[1], {
      path: "/ace/subjects/subject-a",
      body: { name: "Maths", reason: "Use school wording" },
    });
    assert.match(container.textContent ?? "", /Subject name saved/);

    await click(container, "Deactivate Maths");
    assert.match(
      container.textContent ?? "",
      /Existing placements remain visible/,
    );
    const deactivateForm = container.querySelectorAll("form")[1];
    assert.ok(deactivateForm);
    await submit(deactivateForm);
    assert.equal(writes.length, 2, "deactivation requires a reason");
    await changeInput(
      input(container, "subject-reason-subject-a"),
      "No new placements",
    );
    await submit(deactivateForm);
    assert.deepEqual(writes[2], {
      path: "/ace/subjects/subject-a/deactivate",
      body: { reason: "No new placements" },
    });
    assert.match(container.textContent ?? "", /Subject deactivated/);
    assert.equal(
      container.querySelector('[aria-label="Deactivate Maths"]'),
      null,
    );

    await render(root, false);
    assert.equal(container.querySelector("form"), null);
    assert.equal(
      container.querySelector('[aria-label="Rename Science"]'),
      null,
    );
    assert.match(container.textContent ?? "", /You can view subjects/);
    assert.equal(writes.length, 3);

    await render(root, true);
    await changeInput(input(container, "ace-subject-name"), "Science");
    await changeInput(input(container, "ace-subject-reason"), "Duplicate");
    conflictNext = true;
    const duplicateForm = container.querySelector("form");
    assert.ok(duplicateForm);
    await submit(duplicateForm);
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /already exists/,
    );

    const pendingWrite = deferred<Response>();
    nextWrite = pendingWrite.promise;
    await changeInput(input(container, "ace-subject-name"), "History");
    await changeInput(input(container, "ace-subject-reason"), "New curriculum");
    const pendingForm = container.querySelector("form");
    assert.ok(pendingForm);
    await submit(pendingForm);
    site = "second";
    await act(async () => notifyActiveSiteChanged());
    assert.match(container.textContent ?? "", /Literature/);
    assert.doesNotMatch(
      container.textContent ?? "",
      /Mathematics|Maths|Science/,
    );
    await act(async () =>
      pendingWrite.resolve(
        jsonResponse({ id: "subject-stale", name: "History", isActive: true }),
      ),
    );
    assert.doesNotMatch(container.textContent ?? "", /History/);

    const pendingRead = deferred<Response>();
    nextRead = pendingRead.promise;
    site = "first";
    await act(async () => notifyActiveSiteChanged());
    assert.match(container.textContent ?? "", /Loading subjects/);
    site = "second";
    await act(async () => notifyActiveSiteChanged());
    assert.match(container.textContent ?? "", /Literature/);
    await act(async () => pendingRead.resolve(jsonResponse(firstSite)));
    assert.doesNotMatch(container.textContent ?? "", /Mathematics/);

    site = "empty";
    await act(async () => notifyActiveSiteChanged());
    assert.match(container.textContent ?? "", /No subjects at this site yet/);
    site = "error";
    await act(async () => notifyActiveSiteChanged());
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /Subjects unavailable/,
    );
    site = "empty";
    await click(container, "Reload subjects");
    assert.match(container.textContent ?? "", /No subjects at this site yet/);
  } finally {
    await act(async () => root.unmount());
    setApiClientToken(null);
    globalThis.fetch = originalFetch;
    container.remove();
  }
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
