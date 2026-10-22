import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";

import { mobileTokens } from "@/design/tokens";
import { ApiError } from "@/lib/api/client";
import {
  downloadFamilyDocument,
  formatFinanceAmount,
  getFamilyBankTransferDetails,
  minorToMajorInput,
  parseMajorAmountToMinor,
  startFamilyInvoiceCheckout,
  submitFamilyTransferNotice,
  type FamilyBankTransferDetails,
  type FamilyInvoice,
} from "./family-finance-api";

export function FamilyFinanceInvoiceCard({
  accountName,
  invoice,
  canPay,
  onRefresh,
}: {
  accountName: string;
  invoice: FamilyInvoice;
  canPay: boolean;
  onRefresh: () => void;
}) {
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isLoadingTransfer, setIsLoadingTransfer] = useState(false);
  const [isSubmittingTransfer, setIsSubmittingTransfer] = useState(false);
  const [transferDetails, setTransferDetails] =
    useState<FamilyBankTransferDetails | null>(null);
  const [transferAmount, setTransferAmount] = useState(() =>
    minorToMajorInput(invoice.balance.outstandingMinor, invoice.currency),
  );
  const [transferNoticeSent, setTransferNoticeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const outstandingMinor = BigInt(invoice.balance.outstandingMinor);
  const transferAmountMinor = parseMajorAmountToMinor(
    transferAmount,
    invoice.currency,
  );
  const transferAmountTooLarge =
    transferAmountMinor !== null &&
    BigInt(transferAmountMinor) > outstandingMinor;
  const isPayable =
    canPay && invoice.status === "ISSUED" && outstandingMinor > 0n;

  const startCheckout = async () => {
    setError(null);
    setIsStartingCheckout(true);
    try {
      const attempt = await startFamilyInvoiceCheckout(
        invoice.payerAccountId,
        invoice.id,
      );
      if (attempt.checkoutUrl) {
        await WebBrowser.openAuthSessionAsync(
          attempt.checkoutUrl,
          "nexsteps://finance/payment-return",
        );
      }
      router.replace({
        pathname: "/finance/payment-return",
        params: { attemptId: attempt.attemptId },
      });
    } catch (checkoutError) {
      if (checkoutError instanceof ApiError && checkoutError.status === 403) {
        setError(
          "Finance access changed. Ask the school office to check your access.",
        );
      } else if (
        checkoutError instanceof ApiError &&
        checkoutError.status === 503
      ) {
        setError(
          "Secure card payment is temporarily unavailable. You can try again later.",
        );
      } else {
        setError(
          "We couldn’t open secure payment. Check your connection and try again.",
        );
      }
      onRefresh();
    } finally {
      setIsStartingCheckout(false);
    }
  };

  const openTransferDetails = async () => {
    if (transferDetails) {
      setTransferDetails(null);
      return;
    }
    setIsLoadingTransfer(true);
    setError(null);
    try {
      setTransferDetails(
        await getFamilyBankTransferDetails(invoice.payerAccountId, invoice.id),
      );
    } catch (transferError) {
      if (transferError instanceof ApiError && transferError.status === 403) {
        setError(
          "Finance access changed. Ask the school office to check your access.",
        );
      } else if (
        transferError instanceof ApiError &&
        transferError.status === 404
      ) {
        setError(
          "The school has not added bank transfer details for this invoice.",
        );
      } else {
        setError("Bank transfer details couldn’t be loaded. Try again.");
      }
    } finally {
      setIsLoadingTransfer(false);
    }
  };

  const submitTransferNotice = async () => {
    if (!transferAmountMinor || transferAmountTooLarge) return;
    setError(null);
    setIsSubmittingTransfer(true);
    try {
      await submitFamilyTransferNotice(
        invoice.payerAccountId,
        invoice.id,
        transferAmountMinor,
      );
      setTransferNoticeSent(true);
    } catch (transferError) {
      if (transferError instanceof ApiError && transferError.status === 403) {
        setError(
          "Finance access changed. Ask the school office to check your access.",
        );
      } else {
        setError(
          "Your transfer notice wasn’t sent. Check your connection and try again.",
        );
      }
    } finally {
      setIsSubmittingTransfer(false);
    }
  };

  const downloadInvoice = async () => {
    setError(null);
    setIsDownloading(true);
    try {
      await downloadFamilyDocument(
        `/finance/payer-accounts/${encodeURIComponent(invoice.payerAccountId)}/invoices/${encodeURIComponent(invoice.id)}/document`,
        `invoice-${invoice.invoiceNumber ?? invoice.id}.pdf`,
      );
    } catch (downloadError) {
      setError(
        downloadError instanceof ApiError && downloadError.status === 403
          ? "Finance access changed. Ask the school office to check your access."
          : downloadError instanceof Error
            ? downloadError.message
            : "The invoice could not be downloaded. Try again.",
      );
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text style={styles.school}>{accountName}</Text>
          <Text style={styles.invoiceNumber}>
            Invoice {invoice.invoiceNumber ?? "—"}
          </Text>
        </View>
        <View
          style={[
            styles.status,
            invoice.status === "VOID" ? styles.statusMuted : undefined,
          ]}
        >
          <Text style={styles.statusText}>
            {invoice.status === "VOID"
              ? "Voided"
              : outstandingMinor === 0n
                ? "Settled"
                : "Issued"}
          </Text>
        </View>
      </View>

      <View style={styles.amountBlock}>
        <Text style={styles.amountLabel}>
          {outstandingMinor > 0n ? "Amount due" : "No balance due"}
        </Text>
        <Text style={styles.amount}>
          {formatFinanceAmount(
            invoice.balance.outstandingMinor,
            invoice.currency,
          )}
        </Text>
        <Text style={styles.dueDate}>
          {invoice.dueDate
            ? `Due ${formatDate(invoice.dueDate)}`
            : "No due date set"}
        </Text>
      </View>

      <View style={styles.lines}>
        {invoice.lines.slice(0, 3).map((line) => (
          <View key={line.id} style={styles.line}>
            <Text style={styles.lineDescription}>{line.description}</Text>
            <Text style={styles.lineAmount}>
              {formatFinanceAmount(line.totalMinor, invoice.currency)}
            </Text>
          </View>
        ))}
        {invoice.lines.length > 3 ? (
          <Text style={styles.moreLines}>
            +{invoice.lines.length - 3} more items
          </Text>
        ) : null}
      </View>

      {invoice.checkout ? (
        <View style={styles.processing} accessibilityLiveRegion="polite">
          <Text style={styles.processingTitle}>Payment processing</Text>
          <Text style={styles.secondaryText}>
            We’re checking with the school. Please don’t pay again.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: "/finance/payment-return",
                params: { attemptId: invoice.checkout?.attemptId },
              })
            }
            style={({ pressed }) => [
              styles.textButton,
              pressed ? styles.pressed : undefined,
            ]}
          >
            <Text style={styles.textButtonLabel}>Check payment status</Text>
          </Pressable>
        </View>
      ) : null}

      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {transferNoticeSent ? (
        <Text accessibilityLiveRegion="polite" style={styles.notice}>
          Transfer notice sent. This is not a receipt. Your balance changes
          after the school confirms the funds.
        </Text>
      ) : null}

      <View style={styles.actions}>
        {isPayable && !invoice.checkout ? (
          <ActionButton
            label={
              isStartingCheckout ? "Opening secure payment…" : "Pay invoice"
            }
            onPress={() => void startCheckout()}
            disabled={isStartingCheckout}
            primary
          />
        ) : null}
        {canPay && isPayable && !invoice.checkout ? (
          <ActionButton
            label={
              isLoadingTransfer
                ? "Loading details…"
                : transferDetails
                  ? "Hide bank details"
                  : "Bank transfer"
            }
            onPress={() => void openTransferDetails()}
            disabled={isLoadingTransfer}
          />
        ) : null}
        <ActionButton
          label={isDownloading ? "Preparing PDF…" : "Download invoice"}
          onPress={() => void downloadInvoice()}
          disabled={isDownloading}
        />
      </View>

      {transferDetails ? (
        <View style={styles.transferPanel}>
          <Text style={styles.transferTitle}>School bank details</Text>
          <DetailRow
            label="Account name"
            value={transferDetails.accountHolderName}
          />
          <DetailRow label="Sort code" value={transferDetails.sortCode} />
          <DetailRow
            label="Account number"
            value={transferDetails.accountNumber}
          />
          <DetailRow
            label="Payment reference"
            value={transferDetails.reference}
          />
          <Text style={styles.secondaryText}>
            Only report a transfer after your bank confirms it was sent. A
            notice does not record payment.
          </Text>
          <Text style={styles.inputLabel}>Amount transferred</Text>
          <TextInput
            accessibilityLabel="Amount transferred"
            keyboardType="decimal-pad"
            value={transferAmount}
            onChangeText={setTransferAmount}
            style={styles.amountInput}
            placeholder="0.00"
          />
          {transferAmountTooLarge ? (
            <Text style={styles.error}>
              Amount cannot exceed this invoice’s current balance.
            </Text>
          ) : null}
          {!transferAmountMinor ? (
            <Text style={styles.error}>
              Enter a positive amount using {invoice.currency} decimals.
            </Text>
          ) : null}
          <ActionButton
            label={
              isSubmittingTransfer
                ? "Sending notice…"
                : "I’ve sent this transfer"
            }
            onPress={() => void submitTransferNotice()}
            disabled={
              isSubmittingTransfer ||
              !transferAmountMinor ||
              transferAmountTooLarge ||
              transferNoticeSent
            }
            primary
          />
        </View>
      ) : null}
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  disabled = false,
  primary = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        primary ? styles.primaryAction : styles.secondaryAction,
        disabled ? styles.disabledAction : undefined,
        pressed ? styles.pressed : undefined,
      ]}
    >
      <Text
        style={[
          styles.actionLabel,
          primary ? styles.primaryActionLabel : undefined,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.secondaryText}>{label}</Text>
      <Text selectable style={styles.detailValue}>
        {value}
      </Text>
    </View>
  );
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

