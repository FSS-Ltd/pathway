import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";

/**
 * Placeholder for screen-inventory.json id "community-home". Real
 * implementation lands in Plan 11 (Community opt-in, directory,
 * connections) and returns no protected Community data before opt-in.
 */
export default function CommunityScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader eyebrow="Community" title="Good people, useful connections" />
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
