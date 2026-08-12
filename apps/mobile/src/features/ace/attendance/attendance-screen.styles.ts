import { StyleSheet } from "react-native";

import { mobileTokens } from "@/design/tokens";

export const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: mobileTokens.spacing.sm,
  },
  backButton: {
    minWidth: 96,
    paddingHorizontal: mobileTokens.spacing.sm,
  },
  headerMeta: {
    flex: 1,
    gap: mobileTokens.spacing.xxs,
  },
  title: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.bold,
    fontSize: mobileTokens.typography.heading.lg.size,
    lineHeight: mobileTokens.typography.heading.lg.lineHeight,
    color: mobileTokens.colors.text.primary,
  },
  metaText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
    color: mobileTokens.colors.text.muted,
  },
  sectionCard: {
    marginTop: mobileTokens.spacing.sm,
  },
  stateText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
    color: mobileTokens.colors.text.muted,
  },
  summaryGrid: {
    gap: mobileTokens.spacing.sm,
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileTokens.spacing.sm,
  },
  summaryTile: {
    flexGrow: 1,
    flexBasis: 120,
    minHeight: 96,
    borderWidth: 1,
    borderColor: mobileTokens.colors.border.subtle,
    borderRadius: mobileTokens.radius.lg,
    alignItems: "center",
    justifyContent: "center",
    padding: mobileTokens.spacing.sm,
    gap: mobileTokens.spacing.xxs,
  },
  summaryValue: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.bold,
    fontSize: mobileTokens.typography.heading.md.size,
    lineHeight: mobileTokens.typography.heading.md.lineHeight,
    color: mobileTokens.colors.text.primary,
  },
  summaryLabel: {
    textAlign: "center",
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.semibold,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
    color: mobileTokens.colors.text.muted,
  },
  pendingSummary: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.semibold,
    fontSize: mobileTokens.typography.body.lg.size,
    lineHeight: mobileTokens.typography.body.lg.lineHeight,
    color: mobileTokens.colors.text.primary,
  },
  errorCallout: {
    borderWidth: 1,
    borderColor: "#a1263d",
    borderRadius: mobileTokens.radius.lg,
    padding: mobileTokens.spacing.sm,
    gap: mobileTokens.spacing.sm,
  },
  errorText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
    color: "#a1263d",
  },
  successText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.semibold,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
    color: "#247f70",
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileTokens.spacing.sm,
  },
  actionButton: {
    flexGrow: 1,
    flexBasis: 128,
  },
});
