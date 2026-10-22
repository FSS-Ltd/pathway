import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";

import { BrandedCard, SectionTitle } from "@/components/primitives/ui";
import { Screen } from "@/components/primitives/screen";
import { mobileTokens } from "@/design/tokens";
import { useAppReady } from "@/hooks/use-app-ready";
import { ApiError } from "@/lib/api/client";
import { FamilyFinanceInvoiceCard } from "./family-finance-invoice-card";
import { FamilyFinanceStatementCard } from "./family-finance-statement-card";
import {
  createFamilyStatement,
  listFamilyInvoices,
  listFamilyPayerAccounts,
  listFamilyStatements,
  type FamilyInvoice,
  type FamilyPayerAccount,
  type FamilyStatement,
} from "./family-finance-api";

type AccountData = {
  account: FamilyPayerAccount;
  invoices: FamilyInvoice[];
  statements: FamilyStatement[];
};

type FinanceViewState =
  | { status: "loading"; siteId: string | null }
  | {
      status: "ready";
      siteId: string;
      accounts: AccountData[];
      updatedAt: Date;
    }
  | { status: "unavailable"; siteId: string | null }
  | { status: "error"; siteId: string | null };

type FinanceTab = "invoices" | "statements";

export function FamilyFinanceScreen() {
  const { bootstrapState } = useAppReady();
  const isReady = bootstrapState.status === "ready";
  const activeSiteId = isReady
    ? bootstrapState.activeSiteState.activeSiteId
    : null;
  const activeSite = isReady
    ? (bootstrapState.activeSiteState.sites.find(
        (site) => site.id === activeSiteId,
      ) ?? null)
    : null;
  const permissions = isReady ? bootstrapState.permissions : [];
  const canReadInvoices = permissions.includes("finance.family_invoices.read");
  const canPayInvoices = permissions.includes("finance.family_payments.pay");
  const canReadStatements = permissions.includes(
    "finance.family_statements.read",
  );
  const availableTabs = useMemo(() => {
    const tabs: FinanceTab[] = [];
    if (canReadInvoices) tabs.push("invoices");
    if (canReadStatements) tabs.push("statements");
    return tabs;
  }, [canReadInvoices, canReadStatements]);
  const [tab, setTab] = useState<FinanceTab>(availableTabs[0] ?? "invoices");
  const [viewState, setViewState] = useState<FinanceViewState>({
    status: "loading",
    siteId: activeSiteId,
  });
  const [periodStart, setPeriodStart] = useState(() => defaultStatementStart());
  const [periodEnd, setPeriodEnd] = useState(() => defaultStatementEnd());
  const [requestingStatementFor, setRequestingStatementFor] = useState<
    string | null
  >(null);
  const [statementError, setStatementError] = useState<string | null>(null);
  const [statementRequested, setStatementRequested] = useState(false);
  const requestSequence = useRef(0);

  const refresh = useCallback(async () => {
    const siteId = activeSiteId;
    if (!isReady || !siteId) {
      setViewState({ status: "unavailable", siteId });
      return;
    }

    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    setViewState((current) =>
      current.status === "ready" && current.siteId === siteId
        ? current
        : { status: "loading", siteId },
    );
    try {
      const payerAccounts = await listFamilyPayerAccounts();
      const accounts = await Promise.all(
        payerAccounts.map(async (account) => {
          const [invoicePage, statementPage] = await Promise.all([
            canReadInvoices
              ? listFamilyInvoices(account.id)
              : Promise.resolve({
                  items: [] as FamilyInvoice[],
                  nextCursor: null,
                }),
            canReadStatements
              ? listFamilyStatements(account.id)
              : Promise.resolve({
                  items: [] as FamilyStatement[],
                  nextCursor: null,
                }),
          ]);
          return {
            account,
            invoices: invoicePage.items,
            statements: statementPage.items,
          };
        }),
      );
      if (sequence !== requestSequence.current) return;
      setViewState({
        status: "ready",
        siteId,
        accounts,
        updatedAt: new Date(),
      });
    } catch (error) {
      if (sequence !== requestSequence.current) return;
      if (error instanceof ApiError && error.status === 403) {
        setViewState({ status: "unavailable", siteId });
      } else {
        setViewState({ status: "error", siteId });
      }
    }
  }, [activeSiteId, canReadInvoices, canReadStatements, isReady]);

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

  useEffect(() => {
    if (!availableTabs.includes(tab)) {
      setTab(availableTabs[0] ?? "invoices");
    }
  }, [availableTabs, tab]);

  const requestStatement = async (accountId: string) => {
    if (!isValidStatementRange(periodStart, periodEnd)) return;
    setRequestingStatementFor(accountId);
    setStatementError(null);
    setStatementRequested(false);
    try {
      await createFamilyStatement(accountId, periodStart, periodEnd);
      setStatementRequested(true);
      await refresh();
    } catch (error) {
      setStatementError(
        error instanceof ApiError && error.status === 403
          ? "Finance access changed. Ask the school office to check your access."
          : "The statement could not be created. Check the dates and try again.",
      );
    } finally {
      setRequestingStatementFor(null);
    }
  };

  const hasCurrentState = viewState.siteId === activeSiteId;
  const visibleState: FinanceViewState = hasCurrentState
    ? viewState
    : { status: "loading", siteId: activeSiteId };
  const schoolName = activeSite?.orgName ?? activeSite?.name ?? "Your school";
  const dateRangeValid = isValidStatementRange(periodStart, periodEnd);

  return (
    <Screen
      tone="family"
      badge="Family Space"
      title="Finance"
      subtitle="School invoices and account statements."
    >
      {availableTabs.length > 1 ? (
        <View style={styles.tabs} accessibilityRole="tablist">
          {availableTabs.map((item) => (
            <Pressable
              key={item}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === item }}
              onPress={() => setTab(item)}
              style={[
                styles.tab,
                tab === item ? styles.selectedTab : undefined,
              ]}
            >
              <Text
                style={[
                  styles.tabLabel,
                  tab === item ? styles.selectedTabLabel : undefined,
                ]}
              >
                {item === "invoices" ? "Invoices" : "Statements"}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {visibleState.status === "loading" ? (
        <BrandedCard style={styles.stateCard}>
          <ActivityIndicator color={mobileTokens.colors.accent.primary} />
          <Text style={styles.stateText}>Loading your school account…</Text>
        </BrandedCard>
      ) : null}

      {visibleState.status === "unavailable" ? (
        <BrandedCard style={styles.stateCard}>
          <SectionTitle title="Finance access unavailable" />
          <Text style={styles.stateText}>
            This school account hasn’t shared Finance with your Family Space
            profile. Contact the school office if you need access.
          </Text>
        </BrandedCard>
      ) : null}

      {visibleState.status === "error" ? (
        <BrandedCard style={styles.stateCard}>
          <SectionTitle title="We couldn’t load Finance" />
          <Text style={styles.stateText}>
            Check your connection, then refresh your account.
          </Text>
          <ActionButton label="Try again" onPress={() => void refresh()} />
        </BrandedCard>
      ) : null}

      {visibleState.status === "ready" ? (
        <>
          <BrandedCard style={styles.schoolCard}>
            <SectionTitle
              title={schoolName}
              subtitle={`Updated ${formatTime(visibleState.updatedAt)}`}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => void refresh()}
              style={({ pressed }) => [
                styles.refreshButton,
                pressed ? styles.pressed : undefined,
              ]}
            >
              <Text style={styles.refreshLabel}>Refresh</Text>
            </Pressable>
          </BrandedCard>

          {visibleState.accounts.length === 0 ? (
            <BrandedCard style={styles.stateCard}>
              <SectionTitle title="No family account linked yet" />
              <Text style={styles.stateText}>
                The school hasn’t linked a Finance account to your profile.
                Contact the school office for help.
              </Text>
            </BrandedCard>
          ) : null}

          {tab === "invoices" && canReadInvoices ? (
            <View style={styles.contentGroup}>
              <SectionTitle
                title="Invoices"
                subtitle="Only invoices issued to your authorised account appear here."
              />
              {visibleState.accounts.map(({ account, invoices }) => (
                <View key={account.id} style={styles.accountGroup}>
                  <Text style={styles.accountName}>{account.displayName}</Text>
                  {invoices.length ? (
                    invoices.map((invoice) => (
                      <FamilyFinanceInvoiceCard
                        key={invoice.id}
                        accountName={schoolName}
                        invoice={invoice}
                        canPay={canPayInvoices}
                        onRefresh={() => void refresh()}
                      />
                    ))
                  ) : (
                    <BrandedCard>
                      <Text style={styles.stateText}>
                        No invoices for this account.
                      </Text>
                    </BrandedCard>
                  )}
                </View>
              ))}
            </View>
          ) : null}

          {tab === "statements" && canReadStatements ? (
            <View style={styles.contentGroup}>
              <SectionTitle
                title="Statements"
                subtitle="Frozen snapshots of your account activity."
              />
              <BrandedCard style={styles.rangeCard}>
                <SectionTitle
                  title="Request a statement"
                  subtitle="Choose a period ending before today."
                />
                <View style={styles.dateRow}>
                  <View style={styles.dateField}>
                    <Text style={styles.inputLabel}>From</Text>
                    <TextInput
                      accessibilityLabel="Statement start date"
                      value={periodStart}
                      onChangeText={setPeriodStart}
                      placeholder="YYYY-MM-DD"
                      autoCapitalize="none"
                      keyboardType="numbers-and-punctuation"
                      style={styles.dateInput}
                    />
                  </View>
                  <View style={styles.dateField}>
                    <Text style={styles.inputLabel}>Through</Text>
                    <TextInput
                      accessibilityLabel="Statement end date"
                      value={periodEnd}
                      onChangeText={setPeriodEnd}
                      placeholder="YYYY-MM-DD"
                      autoCapitalize="none"
                      keyboardType="numbers-and-punctuation"
                      style={styles.dateInput}
                    />
                  </View>
                </View>
                {!dateRangeValid ? (
                  <Text style={styles.error}>
                    Enter valid dates in YYYY-MM-DD order. Periods can be up to
                    366 days and must end before today.
                  </Text>
                ) : null}
                {statementError ? (
                  <Text accessibilityLiveRegion="polite" style={styles.error}>
                    {statementError}
                  </Text>
                ) : null}
                {statementRequested ? (
                  <Text accessibilityLiveRegion="polite" style={styles.success}>
                    Statement requested. The latest list is shown below.
                  </Text>
                ) : null}
              </BrandedCard>
              {visibleState.accounts.map(({ account, statements }) => (
                <View key={account.id} style={styles.accountGroup}>
                  <Text style={styles.accountName}>{account.displayName}</Text>
                  <ActionButton
                    label={
                      requestingStatementFor === account.id
                        ? "Preparing statement…"
                        : "Request statement"
                    }
                    onPress={() => void requestStatement(account.id)}
                    disabled={
                      !dateRangeValid || requestingStatementFor !== null
                    }
                  />
                  {statements.length ? (
                    statements.map((statement) => (
                      <FamilyFinanceStatementCard
                        key={statement.id}
                        statement={statement}
                      />
                    ))
                  ) : (
                    <BrandedCard>
                      <Text style={styles.stateText}>
                        No statements are available for this account yet.
                      </Text>
                    </BrandedCard>
                  )}
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function ActionButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        disabled ? styles.disabledAction : undefined,
        pressed ? styles.pressed : undefined,
      ]}
    >
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

function defaultStatementEnd(): string {
  return addUtcDays(todayUtcDate(), -1);
}

function defaultStatementStart(): string {
  return addUtcDays(defaultStatementEnd(), -29);
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function addUtcDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isValidStatementRange(start: string, end: string): boolean {
  if (!isDateOnly(start) || !isDateOnly(end) || end >= todayUtcDate())
    return false;
  const startTime = Date.parse(`${start}T00:00:00.000Z`);
  const endTime = Date.parse(`${end}T23:59:59.999Z`);
  const range = endTime - startTime;
  return range >= 0 && range <= 366 * 24 * 60 * 60 * 1000;
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function formatTime(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(value);
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: "row",
    gap: mobileTokens.spacing.xs,
    padding: mobileTokens.spacing.xxs,
    borderRadius: mobileTokens.radius.round,
    backgroundColor: mobileTokens.colors.bg.muted,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileTokens.radius.round,
  },
  selectedTab: { backgroundColor: mobileTokens.colors.bg.surface },
  tabLabel: {
    color: mobileTokens.colors.text.muted,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.semibold,
  },
  selectedTabLabel: { color: mobileTokens.colors.text.primary },
  stateCard: { gap: mobileTokens.spacing.sm },
  stateText: {
    color: mobileTokens.colors.text.muted,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
  },
  schoolCard: {
    backgroundColor: mobileTokens.colors.accent.familySoft,
    gap: mobileTokens.spacing.xs,
  },
  refreshButton: {
    minHeight: 44,
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  refreshLabel: {
    color: mobileTokens.colors.accent.primary,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.bold,
  },
  contentGroup: { gap: mobileTokens.spacing.md },
  accountGroup: { gap: mobileTokens.spacing.sm },
  accountName: {
    color: mobileTokens.colors.text.primary,
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontSize: mobileTokens.typography.heading.sm.size,
    fontWeight: mobileTokens.typography.weight.bold,
  },
  rangeCard: { gap: mobileTokens.spacing.md },
  dateRow: { flexDirection: "row", gap: mobileTokens.spacing.sm },
  dateField: { flex: 1, gap: mobileTokens.spacing.xs },
  inputLabel: {
    color: mobileTokens.colors.text.primary,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.semibold,
  },
  dateInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: mobileTokens.colors.border.strong,
    borderRadius: mobileTokens.radius.md,
    paddingHorizontal: mobileTokens.spacing.sm,
    color: mobileTokens.colors.text.primary,
    fontFamily: mobileTokens.typography.fontFamily.body,
  },
  error: {
    color: mobileTokens.colors.status.danger,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    lineHeight: mobileTokens.typography.body.sm.lineHeight,
  },
  success: {
    color: mobileTokens.colors.text.primary,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
  },
  actionButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileTokens.radius.lg,
    paddingHorizontal: mobileTokens.spacing.md,
    borderWidth: 1,
    borderColor: mobileTokens.colors.accent.family,
    backgroundColor: mobileTokens.colors.accent.family,
  },
  actionLabel: {
    color: mobileTokens.colors.text.onAccent,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.bold,
    textAlign: "center",
  },
  disabledAction: { opacity: 0.5 },
  pressed: { opacity: 0.82 },
});