const styles = StyleSheet.create({
  card: {
    gap: mobileTokens.spacing.sm,
    borderWidth: 1,
    borderColor: mobileTokens.colors.border.subtle,
    borderRadius: mobileTokens.radius.xl,
    backgroundColor: mobileTokens.colors.bg.surface,
    padding: mobileTokens.layout.cardPadding,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: mobileTokens.spacing.sm,
  },
  heading: { flex: 1, gap: mobileTokens.spacing.xxxs },
  school: {
    color: mobileTokens.colors.text.muted,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
  },
  invoiceNumber: {
    color: mobileTokens.colors.text.primary,
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontSize: mobileTokens.typography.heading.sm.size,
    fontWeight: mobileTokens.typography.weight.bold,
  },
  status: {
    borderRadius: mobileTokens.radius.round,
    backgroundColor: mobileTokens.colors.accent.familySoft,
    paddingHorizontal: mobileTokens.spacing.sm,
    paddingVertical: mobileTokens.spacing.xxs,
  },
  statusMuted: { backgroundColor: mobileTokens.colors.bg.muted },
  statusText: {
    color: mobileTokens.colors.text.primary,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.xs.size,
    fontWeight: mobileTokens.typography.weight.semibold,
  },
  amountBlock: {
    gap: mobileTokens.spacing.xxxs,
    paddingVertical: mobileTokens.spacing.xs,
  },
  amountLabel: {
    color: mobileTokens.colors.text.muted,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
  },
  amount: {
    color: mobileTokens.colors.text.primary,
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontSize: mobileTokens.typography.heading.lg.size,
    fontWeight: mobileTokens.typography.weight.bold,
  },
  dueDate: {
    color: mobileTokens.colors.text.muted,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
  },
  lines: {
    gap: mobileTokens.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: mobileTokens.colors.border.subtle,
    paddingTop: mobileTokens.spacing.sm,
  },
  line: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: mobileTokens.spacing.sm,
  },
  lineDescription: {
    flex: 1,
    color: mobileTokens.colors.text.primary,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
  },
  lineAmount: {
    color: mobileTokens.colors.text.primary,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    fontWeight: mobileTokens.typography.weight.semibold,
  },
  moreLines: {
    color: mobileTokens.colors.text.muted,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.xs.size,
  },
  processing: {
    gap: mobileTokens.spacing.xxs,
    borderRadius: mobileTokens.radius.lg,
    backgroundColor: mobileTokens.colors.bg.muted,
    padding: mobileTokens.spacing.sm,
  },
  processingTitle: {
    color: mobileTokens.colors.text.primary,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.bold,
  },
  secondaryText: {
    color: mobileTokens.colors.text.muted,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    lineHeight: mobileTokens.typography.body.sm.lineHeight,
  },
  textButton: {
    minHeight: 44,
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  textButtonLabel: {
    color: mobileTokens.colors.accent.primary,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.bold,
  },
  error: {
    color: mobileTokens.colors.status.danger,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    lineHeight: mobileTokens.typography.body.sm.lineHeight,
  },
  notice: {
    color: mobileTokens.colors.text.primary,
    backgroundColor: mobileTokens.colors.accent.familySoft,
    borderRadius: mobileTokens.radius.md,
    padding: mobileTokens.spacing.sm,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    lineHeight: mobileTokens.typography.body.sm.lineHeight,
  },
  actions: { gap: mobileTokens.spacing.xs },
  actionButton: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: mobileTokens.radius.lg,
    paddingHorizontal: mobileTokens.spacing.md,
    paddingVertical: mobileTokens.spacing.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryAction: {
    borderColor: mobileTokens.colors.accent.family,
    backgroundColor: mobileTokens.colors.accent.family,
  },
  secondaryAction: {
    borderColor: mobileTokens.colors.border.subtle,
    backgroundColor: mobileTokens.colors.bg.surface,
  },
  disabledAction: { opacity: 0.5 },
  actionLabel: {
    color: mobileTokens.colors.text.primary,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.bold,
    textAlign: "center",
  },
  primaryActionLabel: { color: mobileTokens.colors.text.onAccent },
  transferPanel: {
    gap: mobileTokens.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: mobileTokens.colors.border.subtle,
    paddingTop: mobileTokens.spacing.sm,
  },
  transferTitle: {
    color: mobileTokens.colors.text.primary,
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontSize: mobileTokens.typography.heading.sm.size,
    fontWeight: mobileTokens.typography.weight.bold,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: mobileTokens.spacing.sm,
  },
  detailValue: {
    flex: 1,
    color: mobileTokens.colors.text.primary,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.semibold,
    textAlign: "right",
  },
  inputLabel: {
    color: mobileTokens.colors.text.primary,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.semibold,
  },
  amountInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: mobileTokens.colors.border.strong,
    borderRadius: mobileTokens.radius.md,
    paddingHorizontal: mobileTokens.spacing.sm,
    color: mobileTokens.colors.text.primary,
    fontFamily: mobileTokens.typography.fontFamily.body,
  },
  pressed: { opacity: 0.8 },
});
