import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Screen } from "@/components/primitives/screen";
import { BrandedButton, BrandedCard, Chip, ListRow, SectionTitle } from "@/components/primitives/ui";
import { mobileTokens } from "@/design/tokens";

export default function ServeAttendanceScreen() {
  return (
    <Screen tone="serve" badge="Serve Space" title="Today’s attendance" subtitle="Fast register capture with clear sync status.">
      <BrandedCard>
        <SectionTitle title="Active session" subtitle="Year 4 Literacy • Room B" />
        <View style={styles.kpiRow}>
          <Chip label="In progress" tone="serve" kind="solid" />
          <Chip label="3 unsynced marks" tone="serve" />
        </View>
        <Link href="/(serve)/(tabs)/attendance/sample-session" asChild>
          <Pressable>
            <BrandedButton label="Open register" tone="serve" />
          </Pressable>
        </Link>
      </BrandedCard>

      <BrandedCard>
        <SectionTitle title="Upcoming sessions" />
        <ListRow title="Maths Support" subtitle="10:30 - 11:15 • Room C" right="Upcoming" />
        <ListRow title="After-school Club" subtitle="15:30 - 16:30 • Hall" right="Upcoming" />
      </BrandedCard>

      <BrandedCard style={styles.helperCard}>
        <Text style={styles.helperTitle}>Offline-ready note</Text>
        <Text style={styles.helperText}>Marks can be captured even with poor signal. Sync indicators stay visible in this view.</Text>
      </BrandedCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  kpiRow: {
    flexDirection: "row",
    gap: mobileTokens.spacing.xs,
    flexWrap: "wrap",
  },
  helperCard: {
    backgroundColor: mobileTokens.colors.accent.serveSoft,
  },
  helperTitle: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.bold,
    fontSize: mobileTokens.typography.body.md.size,
    color: mobileTokens.colors.text.primary,
  },
  helperText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    lineHeight: mobileTokens.typography.body.sm.lineHeight,
    color: mobileTokens.colors.text.muted,
  },
});
