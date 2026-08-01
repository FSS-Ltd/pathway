import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { useFormFactor } from "./use-form-factor";

/**
 * List pane renders at the exact wireframe screen width (default 393pt,
 * the iPhone geometry the prototype was built against) so phone-fidelity
 * layout is preserved unchanged inside the tablet two-pane frame.
 *
 * On phone, only `list` renders — detail is reached through the normal
 * expo-router push stack, which this component does not own. No screen
 * consumes TwoPane yet; which flows get two-pane treatment is a design
 * decision made in Plan 03, not this scaffolding plan.
 */
export function TwoPane({
  list,
  detail,
  listWidth = 393,
}: {
  list: ReactNode;
  detail?: ReactNode;
  listWidth?: number;
}) {
  const { isTablet } = useFormFactor();

  if (!isTablet) {
    return <View style={styles.phone}>{list}</View>;
  }

  return (
    <View style={styles.tablet}>
      <View style={[styles.listPane, { width: listWidth }]}>{list}</View>
      <View style={styles.detailPane}>{detail}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  phone: {
    flex: 1,
  },
  tablet: {
    flex: 1,
    flexDirection: "row",
  },
  listPane: {
    flexShrink: 0,
  },
  detailPane: {
    flex: 1,
  },
});
