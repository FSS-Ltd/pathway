import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import { useQueryClient } from "@tanstack/react-query";

import { ContentCard, ListCard, NoticeCard, ScreenHeader, type ListCardItem } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import { isDeniedError } from "@/lib/api";
import type { SubscriptionStatus } from "@/lib/api/billing";
import { useCreateBillingPortalSession, useEntitlements } from "@/lib/queries/billing";

const STATUS_COPY: Record<SubscriptionStatus, string> = {
  TRIALING: "Trialing",
  ACTIVE: "Active",
  PAST_DUE: "Past due",
  CANCELED: "Canceled",
  INCOMPLETE: "Incomplete",
};

// Plan codes are internal identifiers (e.g. "GROWTH_99_MONTHLY") - GET
// /billing/entitlements has no display-name field (billing-plans.ts's
// displayName map is server-only, apps/api/src/billing/billing-plans.ts).
// Humanized client-side rather than adding a new backend field for one label.
function formatPlanCode(planCode: string): string {
  const withoutInterval = planCode.replace(/_(MONTHLY|YEARLY)$/, "");
  return withoutInterval
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default function MembershipScreen() {
  const queryClient = useQueryClient();
  const entitlementsQuery = useEntitlements();
  const createPortalSession = useCreateBillingPortalSession();
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  // openBrowserAsync (invalid URL, no browser available, ...) fails
  // separately from the createPortalSession mutation - it must surface
  // through the same "Could not open billing portal" notice below, not
  // swallow silently.
  const [portalOpenFailed, setPortalOpenFailed] = useState(false);

  const handleManageBilling = () => {
    setPortalOpenFailed(false);
    createPortalSession.mutate(undefined, {
      onSuccess: async (result) => {
        setIsOpeningPortal(true);
        try {
          await WebBrowser.openBrowserAsync(result.url);
          // The user may have cancelled, upgraded or updated payment
          // details in the portal - refetch so the plan card doesn't go
          // stale once they're back (matches the invalidate-on-mutation
          // convention every hook in lib/queries/org-people.ts follows).
          void queryClient.invalidateQueries({ queryKey: ["billing-entitlements"] });
        } catch {
          setPortalOpenFailed(true);
        } finally {
          setIsOpeningPortal(false);
        }
      },
    });
  };

  if (entitlementsQuery.isError) {
    const isLoadDenied = isDeniedError(entitlementsQuery.error);
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ScreenHeader eyebrow="Family · Membership" title="Could not load membership" />
          {isLoadDenied ? (
            <NoticeCard
              title="You can't view membership"
              body="Only admins can view billing and membership details."
              tone="danger"
            />
          ) : (
            <NoticeCard title="Something went wrong" body="Check your connection and try again." tone="danger" />
          )}
        </View>
      </SafeAreaView>
    );
  }

  if (entitlementsQuery.isLoading || !entitlementsQuery.data) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ScreenHeader eyebrow="Family · Membership" title="Loading..." />
        </View>
      </SafeAreaView>
    );
  }

  const { subscription, maxChildren, leaderSeatsIncluded } = entitlementsQuery.data;
  const hasBillingAccount = subscription !== null;
  const isBusy = createPortalSession.isPending || isOpeningPortal;

  const isPermissionDenied = createPortalSession.isError && isDeniedError(createPortalSession.error);
  const isOtherError = (!isPermissionDenied && createPortalSession.isError) || portalOpenFailed;

  const includedItems: ListCardItem[] = [
    { title: "Children", detail: maxChildren !== null ? `Up to ${maxChildren} children` : "Unlimited children" },
    {
      title: "Leader seats",
      detail:
        leaderSeatsIncluded !== null ? `${leaderSeatsIncluded} leader seats included` : "Unlimited leader seats",
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Family · Membership"
          title="Membership & billing"
          description="See your current plan and manage billing."
        />

        {subscription ? (
          <ContentCard
            title={formatPlanCode(subscription.planCode)}
            meta={STATUS_COPY[subscription.status]}
            body={
              subscription.cancelAtPeriodEnd
                ? `Ends ${formatDate(subscription.periodEnd)}`
                : `Renews ${formatDate(subscription.periodEnd)}`
            }
          />
        ) : (
          <NoticeCard title="No active plan" body="This household has no billing account yet." />
        )}

        <ListCard title="Included" items={includedItems} />

        <ContentCard
          title="Manage billing"
          body={
            hasBillingAccount
              ? "Update payment details, view invoices or change your plan."
              : "Manage billing becomes available once this household has a paid subscription."
          }
          action={hasBillingAccount ? (isBusy ? "Opening..." : "Open portal") : undefined}
          tone="mint"
          onPress={hasBillingAccount && !isBusy ? handleManageBilling : undefined}
        />

        {isPermissionDenied ? (
          <NoticeCard
            title="You can't manage billing"
            body="Only admins can manage billing and membership."
            tone="danger"
          />
        ) : isOtherError ? (
          <NoticeCard
            title="Could not open billing portal"
            body="Check your connection and try again."
            tone="danger"
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: homeTokens.colors.bg.shell,
  },
  content: {
    paddingHorizontal: homeTokens.layout.screenHorizontalPadding,
    paddingTop: homeTokens.metrics.screenContentTop,
    paddingBottom: homeTokens.metrics.tabBarAwareBottomPadding,
    gap: homeTokens.metrics.blockGap,
  },
});
