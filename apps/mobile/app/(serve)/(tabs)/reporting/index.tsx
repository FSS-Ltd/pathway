import { StyleSheet, Text, View } from "react-native";

import { Screen } from "@/components/primitives/screen";
import { BrandedCard, Chip, ListRow, SectionTitle } from "@/components/primitives/ui";
import { mobileTokens } from "@/design/tokens";

export default function ServeReportingScreen() {
  return (
    <Screen tone="serve" badge="Serve Space" title="Reporting" subtitle="Operational visibility for leaders, staff, and teams.">
      <BrandedCard>
        <SectionTitle title="This week" />
        <View style={styles.metrics}>
          <View style={styles.metric}><Text style={styles.metricValue}>94%</Text><Text style={styles.metricLabel}>Attendance</Text></View>
          <View style={styles.metric}><Text style={styles.metricValue}>18</Text><Text style={styles.metricLabel}>Sessions run</Text></View>
          <View style={styles.metric}><Text style={styles.metricValue}>5</Text><Text style={styles.metricLabel}>Family notices</Text></View>
        </View>
      </BrandedCard>

      <BrandedCard>
        <SectionTitle title="Export jobs" subtitle="Scheduled bundles and templates" />
        <ListRow title="Weekly attendance export" subtitle="CSV bundle • queued" right="Pending" />
        <ListRow title="Comms summary" subtitle="PDF digest • completed" right="Done" />
      </BrandedCard>

      <BrandedCard>
        <Chip label="Leaders" tone="serve" />
        <Text style={styles.summaryText}>Use reporting to turn day-to-day actions into clearer oversight across attendance, staffing, communication, and care.</Text>
      </BrandedCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  metrics: {
    flexDirection: "row",
    gap: mobileTokens.spacing.xs,
  },
  metric: {
    flex: 1,
    borderRadius: mobileTokens.radius.md,
    backgroundColor: mobileTokens.colors.bg.muted,
    alignItems: "center",
    paddingVertical: mobileTokens.spacing.sm,
    gap: mobileTokens.spacing.xxxs,
  },
  metricValue: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.bold,
    fontSize: mobileTokens.typography.heading.xs.size,
    color: mobileTokens.colors.accent.serve,
  },
  metricLabel: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.xs.size,
    color: mobileTokens.colors.text.muted,
  },
  summaryText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    lineHeight: mobileTokens.typography.body.sm.lineHeight,
    color: mobileTokens.colors.text.muted,
  },
});
