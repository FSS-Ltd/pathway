"use client";

import * as React from "react";
import {
  searchStaffRecipients,
  type StaffRecipient,
} from "@/lib/ace-messaging-api";
import { RecipientPicker } from "./recipient-picker";

const staffCopy = {
  title: "New message",
  label: "To: Staff member at this site",
  placeholder: "Search staff at this site",
  hint: "Choose a colleague or search by name. Only current site staff appear.",
  intro: "No other staff are available at this site.",
  noMatch: "No staff match this search at your active site.",
  searchError: "Unable to load staff. Try again.",
  openError: "Unable to start this conversation. Try again.",
};

export function NewStaffConversation({
  onCancel,
  onOpen,
}: {
  onCancel: () => void;
  onOpen: (recipient: StaffRecipient) => Promise<boolean>;
}) {
  return (
    <RecipientPicker
      onCancel={onCancel}
      onOpen={onOpen}
      searchRecipients={searchStaffRecipients}
      searchId="staff-recipient-search"
      minSearchLength={0}
      copy={staffCopy}
    />
  );
}
