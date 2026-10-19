import React from "react";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { FinanceCurrency } from "@pathway/platform";
import { formatFinanceMoney } from "./finance-currency-format";

export interface FinancePdfLine {
  date?: string;
  description: string;
  amountMinor: string;
}

export interface FinancePdfTotal {
  label: string;
  amountMinor: string;
  emphasized?: boolean;
}

export interface FinancePdfInput {
  title: string;
  legalEntityName: string;
  payerName: string;
  reference: string;
  generatedAt: string;
  ledgerCutoffAt?: string;
  periodStart?: string;
  periodEnd?: string;
  currency: FinanceCurrency;
  totals: readonly FinancePdfTotal[];
  lines: readonly FinancePdfLine[];
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 46,
    paddingHorizontal: 48,
    paddingBottom: 56,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#26343A",
    lineHeight: 1.45,
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: "#D8E5E4",
    paddingBottom: 18,
    marginBottom: 25,
  },
  brand: {
    color: "#087F78",
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    lineHeight: 1.15,
    fontWeight: 700,
    color: "#172C35",
    marginBottom: 6,
  },
  subtitle: { color: "#5D6D72", fontSize: 10 },
  metadata: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 24,
  },
  metadataBlock: { width: "48%" },
  label: {
    color: "#62767A",
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  value: { color: "#24363B", fontSize: 10, marginBottom: 11 },
  totals: {
    borderWidth: 1,
    borderColor: "#DCE6E5",
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginBottom: 24,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
  },
  totalLabel: { color: "#52666A", fontSize: 10 },
  totalValue: { color: "#263A3F", fontSize: 10, textAlign: "right" },
  closingRow: {
    borderTopWidth: 1,
    borderTopColor: "#DCE6E5",
    marginTop: 4,
    paddingTop: 9,
  },
  closingLabel: { color: "#172C35", fontSize: 11, fontWeight: 700 },
  closingValue: { color: "#087F78", fontSize: 14, fontWeight: 700 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: "#24363B",
    marginBottom: 8,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#F1F6F5",
    borderBottomWidth: 1,
    borderBottomColor: "#D6E1E0",
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E9EFEE",
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  date: { width: "20%", color: "#64767A", fontSize: 9 },
  description: { flex: 1, color: "#2E4247", fontSize: 9 },
  amount: { width: "25%", color: "#2E4247", fontSize: 9, textAlign: "right" },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    borderTopWidth: 1,
    borderTopColor: "#E3EBEA",
    paddingTop: 7,
    color: "#718084",
    fontSize: 8,
  },
  empty: { color: "#718084", fontSize: 9, paddingVertical: 12 },
});

export async function renderFinancePdf(
  input: FinancePdfInput,
): Promise<Buffer> {
  const document = (
    <Document
      title={input.title}
      author={input.legalEntityName}
      subject="NexSteps Finance document"
      creationDate={new Date(input.generatedAt)}
      modificationDate={new Date(input.generatedAt)}
    >
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header}>
          <Text style={styles.brand}>NexSteps Finance</Text>
          <Text style={styles.title}>{input.title}</Text>
          <Text style={styles.subtitle}>{input.legalEntityName}</Text>
        </View>

        <View style={styles.metadata}>
          <View style={styles.metadataBlock}>
            <Text style={styles.label}>Account</Text>
            <Text style={styles.value}>{input.payerName}</Text>
            <Text style={styles.label}>Reference</Text>
            <Text style={styles.value}>{input.reference}</Text>
          </View>
          <View style={styles.metadataBlock}>
            {input.periodStart && input.periodEnd ? (
              <>
                <Text style={styles.label}>Statement period</Text>
                <Text style={styles.value}>
                  {formatFinanceDate(input.periodStart)} –{" "}
                  {formatFinanceDate(input.periodEnd)}
                </Text>
              </>
            ) : null}
            <Text style={styles.label}>Generated</Text>
            <Text style={styles.value}>
              {formatFinanceDateTime(input.generatedAt)}
            </Text>
            {input.ledgerCutoffAt ? (
              <>
                <Text style={styles.label}>Ledger cutoff</Text>
                <Text style={styles.value}>
                  {formatFinanceDateTime(input.ledgerCutoffAt)}
                </Text>
              </>
            ) : null}
          </View>
        </View>

        <View style={styles.totals}>
          {input.totals.map((total) => (
            <View
              key={total.label}
              style={[
                styles.totalRow,
                total.emphasized ? styles.closingRow : {},
              ]}
            >
              <Text
                style={
                  total.emphasized ? styles.closingLabel : styles.totalLabel
                }
              >
                {total.label}
              </Text>
              <Text
                style={
                  total.emphasized ? styles.closingValue : styles.totalValue
                }
              >
                {formatFinanceMoney(total.amountMinor, input.currency)}
              </Text>
            </View>
          ))}
        </View>

        {input.lines.length > 0 ? (
          <View>
            <Text style={styles.sectionTitle}>Activity</Text>
            <View style={styles.tableHeader}>
              <Text style={styles.date}>Date</Text>
              <Text style={styles.description}>Description</Text>
              <Text style={styles.amount}>Amount</Text>
            </View>
            {input.lines.map((line, index) => (
              <View
                key={`${line.date ?? ""}-${line.description}-${index}`}
                style={styles.tableRow}
              >
                <Text style={styles.date}>
                  {line.date ? formatFinanceDate(line.date) : "—"}
                </Text>
                <Text style={styles.description}>{line.description}</Text>
                <Text style={styles.amount}>
                  {formatFinanceMoney(line.amountMinor, input.currency)}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>
            There was no account activity in this period.
          </Text>
        )}
        <Text style={styles.footer} fixed>
          Processing payments are not receipts. Contact the school if you need
          help with this account.
        </Text>
      </Page>
    </Document>
  );
  return renderToBuffer(document);
}

function formatFinanceDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "Europe/London",
  }).format(new Date(value));
}

function formatFinanceDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date(value));
}
