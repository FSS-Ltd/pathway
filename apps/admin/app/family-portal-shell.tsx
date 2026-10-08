"use client";

import Image from "next/image";
import { UserButton } from "@clerk/nextjs";

export function FamilyPortalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-shell text-text-primary">
      <header className="border-b border-border-subtle bg-surface">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Image src="/NSLogo.svg" alt="" width={36} height={36} />
            <span className="font-heading text-lg font-semibold tracking-tight">
              Nexsteps <span className="text-text-muted">ACE</span>
            </span>
          </div>
          <UserButton
            appearance={{
              elements: { userButtonTrigger: "min-h-11 min-w-11" },
            }}
          />
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </div>
    </div>
  );
}
