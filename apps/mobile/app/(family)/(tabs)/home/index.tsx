import { StyleSheet, Text, View } from "react-native";

import { Screen } from "@/components/primitives/screen";
import { BrandedCard, Chip, ListRow, SectionTitle } from "@/components/primitives/ui";
import { mobileTokens } from "@/design/tokens";

export default function FamilyHomeScreen() {
  return (
    <Screen tone="family" badge="Family Space" title="Welcome to Family Space" subtitle="Stay connected with your child’s day and key updates.">
      <BrandedCard>
        <SectionTitle title="Your children" subtitle="Attendance and session context in one place" />
        <View style={styles.childCard}>
          <View style={styles.childAvatar}><Text style={styles.childAvatarText}>AB</Text></View>
          <View style={styles.childMeta}>
            <Text style={styles.childName}>Ava Brown</Text>
            <Text style={styles.childGroup}>Year 4 • Thursday Session</Text>
          </View>
          <Chip label="96% attendance" tone="family" />
        </View>
      </BrandedCard>

      <BrandedCard>
        <SectionTitle title="Recent notices" subtitle="Family-safe communication only" />
        <ListRow title="Summer trip reminder" subtitle="Coach leaves at 08:15" right="Today" />
        <ListRow title="Term dates update" subtitle="Autumn schedule published" right="Tue" />
        <ListRow title="Parent evening slots" subtitle="Booking opens Friday" right="Mon" />
      </BrandedCard>

      <BrandedCard style={styles.actionCard}>
        <SectionTitle title="Quick actions" />
        <View style={styles.actionRow}>
          <View style={styles.actionPill}><Text style={styles.actionPillText}>View calendar</Text></View>
          <View style={styles.actionPill}><Text style={styles.actionPillText}>Message history</Text></View>
        </View>
      </BrandedCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  childCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: mobileTokens.spacing.sm,
    padding: mobileTokens.spacing.sm,
    borderRadius: mobileTokens.radius.lg,
    backgroundColor: mobileTokens.colors.bg.muted,
  },
  childAvatar: {
    width: 44,
    height: 44,
    borderRadius: mobileTokens.radius.round,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: mobileTokens.colors.accent.family,
  },
  childAvatarText: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.bold,
    color: mobileTokens.colors.text.primary,
  },
  childMeta: { flex: 1, gap: mobileTokens.spacing.xxxs },
  childName: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.bold,
    color: mobileTokens.colors.text.primary,
  },
  childGroup: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    color: mobileTokens.colors.text.muted,
  },
  actionCard: {
    backgroundColor: mobileTokens.colors.accent.familySoft,
  },
  actionRow: {
    flexDirection: "row",
    gap: mobileTokens.spacing.sm,
    flexWrap: "wrap",
  },
  actionPill: {
    borderWidth: 1,
    borderColor: mobileTokens.colors.border.subtle,
    borderRadius: mobileTokens.radius.round,
    backgroundColor: mobileTokens.colors.bg.surface,
    paddingHorizontal: mobileTokens.spacing.sm,
    paddingVertical: mobileTokens.spacing.xs,
  },
  actionPillText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.semibold,
    color: mobileTokens.colors.text.primary,
  },
});
