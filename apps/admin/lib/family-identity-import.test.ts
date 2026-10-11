import assert from "node:assert/strict";
import {
  familyIdentityTemplate,
  parseFamilyIdentityCsv,
} from "./family-identity-import";

const firstChild = "11111111-1111-4111-8111-111111111111";
const secondChild = "22222222-2222-4222-8222-222222222222";
const roster = new Map([
  [firstChild, "Ada, Junior"],
  [secondChild, "Bea"],
]);
const header = "childId,childName,target,email,reviewBasis,confirmed";

const parsed = parseFamilyIdentityCsv(
  [
    header,
    `${firstChild},"Ada, Junior",GUARDIAN,Guardian@Example.org,SCHOOL_RECORDS,yes`,
    `${secondChild},Bea,GUARDIAN,guardian@example.org,LEGAL_DOCUMENT,yes`,
    `${firstChild},"Ada, Junior",STUDENT,ada@example.org,,yes`,
  ].join("\r\n"),
  roster,
);
assert.deepEqual(parsed.errors, []);
assert.deepEqual(
  parsed.rows.map(({ csvRow }) => csvRow),
  [2, 3, 4],
);
assert.equal(parsed.rows[0].row.email, "guardian@example.org");
assert.equal(parsed.rows[1].row.target, "GUARDIAN");
assert.equal(parsed.rows[2].row.target, "STUDENT");

const invalid = parseFamilyIdentityCsv(
  [
    header,
    `${firstChild},"Ada, Junior",STUDENT,ada@example.org,,no`,
    `${firstChild},"Ada, Junior",STUDENT,ada@example.org,,yes`,
    `${firstChild},"Ada, Junior",STUDENT,other@example.org,,yes`,
    `${secondChild},Bea,GUARDIAN,guardian@example.org,,yes`,
    `33333333-3333-4333-8333-333333333333,Other,GUARDIAN,other@example.org,SCHOOL_RECORDS,yes`,
    `${secondChild},Wrong,GUARDIAN,new@example.org,SCHOOL_RECORDS,yes`,
  ].join("\n"),
  roster,
);
assert.equal(invalid.rows.length, 1);
assert.equal(invalid.errors.length, 5);
assert.match(invalid.errors.join(" "), /confirmation must be yes/);
assert.match(invalid.errors.join(" "), /duplicate invitation/);
assert.match(invalid.errors.join(" "), /current site roster/);
assert.match(invalid.errors.join(" "), /child name does not match/);

const template = familyIdentityTemplate([
  { id: firstChild, fullName: 'Ada "A", Junior' },
]);
assert.match(template, /"Ada ""A"", Junior"/);
assert.match(
  familyIdentityTemplate([{ id: firstChild, fullName: "=HYPERLINK(1)" }]),
  /"'=HYPERLINK\(1\)"/,
);
assert.deepEqual(parseFamilyIdentityCsv(template, roster), {
  rows: [],
  errors: ["Add at least one completed invitation row."],
});

assert.throws(
  () => parseFamilyIdentityCsv(`${header}\n${firstChild},"unclosed`, roster),
  /Unclosed CSV quote/,
);
