import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SessionRuntime } from "../lib/use-session-compat";
import { AdminContextProvider } from "../lib/admin-context";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/children",
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

const children = [
  { id: "child-a", firstName: "Sam", lastName: "Lane", status: "ACTIVE" },
  { id: "child-b", firstName: "Sam", lastName: "Lane", status: "ACTIVE" },
  { id: "child-c", firstName: "Alex", lastName: "Moss", status: "ACTIVE" },
];
const parents = [
  {
    id: "parent-a",
    fullName: "Sam Lane",
    email: "a@example.test",
    childrenCount: 1,
  },
  {
    id: "parent-b",
    fullName: "Sam Lane",
    email: "b@example.test",
    childrenCount: 0,
  },
];

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

async function select(
  control: HTMLSelectElement,
  value: string,
): Promise<void> {
  await act(async () => {
    control.value = value;
    control.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
}

async function run(): Promise<void> {
  const { createRoot } = await import("react-dom/client");
  const { default: ChildrenPage } = await import("./children/page");
  const { default: ParentsPage } = await import("./parents/page");
  const nativeFetch = globalThis.fetch;
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  let lookup: Promise<Response> = Promise.resolve(response(children));
  let requests = 0;
  const navigations: string[] = [];
  const router = {
    back() {},
    forward() {},
    refresh() {},
    push(href: string) {
      navigations.push(href);
    },
    replace() {},
    prefetch: async () => undefined,
  };
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path === "/auth/me") return response({ userId: "staff-a" });
    if (path === "/auth/active-site")
      return response({ activeSiteId: null, sites: [] });
    if (path === "/children" || path === "/parents") {
      requests += 1;
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Bearer staff-token",
      );
      assert.equal(
        init?.credentials,
        "include",
        "lookup retains the site cookie",
      );
      return lookup;
    }
    throw new Error(`Unexpected request: ${path}`);
  };
  const getToken = async () => "staff-token";
  const identity = { id: "clerk-a", name: "Staff", email: null };

  async function mount(page: React.ReactNode, key: string): Promise<void> {
    await act(async () =>
      root.render(
        <AppRouterContext.Provider value={router}>
          <SessionRuntime
            isLoaded
            isSignedIn
            getToken={getToken}
            identity={identity}
          >
            <AdminContextProvider>
              <React.Fragment key={key}>{page}</React.Fragment>
            </AdminContextProvider>
          </SessionRuntime>
        </AppRouterContext.Provider>,
      ),
    );
    await settle();
  }
  function filter(label: string): HTMLSelectElement {
    const control = container.querySelector<HTMLSelectElement>(
      `select[aria-label="${label}"]`,
    );
    assert.ok(
      control,
      `expected database dropdown: ${label}; ${container.textContent}`,
    );
    return control;
  }
  function refresh(): HTMLButtonElement {
    const button = [...container.querySelectorAll("button")].find(
      (item) => item.textContent === "Refresh",
    );
    assert.ok(button);
    return button;
  }
  const rowCount = () => container.querySelectorAll("tbody tr").length;

  try {
    let resolveLookup: (value: Response) => void = () => {
      throw new Error("lookup not pending");
    };
    lookup = new Promise((resolve) => {
      resolveLookup = resolve;
    });
    await mount(<ChildrenPage />, "children");
    assert.equal(filter("Filter by child").disabled, true);
    assert.equal(filter("Filter by child").options.length, 1);
    await act(async () => resolveLookup(response(children)));
    await settle();
    const childFilter = filter("Filter by child");
    assert.deepEqual(
      [...childFilter.options].map((option) => option.value),
      ["", "child-a", "child-b", "child-c"],
    );
    assert.notEqual(
      childFilter.options[1].text,
      childFilter.options[2].text,
      "duplicate names are distinguishable",
    );
    const loadedRequests = requests;
    await select(childFilter, "child-b");
    assert.equal(rowCount(), 1, "duplicate names filter by ID");
    const row = container.querySelector<HTMLElement>("tbody tr");
    assert.ok(row);
    await act(async () => row.click());
    assert.deepEqual(navigations, ["/children/child-b"]);
    await select(childFilter, "");
    assert.equal(rowCount(), 3);
    assert.equal(
      requests,
      loadedRequests,
      "selecting and clearing do not refetch the roster",
    );

    await select(childFilter, "child-b");
    lookup = Promise.resolve(response([children[2]]));
    await act(async () => refresh().click());
    await settle();
    assert.equal(
      filter("Filter by child").value,
      "",
      "refresh clears a removed selection",
    );
    assert.equal(filter("Filter by child").options.length, 2);
    lookup = Promise.resolve(response([]));
    await act(async () => refresh().click());
    await settle();
    assert.equal(filter("Filter by child").disabled, true);
    assert.equal(filter("Filter by child").options.length, 1);
    lookup = Promise.resolve(response({ code: "FORBIDDEN" }, 403));
    await act(async () => refresh().click());
    await settle();
    assert.equal(
      container.querySelector('select[aria-label="Filter by child"]'),
      null,
    );
    assert.doesNotMatch(container.textContent ?? "", /Alex Moss/);
    lookup = Promise.resolve(response(children));
    const retry = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Retry",
    );
    assert.ok(retry);
    await act(async () => retry.click());
    await settle();
    assert.equal(filter("Filter by child").options.length, 4);

    lookup = Promise.resolve(response(parents));
    await mount(<ParentsPage />, "parents");
    const parentFilter = filter("Filter by parent or guardian");
    assert.deepEqual(
      [...parentFilter.options].map((option) => option.value),
      ["", "parent-a", "parent-b"],
    );
    assert.match(parentFilter.options[1].text, /a@example.test/);
    await select(parentFilter, "parent-b");
    assert.equal(rowCount(), 1);
    const childrenFilter = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Filter by children count"]',
    );
    assert.ok(childrenFilter);
    await select(childrenFilter, "with");
    assert.doesNotMatch(
      container.querySelector("tbody")?.textContent ?? "",
      /Sam Lane/,
    );
    await select(childrenFilter, "all");
    await select(parentFilter, "");
    assert.equal(rowCount(), 2);
    lookup = Promise.resolve(response([]));
    await act(async () => refresh().click());
    await settle();
    assert.equal(filter("Filter by parent or guardian").disabled, true);
    assert.equal(filter("Filter by parent or guardian").options.length, 1);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = nativeFetch;
    dom.window.close();
  }
}

void run().then(
  () => process.stdout.write("Database record filters: passed\n"),
  (error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  },
);
