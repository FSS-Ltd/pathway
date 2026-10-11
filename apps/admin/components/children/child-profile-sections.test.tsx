import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChildProfileNavigation } from "./child-profile-navigation";
import { ChildGuardianSection } from "./child-guardian-section";

const staffNavigation = renderToStaticMarkup(
  <ChildProfileNavigation showAttendance showRegistration />,
);
assert.match(staffNavigation, /href="#attendance"/);
assert.match(staffNavigation, /href="#registration"/);
assert.match(staffNavigation, /aria-label="Profile sections"/);

const limitedNavigation = renderToStaticMarkup(
  <ChildProfileNavigation showAttendance={false} />,
);
assert.doesNotMatch(limitedNavigation, /href="#attendance"/);
assert.doesNotMatch(limitedNavigation, /href="#registration"/);
assert.match(limitedNavigation, /href="#guardians"/);

const emptyContacts = renderToStaticMarkup(
  <ChildGuardianSection contacts={[]} />,
);
assert.match(emptyContacts, /No guardian contacts have been recorded/);

const contact = renderToStaticMarkup(
  <ChildGuardianSection
    contacts={[
      {
        id: "one",
        fullName: "Morgan Lee",
        email: "morgan@example.org",
        phone: null,
        relationshipToChild: "Parent",
        contactType: "PRIMARY_GUARDIAN",
      },
    ]}
  />,
);
assert.match(contact, /morgan@example.org/);
assert.match(contact, /Not provided/);
