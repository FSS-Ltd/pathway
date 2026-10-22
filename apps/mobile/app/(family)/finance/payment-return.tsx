import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import { BrandedCard, StandardButton } from "@/components/primitives/ui";
import { Screen } from "@/components/primitives/screen";
import { mobileTokens } from "@/design/tokens";
import { useAppReady } from "@/hooks/use-app-ready";
import { ApiError } from "@/lib/api/client";
import {
  getPayerCheckoutStatus,
  type PayerCheckoutStatus,
} from "@/features/finance/family-finance-api";

type PaymentState =
  | { status: "loading" }
  | {
      status: "CHECKING" | "CONFIRMED" | "EXPIRED" | "FAILED";
      checkedAt: string;
    }
  | { status: "unavailable" }
  | { status: "error" };

export default function FamilyFinancePaymentReturnRoute() {
  const params = useLocalSearchParams<{ attemptId?: string | string[] }>();
  const attemptId = Array.isArray(params.attemptId)
    ? params.attemptId[0]
    : params.attemptId;
  const { bootstrapState } = useAppReady();
  const [state, setState] = useState<PaymentState>({ status: "loading" });

  const refresh = useCallback(async () => {
    if (!attemptId || bootstrapState.status !== "ready") {
      setState({ status: "unavailable" });
      return;
    }
    setState((current) =>
      current.status === "CONFIRMED" ? current : { status: "loading" },
    );
    try {
      const status: PayerCheckoutStatus =
        await getPayerCheckoutStatus(attemptId);
      setState({ status: status.status, checkedAt: status.checkedAt });
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setState({ status: "unavailable" });
      } else {
        setState({ status: "error" });
      }
    }
  }, [attemptId, bootstrapState.status]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      return undefined;
    }, [refresh]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const title = paymentTitle(state.status);
  const message = paymentMessage(state.status);

  return (
    <Screen
      tone="family"
      badge="Family Space"
      title="Payment status"
      subtitle="Status comes from the school’s Finance ledger."
    >
      <BrandedCard style={styles.card}>
        {state.status === "loading" ? (
          <View style={styles.loading}>
            <ActivityIndicator color={mobileTokens.colors.accent.primary} />
            <Text style={styles.message}>Checking with the school…</Text>
          </View>
        ) : (
          <>
            <Text accessibilityLiveRegion="polite" style={styles.title}>
              {title}
            </Text>
            <Text accessibilityLiveRegion="polite" style={styles.message}>
              {message}
            </Text>
            {state.status === "CHECKING" ? (
              <Text style={styles.reminder}>
                Please don’t pay again while we’re checking.
              </Text>
            ) : null}
            {"checkedAt" in state ? (
              <Text style={styles.updated}>
                Last checked {formatTime(state.checkedAt)}
              </Text>
            ) : null}
          </>
        )}
        <View style={styles.actions}>
          <StandardButton
            label="Check again"
            tone="family"
            variant="secondary"
            onPress={() => void refresh()}
            disabled={state.status === "loading"}
          />
          <StandardButton
            label="Return to Finance"
            tone="family"
            variant="white"
            onPress={() => router.replace("/(family)/(tabs)/finance")}
          />
        </View>
      </BrandedCard>
    </Screen>
  );
}

function paymentTitle(status: PaymentState["status"]): string {
  if (status === "CONFIRMED") return "Payment confirmed";
  if (status === "CHECKING") return "Payment is processing";
  if (status === "EXPIRED") return "Checkout expired";
  if (status === "FAILED") return "Payment couldn’t be completed";
  if (status === "unavailable") return "Finance access unavailable";
  if (status === "error") return "We couldn’t check yet";
  return "Checking payment";
}

function paymentMessage(status: PaymentState["status"]): string {
  if (status === "CONFIRMED")
    return "The school’s account confirmed this payment.";
  if (status === "CHECKING")
    return "The school’s payment provider hasn’t confirmed the result yet.";
  if (status === "EXPIRED" || status === "FAILED") {
    return "Check the invoice balance before starting another payment.";
  }
  if (status === "unavailable") {
    return "Your Finance access has changed. Contact the school office if you need help.";
  }
  if (status === "error")
    return "Your payment may still be processing. Check again shortly.";
  return "We’re asking the school’s payment provider for an update.";
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  card: { gap: mobileTokens.spacing.md },
  loading: {
    minHeight: 128,
    alignItems: "center",
    justifyContent: "center",
    gap: mobileTokens.spacing.sm,
  },
  title: {
    color: mobileTokens.colors.text.primary,
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontSize: mobileTokens.typography.heading.md.size,
    fontWeight: mobileTokens.typography.weight.bold,
  },
  message: {
    color: mobileTokens.colors.text.muted,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
  },
  reminder: {
    color: mobileTokens.colors.text.primary,
    backgroundColor: mobileTokens.colors.accent.familySoft,
    borderRadius: mobileTokens.radius.md,
    padding: mobileTokens.spacing.sm,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.md.size,
    fontWeight: mobileTokens.typography.weight.bold,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
  },
  updated: {
    color: mobileTokens.colors.text.subtle,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.xs.size,
  },
  actions: { gap: mobileTokens.spacing.xs },
});
