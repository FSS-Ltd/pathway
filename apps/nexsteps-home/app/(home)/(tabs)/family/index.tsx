import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";

/**
 * Placeholder for screen-inventory.json id "family-children". Real
 * implementation lands in Plan 08 (Family, people, permissions, privacy).
 */
export default function FamilyScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader eyebrow="Family" title="Children" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: homeTokens.colors.bg.shell,
    paddingHorizontal: homeTokens.layout.screenHorizontalPadding,
    paddingTop: homeTokens.metrics.screenContentTop,
  },
});
