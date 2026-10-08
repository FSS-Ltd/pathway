import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import {
  SidebarNav,
  type SidebarNavItem,
  type SidebarNavProps,
} from "@pathway/ui";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});

const items: SidebarNavItem[] = [
  { label: "Dashboard", href: "/", matchMode: "exact" },
  {
    label: "ACE overview",
    href: "/ace",
    matchMode: "exact",
    group: "Teaching",
  },
  { label: "PACE", href: "/ace/pace", group: "Teaching" },
  { label: "PACE inventory", href: "/ace/pace/inventory", group: "Teaching" },
  { label: "Messages", href: "/ace/messages", group: "Communication" },
  { label: "My schedule", href: "/my-schedule", group: "Schedule" },
  { label: "Settings", href: "/settings", group: "Admin" },
  { label: "Roles & Access", href: "/settings/roles", group: "Admin" },
];

function selected(nav: Element): string[] {
  return Array.from(nav.querySelectorAll('a[aria-current="page"]')).map(
    (link) => link.getAttribute("href") ?? "",
  );
}

function groupButton(nav: Element, label: string): HTMLButtonElement {
  const button = Array.from(nav.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  assert.ok(button instanceof dom.window.HTMLButtonElement);
  return button as HTMLButtonElement;
}

async function run(): Promise<void> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const defaultMarkup = renderToStaticMarkup(
    <SidebarNav items={items} currentPath="/ace" />,
  );
  assert.match(defaultMarkup, /<a href="\/ace"/);

  const { createRoot } = await import("react-dom/client");
  const root = createRoot(
    document.body.appendChild(document.createElement("div")),
  );
  let setRoute!: React.Dispatch<React.SetStateAction<string>>;
  let mounts = 0;

  function Harness() {
    const [route, updateRoute] = React.useState("/settings/roles");
    setRoute = updateRoute;
    React.useEffect(() => {
      mounts += 1;
    }, []);
    const renderLink: SidebarNavProps["renderLink"] = (props) => (
      <a
        {...props}
        onClick={(event) => {
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          event.preventDefault();
          window.history.pushState(null, "", props.href);
          updateRoute(props.href);
        }}
      />
    );
    return (
      <>
        <output data-route={route} />
        <SidebarNav
          items={items}
          currentPath={route}
          renderLink={renderLink}
          className="desktop"
        />
        <SidebarNav
          items={items}
          currentPath={route}
          renderLink={renderLink}
          className="mobile"
        />
      </>
    );
  }

  await act(async () => root.render(<Harness />));
  const navs = document.querySelectorAll("nav");
  assert.equal(navs.length, 2);
  assert.notEqual(
    groupButton(navs[0], "Admin").getAttribute("aria-controls"),
    groupButton(navs[1], "Admin").getAttribute("aria-controls"),
    "desktop and mobile group panels have unique IDs",
  );
  const expectActive = async (path: string, href: string) => {
    await act(async () => setRoute(path));
    for (const nav of navs) {
      assert.deepEqual(selected(nav), [href], `one active link at ${path}`);
    }
  };

  await expectActive("/settings/roles", "/settings/roles");
  await act(async () => groupButton(navs[0], "Schedule").click());
  assert.equal(
    groupButton(navs[0], "Schedule").getAttribute("aria-expanded"),
    "true",
  );
  await expectActive("/ace/pace/inventory", "/ace/pace/inventory");
  assert.equal(
    groupButton(navs[0], "Teaching").getAttribute("aria-expanded"),
    "true",
  );
  assert.equal(
    groupButton(navs[0], "Schedule").getAttribute("aria-expanded"),
    "true",
  );
  await expectActive("/ace/pace/", "/ace/pace");
  await expectActive("/ace/pace////", "/ace/pace");
  await expectActive("/ace", "/ace");
  await expectActive("/ace/messages", "/ace/messages");
  await expectActive("/settings/roles/", "/settings/roles");
  await expectActive("/ace/pace/inventory-extra", "/ace/pace");

  const mobileInventory = navs[1].querySelector<HTMLAnchorElement>(
    'a[href="/ace/pace/inventory"]',
  );
  assert.ok(mobileInventory);
  await act(async () => mobileInventory.click());
  assert.equal(
    document.querySelector("output")?.getAttribute("data-route"),
    "/ace/pace/inventory",
  );
  assert.equal(window.location.pathname, "/ace/pace/inventory");
  assert.equal(mounts, 1, "client navigation retains the provider boundary");
  for (const nav of navs)
    assert.deepEqual(selected(nav), ["/ace/pace/inventory"]);

  await act(async () => root.unmount());
  dom.window.close();
}

run().then(() => console.log("admin navigation runtime checks passed"));
