import React from "react";

export function ConversationAvatar({ title }: { title: string }) {
  const initials = title
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <span
      aria-hidden="true"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-subtle font-heading text-sm font-bold text-teal-800"
    >
      {initials || "S"}
    </span>
  );
}
