import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";

/**
 * Placeholder for screen-inventory.json id "today". Real implementation
 * lands in Plan 06 (Week, Today, tasks and calendar).
 */
export default function TodayScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader eyebrow="Today" title="Good morning" />
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
