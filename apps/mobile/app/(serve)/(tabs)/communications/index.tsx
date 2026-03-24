import { StyleSheet, Text, View } from "react-native";

import { Screen } from "@/components/primitives/screen";
import { BrandedCard, Chip, ListRow, SectionTitle } from "@/components/primitives/ui";
import { mobileTokens } from "@/design/tokens";

export default function ServeCommunicationsScreen() {
  return (
    <Screen tone="serve" badge="Serve Space" title="Communications" subtitle="Keep team and family messaging tied to real operational context.">
      <BrandedCard>
        <SectionTitle title="Channels" />
        <View style={styles.chipsRow}>
          <Chip label="Team" tone="serve" kind="solid" />
          <Chip label="Family updates" tone="family" />
          <Chip label="Internal only" tone="serve" />
        </View>
      </BrandedCard>

      <BrandedCard>
        <SectionTitle title="Latest threads" />
        <ListRow title="Year 4 staffing update" subtitle="Lead swapped for Friday session" right="5m" />
        <ListRow title="Pickup reminder draft" subtitle="Needs leader approval" right="22m" />
        <ListRow title="Parent notice: delayed coach" subtitle="Sent to 43 families" right="1h" />
      </BrandedCard>

      <BrandedCard style={styles.noteCard}>
        <Text style={styles.noteTitle}>Visibility rule</Text>
        <Text style={styles.noteText}>Internal discussion stays in Serve Space. Family-facing updates are explicitly published to Family Space.</Text>
      </BrandedCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileTokens.spacing.xs,
  },
  noteCard: {
    backgroundColor: mobileTokens.colors.accent.serveSoft,
  },
  noteTitle: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.bold,
    color: mobileTokens.colors.text.primary,
  },
  noteText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    lineHeight: mobileTokens.typography.body.sm.lineHeight,
    color: mobileTokens.colors.text.muted,
  },
});
