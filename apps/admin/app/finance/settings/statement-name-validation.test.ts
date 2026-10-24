import assert from "node:assert/strict";
import { validateStatementName } from "./statement-name-validation";

for (const name of [
  "SCHOOL",
  "A".repeat(22),
  " Example School ",
  "École Example",
  "School 123",
])
  assert.equal(validateStatementName(name), null, name);
for (const name of [
  "ABCD",
  "A".repeat(23),
  "123456",
  "SCHOOL*",
  "SCHOOL<",
  "SCHOOL>",
  "SCHOOL\\",
  "SCHOOL'",
  'SCHOOL"',
  "School\nName",
  "School😀",
  "School学校",
  "ШКОЛА",
  "     ",
])
  assert.ok(validateStatementName(name), name);
