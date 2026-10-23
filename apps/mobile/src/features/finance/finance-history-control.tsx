import { Pressable, StyleSheet, Text, View } from "react-native";
import { mobileTokens } from "@/design/tokens";
import type {
  FinanceHistoryKind,
  FinanceHistoryPage,
} from "./use-family-finance-accounts";

export function FinanceHistoryControl({
  kind,
  accountName,
  page,
  onLoadMore,
}: {
  kind: FinanceHistoryKind;
  accountName: string;
  page: Pick<FinanceHistoryPage<unknown>, "nextCursor" | "status">;
  onLoadMore: () => void;
}) {
  const loading = page.status === "loading";
  const failed = page.status === "error";
  if (!page.nextCursor)
    return (
      <Text accessibilityLiveRegion="polite" style={styles.status}>
        All {kind} loaded.
      </Text>
    );
  const label = failed ? `Retry loading ${kind}` : `Load more ${kind}`;
  return (
    <View>
      {failed ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          More {kind} could not be loaded. Try again.
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} for ${accountName}`}
        accessibilityState={{ disabled: loading, busy: loading }}
        disabled={loading}
        onPress={onLoadMore}
        style={styles.button}
      >
        <Text accessibilityLiveRegion="polite" style={styles.label}>
          {loading ? `Loading more ${kind}…` : label}
        </Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  button: { minHeight: 44, justifyContent: "center", alignItems: "center" },
  label: {
    color: mobileTokens.colors.text.primary,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.semibold,
  },
  status: {
    color: mobileTokens.colors.text.muted,
    fontFamily: mobileTokens.typography.fontFamily.body,
  },
  error: {
    color: mobileTokens.colors.status.danger,
    fontFamily: mobileTokens.typography.fontFamily.body,
  },
});
