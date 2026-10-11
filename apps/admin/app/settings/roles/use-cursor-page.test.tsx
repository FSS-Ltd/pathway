import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { useCursorPage } from "./use-cursor-page";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  IS_REACT_ACT_ENVIRONMENT: true,
});

const calls: Array<{ cursor?: string; limit: number }> = [];
let deletedLastPage = false;
const fetchPage = async (params: { cursor?: string; limit: number }) => {
  calls.push(params);
  if (params.cursor && deletedLastPage) return { items: [], nextCursor: null };
  return params.cursor
    ? { items: ["second"], nextCursor: null }
    : { items: ["first"], nextCursor: "next-cursor" };
};

function Harness({ resetKey }: { resetKey: string }) {
  const page = useCursorPage(fetchPage, "Unable to load.", resetKey);
  return (
    <div>
      <span>{`${page.pageIndex}:${page.items.join(",")}:${page.pageSize}`}</span>
      <button onClick={() => page.changePage(page.pageIndex + 1)}>Next</button>
      <button onClick={() => page.changePageSize(25)}>25 rows</button>
      <button onClick={page.refresh}>Refresh</button>
    </div>
  );
}

async function run(): Promise<void> {
  const { createRoot } = await import("react-dom/client");
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const click = async (label: string) => {
    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === label,
    );
    assert.ok(button);
    await act(async () => button.click());
  };
  try {
    await act(async () => root.render(<Harness resetKey="site-a" />));
    assert.deepEqual(calls, [{ cursor: undefined, limit: 10 }]);
    assert.match(container.textContent ?? "", /0:first:10/);

    await click("Next");
    assert.deepEqual(calls.at(-1), { cursor: "next-cursor", limit: 10 });
    assert.match(container.textContent ?? "", /1:second:10/);

    deletedLastPage = true;
    await click("Refresh");
    assert.match(container.textContent ?? "", /0:first:10/);

    await click("25 rows");
    assert.deepEqual(calls.at(-1), { cursor: undefined, limit: 25 });
    assert.match(container.textContent ?? "", /0:first:25/);

    await act(async () => root.render(<Harness resetKey="site-b" />));
    assert.deepEqual(calls.at(-1), { cursor: undefined, limit: 25 });
    assert.match(container.textContent ?? "", /0:first:25/);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    dom.window.close();
  }
}

void run();
