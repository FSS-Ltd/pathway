import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { DataTable, type ColumnDef } from "@pathway/ui";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: dom.window.navigator,
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  Element: dom.window.Element,
  HTMLElement: dom.window.HTMLElement,
  Event: dom.window.Event,
  IS_REACT_ACT_ENVIRONMENT: true,
});

type Row = { id: string; name: string; order: number };
const data: Row[] = Array.from({ length: 23 }, (_, index) => ({
  id: `row-${index + 1}`,
  name: `Person ${index + 1}`,
  order: index + 1,
}));
let navigations = 0;
let actions = 0;
const columns: ColumnDef<Row>[] = [
  {
    id: "name",
    header: "Name",
    accessorKey: "name",
    sortValue: (row) => row.order,
  },
  {
    id: "actions",
    header: "Actions",
    priority: "secondary",
    cell: () => (
      <button type="button" onClick={() => actions++}>
        Edit
      </button>
    ),
  },
];

async function click(element: Element | null): Promise<void> {
  assert.ok(element);
  await act(async () => (element as HTMLElement).click());
}

async function run(): Promise<void> {
  const { createRoot } = await import("react-dom/client");
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <DataTable
          data={data}
          columns={columns}
          caption="People"
          pagination={{ mode: "client", resetKey: "all" }}
          rowKey={(row) => row.id}
          onRowClick={() => navigations++}
        />,
      ),
    );
    assert.equal(container.querySelectorAll("tbody > tr").length, 10);
    assert.match(container.textContent ?? "", /1–10 of 23/);
    await click(
      Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "Next",
      ) ?? null,
    );
    assert.match(
      container.querySelector("tbody")?.textContent ?? "",
      /Person 11/,
    );
    assert.doesNotMatch(
      container.querySelector("tbody")?.textContent ?? "",
      /Person 1\b/,
    );

    await click(
      Array.from(container.querySelectorAll("thead button")).find(
        (button) => button.textContent === "Name",
      ) ?? null,
    );
    await click(container.querySelector("thead button"));
    assert.match(
      container.querySelector("tbody")?.textContent ?? "",
      /Person 23/,
    );
    assert.match(container.textContent ?? "", /1–10 of 23/);

    await click(container.querySelector("tbody button"));
    assert.equal(actions, 1);
    assert.equal(navigations, 0);
    await click(container.querySelector("tbody tr"));
    assert.equal(navigations, 1);

    await act(async () =>
      root.render(
        <DataTable
          data={data.slice(0, 3)}
          columns={columns}
          caption="People"
          pagination={{ mode: "client", resetKey: "filtered" }}
          rowKey={(row) => row.id}
        />,
      ),
    );
    assert.equal(container.querySelectorAll("tbody > tr").length, 3);
    assert.match(container.textContent ?? "", /1–3 of 3/);

    await act(async () =>
      root.render(
        <DataTable
          data={data.slice(10, 20)}
          columns={columns}
          caption="People"
          pagination={{
            mode: "server",
            pageIndex: 1,
            pageSize: 10,
            hasNextPage: false,
            onPageChange: () => undefined,
            onPageSizeChange: () => undefined,
          }}
          rowKey={(row) => row.id}
        />,
      ),
    );
    assert.match(container.textContent ?? "", /Page 2/);
    assert.doesNotMatch(container.textContent ?? "", /of 23/);
    const next = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Next",
    );
    assert.equal(next?.disabled, true);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    dom.window.close();
  }
}

void run();
