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
  hint: "Enter at least two characters. Only current site staff appear.",
  intro: "Search for a colleague to start a private conversation.",
  noMatch: "No staff match this search at your active site.",
  searchError: "Unable to search staff.",
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
      copy={staffCopy}
    />
  );
}
