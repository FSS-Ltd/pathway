import assert from "node:assert/strict";
import { formatFinanceMoney, parseFinanceMajorAmount } from "./finance-format";

assert.equal(formatFinanceMoney("123456", "GBP"), "£1,234.56");
assert.equal(formatFinanceMoney("123456", "HUF"), "HUF\u00a01,234.56");
assert.equal(parseFinanceMajorAmount("1234.5", "EUR"), "123450");
assert.equal(parseFinanceMajorAmount("1234", "HUF"), "123400");
assert.equal(parseFinanceMajorAmount("1.0", "HUF"), "100");
assert.equal(parseFinanceMajorAmount("1.234", "GBP"), null);
