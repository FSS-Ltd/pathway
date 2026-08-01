import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";

/**
 * Placeholder for screen-inventory.json id "progress-overview". Real
 * implementation lands in Plan 07 (Progress), consuming the Phase 4
 * Learning APIs.
 */
export default function ProgressScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader eyebrow="Progress" title="A growing record of learning" />
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
