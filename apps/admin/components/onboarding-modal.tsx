"use client";

import React from "react";
import { useSession } from "@/lib/use-session-compat";
import { Button, Card } from "@pathway/ui";
import { updateUserProfile } from "@/lib/api-client";

export const OnboardingModal: React.FC<{
  onComplete: () => void;
}> = ({ onComplete }) => {
  const { data: session, update: updateSession } = useSession();
  const [name, setName] = React.useState(
    session?.user?.name || session?.user?.email?.split("@")[0] || "",
  );
  const [displayName, setDisplayName] = React.useState(
    session?.user?.name || "",
  );
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await updateUserProfile({
        name: name.trim() || undefined,
        displayName: displayName.trim() || undefined,
      });

      // Refresh session to get updated user data
      await updateSession();

      onComplete();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update profile",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md p-6 shadow-xl">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-text-primary">
            Welcome to Nexsteps!
          </h2>
          <p className="mt-2 text-sm text-text-muted">
            Let's make sure your profile information is correct.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-text-primary"
            >
              Full Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-border-subtle px-3 py-2 text-text-primary shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="John Doe"
            />
          </div>

          <div>
            <label
              htmlFor="displayName"
              className="block text-sm font-medium text-text-primary"
            >
              Display Name (optional)
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-border-subtle px-3 py-2 text-text-primary shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="How you'd like to be displayed"
            />
            <p className="mt-1 text-xs text-text-muted">
              This is how your name will appear to others. If left empty, your
              full name will be used.
            </p>
          </div>

          {error && (
            <div className="rounded-md bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? "Saving..." : "Save & Continue"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

