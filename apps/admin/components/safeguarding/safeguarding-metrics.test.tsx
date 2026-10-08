import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SafeguardingMetrics } from "./safeguarding-metrics";

const failedConcerns = renderToStaticMarkup(
  <SafeguardingMetrics openConcerns={null} totalNotes={0} />,
);
assert.match(failedConcerns, /Open concerns<\/p><p[^>]*>—<\/p>/);
assert.match(failedConcerns, /Positive notes \(total\)<\/p><p[^>]*>0<\/p>/);

const failedNotes = renderToStaticMarkup(
  <SafeguardingMetrics openConcerns={0} totalNotes={null} />,
);
assert.match(failedNotes, /Open concerns<\/p><p[^>]*>0<\/p>/);
assert.match(failedNotes, /Positive notes \(total\)<\/p><p[^>]*>—<\/p>/);

process.stdout.write("safeguarding unavailable counts: passed\n");
