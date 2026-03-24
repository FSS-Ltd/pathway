import { StyleSheet, Text, View } from "react-native";

import { Screen } from "@/components/primitives/screen";
import { BrandedCard, Chip, ListRow, SectionTitle } from "@/components/primitives/ui";
import { mobileTokens } from "@/design/tokens";

export default function FamilyUpdatesScreen() {
  return (
    <Screen tone="family" badge="Family Space" title="Notices & announcements" subtitle="Updates from your organisation in one structured feed.">
      <BrandedCard>
        <SectionTitle title="Filters" />
        <View style={styles.filterRow}>
          <Chip label="All" tone="family" kind="solid" />
          <Chip label="Unread" tone="family" />
          <Chip label="Urgent" tone="family" />
        </View>
      </BrandedCard>

      <BrandedCard>
        <View style={styles.noticeHeader}>
          <Text style={styles.noticeTitle}>New pickup process update</Text>
          <Chip label="Urgent" tone="serve" />
        </View>
        <Text style={styles.noticeBody}>From Monday, pickup checks will use one tap confirmation to reduce queue times.</Text>
        <ListRow title="Posted by School Office" subtitle="Applies to Years 3-6" right="2h" />
      </BrandedCard>

      <BrandedCard>
        <ListRow title="After-school clubs timetable" subtitle="Spring rota now available" right="Yesterday" />
        <ListRow title="Family communication policy" subtitle="Updated response window guidance" right="Tue" />
      </BrandedCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: "row",
    gap: mobileTokens.spacing.xs,
    flexWrap: "wrap",
  },
  noticeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: mobileTokens.spacing.sm,
  },
  noticeTitle: {
    flex: 1,
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.bold,
    fontSize: mobileTokens.typography.heading.xs.size,
    lineHeight: mobileTokens.typography.heading.xs.lineHeight,
    color: mobileTokens.colors.text.primary,
  },
  noticeBody: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    lineHeight: mobileTokens.typography.body.sm.lineHeight,
    color: mobileTokens.colors.text.muted,
  },
});
