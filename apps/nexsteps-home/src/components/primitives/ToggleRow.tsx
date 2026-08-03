import { StyleSheet, Switch, Text, View } from "react-native";

import { homeTokens } from "@/design/tokens";

export type ToggleRowProps = {
  label: string;
  detail?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
};

export function ToggleRow({ label, detail, value, onValueChange, disabled }: ToggleRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.textColumn}>
        <Text style={styles.label}>{label}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: homeTokens.colors.bg.panel, true: homeTokens.colors.accent.primary }}
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: value, disabled: !!disabled }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: homeTokens.metrics.fieldGroupMinHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: homeTokens.spacing.xs,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: homeTokens.radius.field,
    backgroundColor: homeTokens.colors.bg.panel,
  },
  textColumn: {
    flex: 1,
    gap: homeTokens.spacing.xxxs,
  },
  label: {
    fontFamily: homeTokens.typography.bodyFamily.semibold,
    fontWeight: homeTokens.typography.weight.semibold,
    fontSize: homeTokens.typography.body.sm.size,
    lineHeight: homeTokens.typography.body.sm.lineHeight,
    color: homeTokens.colors.text.primary,
  },
  detail: {
    fontFamily: homeTokens.typography.fontFamily.body,
    fontSize: homeTokens.typography.body.xs.size,
    lineHeight: homeTokens.typography.body.xs.lineHeight,
    color: homeTokens.colors.text.muted,
  },
});
