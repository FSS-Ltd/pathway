import { StyleSheet, Text, TextInput, View } from "react-native";

import { homeTokens } from "@/design/tokens";

export type EditableField = {
  key: string;
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  helper?: string;
  multiline?: boolean;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?: "default" | "email-address" | "numeric";
};

/**
 * Editable counterpart to FieldGroup, same visual container - FieldGroup is
 * display-only (label/value text), but activity-plan/task-editor/
 * calendar-editor/quick-log are creation forms that need real input.
 */
export function FieldInput({ fields }: { fields: EditableField[] }) {
  return (
    <View style={styles.container}>
      {fields.map((field) => (
        <View key={field.key} style={[styles.row, field.multiline ? styles.rowMultiline : undefined]}>
          <Text style={styles.label}>{field.label}</Text>
          <TextInput
            value={field.value}
            onChangeText={field.onChangeText}
            placeholder={field.placeholder}
            placeholderTextColor={homeTokens.colors.text.subtle}
            multiline={field.multiline}
            secureTextEntry={field.secureTextEntry}
            autoCapitalize={field.autoCapitalize}
            keyboardType={field.keyboardType}
            style={styles.input}
            accessibilityLabel={field.label}
          />
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
  rowMultiline: {
    minHeight: homeTokens.metrics.fieldGroupMinHeight * 1.6,
    alignItems: "stretch",
  },
  label: {
    fontFamily: homeTokens.typography.fontFamily.body,
    fontSize: homeTokens.typography.body.xs.size,
    lineHeight: homeTokens.typography.body.xs.lineHeight,
    color: homeTokens.colors.text.subtle,
  },
  input: {
    fontFamily: homeTokens.typography.bodyFamily.semibold,
    fontWeight: homeTokens.typography.weight.semibold,
    fontSize: homeTokens.typography.body.sm.size,
    lineHeight: homeTokens.typography.body.sm.lineHeight,
    color: homeTokens.colors.text.primary,
    padding: 0,
  },
  helper: {
    fontFamily: homeTokens.typography.fontFamily.body,
    fontSize: homeTokens.typography.body.xs.size,
    lineHeight: homeTokens.typography.body.xs.lineHeight,
    color: homeTokens.colors.text.muted,
  },
});
