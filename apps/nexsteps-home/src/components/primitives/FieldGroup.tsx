import { StyleSheet, Text, View } from "react-native";

import { homeTokens } from "@/design/tokens";

export type Field = {
  label: string;
  value: string;
  helper?: string;
};

export function FieldGroup({ fields }: { fields: Field[] }) {
  return (
    <View style={styles.container}>
      {fields.map((field) => (
        <View key={field.label} style={styles.row}>
          <Text style={styles.label}>{field.label}</Text>
          <Text style={styles.value}>{field.value}</Text>
          {field.helper ? <Text style={styles.helper}>{field.helper}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: homeTokens.spacing.xs,
  },
  row: {
    minHeight: homeTokens.metrics.fieldGroupMinHeight,
    justifyContent: "center",
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: homeTokens.radius.field,
    backgroundColor: homeTokens.colors.bg.panel,
    gap: homeTokens.spacing.xxxs,
  },
  label: {
    fontFamily: homeTokens.typography.fontFamily.body,
    fontSize: homeTokens.typography.body.xs.size,
    lineHeight: homeTokens.typography.body.xs.lineHeight,
    color: homeTokens.colors.text.subtle,
  },
  value: {
    // Wireframe spec is font-weight: 650 on the inherited body (Quicksand)
    // family; semibold (600) is the nearest real loaded cut.
    fontFamily: homeTokens.typography.bodyFamily.semibold,
    fontWeight: homeTokens.typography.weight.semibold,
    fontSize: homeTokens.typography.body.sm.size,
    lineHeight: homeTokens.typography.body.sm.lineHeight,
    color: homeTokens.colors.text.primary,
  },
  helper: {
    fontFamily: homeTokens.typography.fontFamily.body,
    fontSize: homeTokens.typography.body.xs.size,
    lineHeight: homeTokens.typography.body.xs.lineHeight,
    color: homeTokens.colors.text.muted,
  },
});
