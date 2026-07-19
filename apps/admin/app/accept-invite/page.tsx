"use client";

import React, { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { Button, Card } from "@pathway/ui";
import { acceptInvite, setActiveSite } from "../../lib/api-client";

function AcceptInviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();

  const [state, setState] = React.useState<
    "welcome" | "loading" | "success" | "error" | "selecting_site"
  >("welcome");
  const [error, setError] = React.useState<string | null>(null);
  const [sites, setSites] = React.useState<
    Array<{ id: string; name: string; orgName?: string | null }>
  >([]);
  const [selectedSiteId, setSelectedSiteId] = React.useState<string | null>(
    null,
  );

  const token = searchParams?.get("token");

  // When user authenticates, accept the invite
  React.useEffect(() => {
    if (status === "loading") return;

    if (status === "authenticated" && token && state === "welcome") {
      // Check if user has been created in DB
      const userId = (session as any)?.user?.id;
      if (!userId) {
        console.error("[ACCEPT-INVITE] User authenticated but not in DB! Showing error.");
        setState("error");
        setError(
          "Your account was created but we encountered an issue completing the setup. " +
          "Please refresh this page or contact support if the problem persists."
        );
        return;
      }
      
      setState("loading");
      void handleAcceptInvite();
    }
  }, [status, token, state, session]);

  const handleSignUp = () => {
    if (!token) return;

    // Redirect to Auth0 for signup
    // Auth0 handles email verification, password requirements, etc.
    void signIn("auth0", {
      callbackUrl: `/accept-invite?token=${token}`,
    });
  };

  const handleAcceptInvite = async () => {
    if (!token) {
      setState("error");
      setError("No invite token provided");
      return;
    }

    try {
      const result = await acceptInvite(token);

      if (result.activeSiteId) {
        // Single site - auto-selected
        await setActiveSite(result.activeSiteId);
        setState("success");
        // Redirect to welcome page instead of dashboard
        setTimeout(() => {
          router.push("/welcome");
        }, 2000);
      } else if (result.sites.length > 0) {
        // Multiple sites - show picker
        setSites(result.sites);
        setState("selecting_site");
      } else {
        // No sites
        setState("error");
        setError(
          "You don't have access to any sites yet. Please contact your administrator.",
        );
      }
    } catch (err) {
      setState("error");
      const errorMessage =
        err instanceof Error ? err.message : "Failed to accept invite";

      // Better error messaging
      if (errorMessage.includes("email")) {
        setError(
          "This invite is for a different email address. Please sign out and create an account with the email that received this invitation.",
        );
      } else if (errorMessage.includes("expired")) {
        setError(
          "This invite has expired. Please contact your administrator to request a new invitation.",
        );
      } else if (errorMessage.includes("revoked")) {
        setError(
          "This invite has been revoked. Please contact your administrator for assistance.",
        );
      } else {
        setError(errorMessage);
      }
    }
  };

  const handleSelectSite = async () => {
    if (!selectedSiteId) {
      alert("Please select a site");
      return;
    }

    try {
      await setActiveSite(selectedSiteId);
      setState("success");
      // Redirect to welcome page
      setTimeout(() => {
        router.push("/welcome");
      }, 1000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to set active site",
      );
    }
  };

  // Welcome/Signup Screen
  if (state === "welcome") {
    // If authenticated but got here, there was an error - show different message
    if (status === "authenticated") {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-teal-50">
          <Card className="p-12 max-w-lg shadow-2xl border-0">
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="flex items-center justify-center w-16 h-16 bg-gradient-to-br from-teal-500 to-blue-600 rounded-2xl shadow-lg">
                <span className="text-3xl font-bold text-white">N</span>
              </div>

              <div className="space-y-3">
                <h1 className="text-3xl font-bold text-gray-900">
                  Welcome Back!
                </h1>
                <p className="text-lg text-gray-600">
                  There was an issue setting up your account
                </p>
              </div>

              <p className="text-gray-600 max-w-md leading-relaxed">
                It looks like your account exists but isn't fully set up yet.
                Let's try accepting your invitation again.
              </p>

              <div className="flex flex-col gap-3 w-full">
                <Button
                  onClick={() => {
                    setState("loading");
                    void handleAcceptInvite();
                  }}
                  className="px-8 py-3 text-lg bg-gradient-to-r from-teal-500 to-blue-600 hover:from-teal-600 hover:to-blue-700 shadow-lg hover:shadow-xl transition-all"
                >
                  Continue Setup
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    window.location.href = `/api/auth/signout?callbackUrl=/accept-invite?token=${token}`;
                  }}
                  className="text-gray-600"
                >
                  Sign out and start fresh
                </Button>
              </div>
            </div>
          </Card>
        </div>
      );
    }

    // Unauthenticated - show signup screen
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-teal-50">
        <Card className="p-12 max-w-lg shadow-2xl border-0">
          <div className="flex flex-col items-center gap-6 text-center">
            {/* Logo/Brand */}
            <div className="flex items-center justify-center w-16 h-16 bg-gradient-to-br from-teal-500 to-blue-600 rounded-2xl shadow-lg">
              <span className="text-3xl font-bold text-white">N</span>
            </div>

            {/* Welcome Message */}
            <div className="space-y-3">
              <h1 className="text-3xl font-bold text-gray-900">
                You've Been Invited!
              </h1>
              <p className="text-lg text-gray-600">
                Join your team on Nexsteps
              </p>
            </div>

            <p className="text-gray-600 max-w-md leading-relaxed">
              Create your account to start managing your organization. You'll
              have instant access to your site and can start collaborating with
              your team right away.
            </p>

            {/* CTA Button */}
            <Button
              onClick={handleSignUp}
              className="px-8 py-3 text-lg bg-gradient-to-r from-teal-500 to-blue-600 hover:from-teal-600 hover:to-blue-700 shadow-lg hover:shadow-xl transition-all"
            >
              Create Your Account
            </Button>

            <p className="text-xs text-gray-500">
              Already have an account?{" "}
              <button
                onClick={handleSignUp}
                className="text-teal-600 hover:text-teal-700 font-medium hover:underline"
              >
                Sign in instead
              </button>
            </p>
          </div>
        </Card>
      </div>
    );
  }

  // Loading Screen
  if (status === "loading" || state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-teal-50">
        <Card className="p-8 max-w-md border-0 shadow-xl">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-teal-500"></div>
            <p className="text-gray-600 font-medium">Setting up your account...</p>
          </div>
        </Card>
      </div>
    );
  }

  // Error Screen
  if (state === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-teal-50">
        <Card className="p-8 max-w-lg border-0 shadow-xl">
          <div className="flex flex-col gap-6">
            <div className="text-center">
              <div className="text-5xl mb-4">⚠️</div>
              <h1 className="text-2xl font-bold text-red-600 mb-2">
                Unable to Accept Invite
              </h1>
            </div>
            <p className="text-gray-600 text-center">{error}</p>
            <div className="flex flex-col gap-2">
              {error?.includes("email") && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    // Sign out and redirect back to this invite
                    window.location.href = `/api/auth/signout?callbackUrl=/accept-invite?token=${token}`;
                  }}
                  className="w-full"
                >
                  Sign out and try with a different account
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => (window.location.href = "https://nexsteps.dev")}
                className="w-full"
              >
                Go to Nexsteps Home
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // Site Selection Screen
  if (state === "selecting_site") {
    const groupedSites = sites.reduce(
      (acc, site) => {
        const orgName = site.orgName || "Unknown Org";
        if (!acc[orgName]) {
          acc[orgName] = [];
        }
        acc[orgName]!.push(site);
        return acc;
      },
      {} as Record<string, typeof sites>,
    );

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-teal-50">
        <Card className="p-8 max-w-md border-0 shadow-xl">
          <div className="flex flex-col gap-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Choose Your Site
              </h1>
              <p className="text-gray-600">
                You have access to multiple sites. Select one to continue.
              </p>
            </div>

            <div className="space-y-3">
              {Object.entries(groupedSites).map(([orgName, orgSites]) => (
                <div key={orgName}>
                  <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                    {orgName}
                  </p>
                  <div className="space-y-2">
                    {orgSites.map((site) => (
                      <label
                        key={site.id}
                        className="flex items-center gap-3 p-4 rounded-lg border-2 border-gray-200 hover:border-teal-500 hover:bg-teal-50 cursor-pointer transition-all"
                      >
                        <input
                          type="radio"
                          name="site"
                          value={site.id}
                          checked={selectedSiteId === site.id}
                          onChange={() => setSelectedSiteId(site.id)}
                          className="w-4 h-4 text-teal-600 focus:ring-teal-500"
                        />
                        <span className="font-medium text-gray-900">
                          {site.name}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <Button
              onClick={handleSelectSite}
              disabled={!selectedSiteId}
              className="w-full bg-gradient-to-r from-teal-500 to-blue-600 hover:from-teal-600 hover:to-blue-700"
            >
              Continue to Dashboard
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Success Screen
  if (state === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-teal-50">
        <Card className="p-8 max-w-md border-0 shadow-xl">
          <div className="flex flex-col items-center gap-4">
            <div className="text-6xl">🎉</div>
            <h1 className="text-2xl font-bold text-green-600">
              Welcome to Nexsteps!
            </h1>
            <p className="text-center text-gray-600">
              Taking you to your dashboard...
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return null;
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-teal-50">
          <Card className="p-8 max-w-md border-0 shadow-xl">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-teal-500"></div>
              <p className="text-gray-600 font-medium">Loading...</p>
            </div>
          </Card>
        </div>
      }
    >
      <AcceptInviteContent />
    </Suspense>
  );
}
