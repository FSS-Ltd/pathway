import { StyleSheet, Text, View } from "react-native";

import { Screen } from "@/components/primitives/screen";
import { BrandedCard, Chip, ListRow, SectionTitle } from "@/components/primitives/ui";
import { mobileTokens } from "@/design/tokens";

export default function ServeSafeguardingScreen() {
  return (
    <Screen tone="serve" badge="Serve Space" title="Safeguarding" subtitle="Built-in trust workflows with role-based control and audit trails.">
      <BrandedCard style={styles.trustCard}>
        <SectionTitle title="Safeguarding built in" subtitle="Not a separate tool" />
        <View style={styles.trustRow}>
          <Chip label="Role-based access" tone="serve" />
          <Chip label="Audit trail" tone="serve" />
          <Chip label="Structured records" tone="serve" />
        </View>
      </BrandedCard>

      <BrandedCard>
        <SectionTitle title="Open items" subtitle="Authorised roles only" />
        <ListRow title="Concern review: Year 5" subtitle="Assigned to DSL" right="In review" />
        <ListRow title="Follow-up log" subtitle="Action due tomorrow" right="Due" />
      </BrandedCard>

      <BrandedCard style={styles.noticeCard}>
        <Text style={styles.noticeTitle}>Privacy guardrail</Text>
        <Text style={styles.noticeText}>Safeguarding concerns, internal notes, and sensitive outcomes must never appear in Family Space surfaces.</Text>
      </BrandedCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  trustCard: {
    backgroundColor: "#EEF6FF",
  },
  trustRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileTokens.spacing.xs,
  },
  noticeCard: {
    backgroundColor: "#FFF3F6",
    borderColor: "rgba(212, 24, 61, 0.25)",
  },
  noticeTitle: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.bold,
    color: mobileTokens.colors.text.primary,
  },
  noticeText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    lineHeight: mobileTokens.typography.body.sm.lineHeight,
    color: mobileTokens.colors.text.muted,
  },
});
