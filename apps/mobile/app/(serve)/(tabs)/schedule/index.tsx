import { StyleSheet, Text, View } from "react-native";

import { Screen } from "@/components/primitives/screen";
import { BrandedCard, Chip, ListRow, SectionTitle } from "@/components/primitives/ui";
import { mobileTokens } from "@/design/tokens";

export default function ServeScheduleScreen() {
  return (
    <Screen tone="serve" badge="Serve Space" title="Schedule & rota" subtitle="Clear team coordination for upcoming sessions.">
      <BrandedCard>
        <SectionTitle title="Availability snapshot" />
        <View style={styles.statsRow}>
          <View style={styles.statBox}><Text style={styles.statValue}>8</Text><Text style={styles.statLabel}>Confirmed</Text></View>
          <View style={styles.statBox}><Text style={styles.statValue}>2</Text><Text style={styles.statLabel}>Pending</Text></View>
          <View style={styles.statBox}><Text style={styles.statValue}>1</Text><Text style={styles.statLabel}>Swap</Text></View>
        </View>
      </BrandedCard>

      <BrandedCard>
        <SectionTitle title="Next sessions" />
        <ListRow title="Reception Morning" subtitle="Fri 08:45 - 11:30 • Lead" right="Confirmed" />
        <ListRow title="Choir Practice" subtitle="Fri 15:45 - 16:30 • Helper" right="Pending" />
        <ListRow title="Sunday Group" subtitle="Sun 09:15 - 10:30 • Assistant" right="Confirmed" />
      </BrandedCard>

      <BrandedCard style={styles.swapCard}>
        <Chip label="Operational tip" tone="serve" />
        <Text style={styles.swapText}>Availability updates should be done before 17:00 to help leaders publish complete rotas.</Text>
      </BrandedCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: "row",
    gap: mobileTokens.spacing.xs,
  },
  statBox: {
    flex: 1,
    borderRadius: mobileTokens.radius.md,
    backgroundColor: mobileTokens.colors.bg.muted,
    alignItems: "center",
    paddingVertical: mobileTokens.spacing.xs,
  },
  statValue: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.bold,
    fontSize: mobileTokens.typography.heading.xs.size,
    color: mobileTokens.colors.accent.serve,
  },
  statLabel: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.xs.size,
    color: mobileTokens.colors.text.muted,
  },
  swapCard: {
    backgroundColor: mobileTokens.colors.bg.panel,
  },
  swapText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    lineHeight: mobileTokens.typography.body.sm.lineHeight,
    color: mobileTokens.colors.text.muted,
  },
});
