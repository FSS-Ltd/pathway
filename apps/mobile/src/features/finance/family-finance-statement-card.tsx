import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { mobileTokens } from "@/design/tokens";
import { ApiError } from "@/lib/api/client";
import {
  downloadFamilyDocument,
  formatFinanceAmount,
  type FamilyStatement,
} from "./family-finance-api";

export function FamilyFinanceStatementCard({
  statement,
}: {
  statement: FamilyStatement;
}) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const periodEnd = new Date(new Date(statement.periodEnd).getTime() - 1);
  const period = `${formatDate(statement.periodStart)} – ${formatDate(periodEnd.toISOString())}`;

  const download = async () => {
    setError(null);
    setIsDownloading(true);
    try {
      await downloadFamilyDocument(
        `/finance/payer-accounts/${encodeURIComponent(statement.payerAccountId)}/statements/${encodeURIComponent(statement.id)}/download`,
        `statement-${statement.id}.pdf`,
      );
    } catch (downloadError) {
      setError(
        downloadError instanceof ApiError && downloadError.status === 403
          ? "Finance access changed. Ask the school office to check your access."
          : downloadError instanceof Error
            ? downloadError.message
            : "The statement could not be downloaded. Try again.",
      );
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.details}>
        <Text style={styles.period}>{period}</Text>
        <Text style={styles.kind}>
          {statement.kind === "MONTH_END"
            ? "Monthly statement"
            : "Requested statement"}
        </Text>
      </View>
      <View style={styles.balanceBlock}>
        <Text style={styles.balanceLabel}>Closing balance</Text>
        <Text style={styles.balance}>
          {formatFinanceAmount(
            statement.totals.closingBalanceMinor,
            statement.currency,
          )}
        </Text>
      </View>
      {statement.status === "READY" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: isDownloading }}
          disabled={isDownloading}
          onPress={() => void download()}
          style={({ pressed }) => [
            styles.download,
            pressed ? styles.pressed : undefined,
          ]}
        >
          <Text style={styles.downloadLabel}>
            {isDownloading ? "Preparing statement…" : "Download statement"}
          </Text>
        </Pressable>
      ) : (
        <Text style={styles.status}>
          {statement.status === "GENERATING"
            ? "Statement is being prepared."
            : "This statement isn’t available yet."}
        </Text>
      )}
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  card: {
    gap: mobileTokens.spacing.sm,
    borderWidth: 1,
    borderColor: mobileTokens.colors.border.subtle,
    borderRadius: mobileTokens.radius.lg,
    backgroundColor: mobileTokens.colors.bg.surface,
    padding: mobileTokens.spacing.md,
  },
  details: { gap: mobileTokens.spacing.xxxs },
  period: {
    color: mobileTokens.colors.text.primary,
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontSize: mobileTokens.typography.heading.xs.size,
    fontWeight: mobileTokens.typography.weight.bold,
  },
  kind: {
    color: mobileTokens.colors.text.muted,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
  },
  balanceBlock: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: mobileTokens.spacing.sm,
  },
  balanceLabel: {
    color: mobileTokens.colors.text.muted,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
  },
  balance: {
    color: mobileTokens.colors.text.primary,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.md.size,
    fontWeight: mobileTokens.typography.weight.bold,
  },
  download: {
    minHeight: 44,
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  downloadLabel: {
    color: mobileTokens.colors.accent.primary,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.bold,
  },
  status: {
    color: mobileTokens.colors.text.muted,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
  },
  error: {
    color: mobileTokens.colors.status.danger,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
  },
  pressed: { opacity: 0.8 },
});
