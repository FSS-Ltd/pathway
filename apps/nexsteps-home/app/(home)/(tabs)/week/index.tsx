import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";

/**
 * Placeholder for screen-inventory.json id "week-home". Real
 * implementation, matched pixel-for-pixel against the wireframe, lands in
 * Plan 06 (Week, Today, tasks and calendar).
 */
export default function WeekScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader eyebrow="Week" title="28 July - 1 August" />
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
