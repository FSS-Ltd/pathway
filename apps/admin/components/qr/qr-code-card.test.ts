import assert from "node:assert/strict";
import { escapeHtml } from "./QrCodeCard";

assert.equal(
  escapeHtml(`<img src=x onerror="alert('1')">&`),
  "&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;",
);
assert.equal(escapeHtml("https://example.com/a?b=1"), "https://example.com/a?b=1");
console.log("qr-code-card escapeHtml ok");
