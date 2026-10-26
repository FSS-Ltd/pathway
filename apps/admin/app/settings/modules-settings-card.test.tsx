import "@/lib/register-test-styles";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ModulesSettingsCard } from "./modules-settings-card";

Object.assign(globalThis, { React });

const base = {
  modules: [],
  canToggle: false,
  isLoading: false,
  savingModule: null,
  error: null,
  onToggle: () => {},
};
const master = renderToStaticMarkup(
  <ModulesSettingsCard {...base} canToggleFinance />,
);
assert.match(master, /aria-label="Toggle Finance"/);
assert.equal((master.match(/type="checkbox"/g) ?? []).length, 1);
assert.match(master, /No subscription charge/);
const customer = renderToStaticMarkup(<ModulesSettingsCard {...base} />);
assert.doesNotMatch(customer, /type="checkbox"/);
const saving = renderToStaticMarkup(
  <ModulesSettingsCard {...base} canToggleFinance savingModule="FINANCE" />,
);
assert.match(saving, /disabled=""/);
assert.match(saving, /role="status"/);
const error = renderToStaticMarkup(
  <ModulesSettingsCard {...base} error="Unable to save" />,
);
assert.match(error, /role="alert"/);
console.log(
  "Module settings: Master-only Finance, customer read-only, pending and error states passed.",
);
