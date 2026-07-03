import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Card } from "./card";

const markup = renderToStaticMarkup(
  <Card
    title="People"
    description="Manage members"
    actions={<button>Refresh</button>}
  >
    Content
  </Card>,
);

assert.match(
  markup,
  /flex-col/,
  "card headers stack title and actions on narrow screens",
);
assert.match(
  markup,
  /sm:flex-row/,
  "card headers return to a row layout at larger breakpoints",
);
assert.match(
  markup,
  /w-full/,
  "card actions can use the full mobile width",
);
assert.match(
  markup,
  /sm:w-auto/,
  "card actions shrink to content width on larger screens",
);

console.log("card responsive header checks passed");
