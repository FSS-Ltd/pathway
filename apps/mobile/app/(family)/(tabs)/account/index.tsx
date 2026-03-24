import { StyleSheet, Text, View } from "react-native";

import { Screen } from "@/components/primitives/screen";
import { BrandedCard, Chip, ListRow, SectionTitle } from "@/components/primitives/ui";
import { mobileTokens } from "@/design/tokens";

export default function FamilyAccountScreen() {
  return (
    <Screen tone="family" badge="Family Space" title="Family settings" subtitle="Manage privacy, notices, and account preferences.">
      <BrandedCard>
        <SectionTitle title="Profile" />
        <ListRow title="Primary contact" subtitle="jane.parent@email.com" right="Edit" />
        <ListRow title="Emergency contact" subtitle="+44 7123 456 789" right="Edit" />
      </BrandedCard>

      <BrandedCard>
        <SectionTitle title="Consent and privacy" subtitle="Family-safe controls" />
        <View style={styles.inlineRow}>
          <Chip label="Photo consent: Enabled" tone="family" />
          <Chip label="Data export available" tone="serve" />
        </View>
        <Text style={styles.blockText}>Safeguarding records and internal notes are not shown in Family Space.</Text>
      </BrandedCard>

      <BrandedCard>
        <SectionTitle title="Notifications" />
        <ListRow title="Push notifications" subtitle="Attendance, notices, reminders" right="On" />
        <ListRow title="Email summaries" subtitle="Weekly digest" right="On" />
      </BrandedCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  inlineRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileTokens.spacing.xs,
  },
  blockText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    lineHeight: mobileTokens.typography.body.sm.lineHeight,
    color: mobileTokens.colors.text.muted,
  },
});
