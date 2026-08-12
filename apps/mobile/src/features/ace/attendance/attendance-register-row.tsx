import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { mobileTokens } from "@/design/tokens";
import type { AttendanceRegisterStatus } from "@/lib/api/attendance";

type MarkedStatus = Exclude<AttendanceRegisterStatus, "unknown">;

const STATUS_OPTIONS: readonly MarkedStatus[] = ["present", "absent", "late"];

type AttendanceRegisterRowProps = {
  childName: string;
  savedStatus: AttendanceRegisterStatus;
  selectedStatus: AttendanceRegisterStatus;
  correctionReason: string;
  correctionError?: string;
  requiresCorrectionReason: boolean;
  disabled: boolean;
  onSelect: (status: MarkedStatus) => void;
  onChangeCorrectionReason: (value: string) => void;
};

export function AttendanceRegisterRow({
  childName,
  savedStatus,
  selectedStatus,
  correctionReason,
  correctionError,
  requiresCorrectionReason,
  disabled,
  onSelect,
  onChangeCorrectionReason,
}: AttendanceRegisterRowProps) {
  const isChanged =
    selectedStatus !== "unknown" && selectedStatus !== savedStatus;

  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <View style={styles.avatar}>
          <Ionicons
            color={mobileTokens.colors.text.subtle}
            name="person-outline"
            size={26}
          />
        </View>
        <View style={styles.headingText}>
          <Text style={styles.childName}>{childName}</Text>
          <View style={styles.savedStatus}>
            <StatusIcon status={savedStatus} />
            <Text style={styles.savedStatusText}>
              Saved: {statusLabel(savedStatus)}
            </Text>
          </View>
          {isChanged ? (
            <Text style={styles.pendingStatus}>
              Pending: {statusLabel(selectedStatus)}
            </Text>
          ) : null}
        </View>
      </View>

      <View
        accessibilityLabel={`Attendance status for ${childName}`}
        accessibilityRole="radiogroup"
        style={styles.segmentedControl}
      >
        {STATUS_OPTIONS.map((status) => {
          const selected = selectedStatus === status;
          return (
            <Pressable
              accessibilityLabel={`${childName}: ${statusLabel(status)}`}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              key={status}
              onPress={() => onSelect(status)}
              style={({ pressed }) => [
                styles.segment,
                selected ? styles.segmentSelected : undefined,
                pressed ? styles.segmentPressed : undefined,
              ]}
            >
              <StatusIcon status={status} />
              <Text style={styles.segmentText}>{statusLabel(status)}</Text>
            </Pressable>
          );
        })}
      </View>

      {requiresCorrectionReason ? (
        <View style={styles.reasonField}>
          <Text style={styles.reasonLabel}>Correction reason</Text>
          <TextInput
            accessibilityLabel={`Correction reason for ${childName}`}
            accessibilityState={{ disabled }}
            editable={!disabled}
            multiline
            onChangeText={onChangeCorrectionReason}
            placeholder="Explain why the saved status is changing"
            style={[
              styles.reasonInput,
              correctionError ? styles.reasonInputInvalid : undefined,
            ]}
            value={correctionReason}
          />
          {correctionError ? (
            <Text accessibilityRole="alert" style={styles.errorText}>
              {correctionError}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function statusLabel(status: AttendanceRegisterStatus): string {
  if (status === "present") return "Present";
  if (status === "absent") return "Absent";
  if (status === "late") return "Late";
  return "Not marked";
}

function StatusIcon({ status }: { status: AttendanceRegisterStatus }) {
  return (
    <Ionicons color={statusColor(status)} name={statusIcon(status)} size={18} />
  );
}

function statusIcon(
  status: AttendanceRegisterStatus,
): ComponentProps<typeof Ionicons>["name"] {
  if (status === "present") return "checkmark-circle-outline";
  if (status === "late") return "time-outline";
  if (status === "absent") return "close-circle-outline";
  return "alert-circle-outline";
}

function statusColor(status: AttendanceRegisterStatus): string {
  if (status === "present") return "#247f70";
  if (status === "late") return "#986b12";
  if (status === "absent") return "#a1263d";
  return mobileTokens.colors.text.subtle;
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: mobileTokens.colors.border.subtle,
    borderRadius: mobileTokens.radius.lg,
    padding: mobileTokens.spacing.md,
    gap: mobileTokens.spacing.sm,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: mobileTokens.spacing.sm,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: mobileTokens.colors.border.subtle,
    alignItems: "center",
    justifyContent: "center",
  },
  headingText: {
    flex: 1,
    gap: mobileTokens.spacing.xxxs,
  },
  childName: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.bold,
    fontSize: mobileTokens.typography.body.lg.size,
    lineHeight: mobileTokens.typography.body.lg.lineHeight,
    color: mobileTokens.colors.text.primary,
  },
  savedStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: mobileTokens.spacing.xxs,
  },
  savedStatusText: {
    flexShrink: 1,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.semibold,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
    color: mobileTokens.colors.text.primary,
  },
  pendingStatus: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.semibold,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
    color: mobileTokens.colors.text.muted,
  },
  segmentedControl: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileTokens.spacing.xs,
  },
  segment: {
    minHeight: 52,
    minWidth: 88,
    flexGrow: 1,
    flexBasis: 88,
    borderWidth: 2,
    borderColor: mobileTokens.colors.border.subtle,
    borderRadius: mobileTokens.radius.lg,
    paddingHorizontal: mobileTokens.spacing.sm,
    paddingVertical: mobileTokens.spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: mobileTokens.spacing.xxs,
  },
  segmentSelected: {
    borderColor: mobileTokens.colors.accent.primary,
    backgroundColor: "#EAF6F3",
  },
  segmentPressed: {
    opacity: 0.86,
  },
  segmentText: {
    flexShrink: 1,
    textAlign: "center",
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.bold,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
    color: mobileTokens.colors.text.primary,
  },
  reasonField: {
    gap: mobileTokens.spacing.xxs,
  },
  reasonLabel: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.semibold,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
    color: mobileTokens.colors.text.primary,
  },
  reasonInput: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: mobileTokens.colors.border.subtle,
    borderRadius: mobileTokens.radius.lg,
    paddingHorizontal: mobileTokens.spacing.sm,
    paddingVertical: mobileTokens.spacing.xs,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
    color: mobileTokens.colors.text.primary,
    textAlignVertical: "top",
  },
  reasonInputInvalid: {
    borderColor: "#a1263d",
  },
  errorText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    lineHeight: mobileTokens.typography.body.sm.lineHeight,
    color: "#a1263d",
  },
});
