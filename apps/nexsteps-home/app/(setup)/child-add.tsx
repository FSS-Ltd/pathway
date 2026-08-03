import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { FieldInput, NoticeCard, ScreenActions, ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import { ageToDateOfBirth } from "@/lib/child-age";
import { useCreateChild } from "@/lib/queries/children";

export default function ChildAddScreen() {
  const createChild = useCreateChild();
  const [firstName, setFirstName] = useState("");
  const [age, setAge] = useState("");
  const [yearGroup, setYearGroup] = useState("");

  const parsedAge = Number(age);
  const canSave =
    firstName.trim().length > 0 &&
    age.trim().length > 0 &&
    Number.isInteger(parsedAge) &&
    parsedAge >= 0 &&
    parsedAge <= 25;

  const handleSave = () => {
    if (!canSave) return;
    createChild.mutate(
      {
        firstName: firstName.trim(),
        dateOfBirth: ageToDateOfBirth(parsedAge),
        yearGroup: yearGroup.trim() || undefined,
      },
      { onSuccess: () => router.replace("/(setup)/children-list") },
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Setup · 1 of 3"
          title="Add a child"
          description="We only ask for what helps organise learning."
        />

        <FieldInput
          fields={[
            {
              key: "firstName",
              label: "First name or nickname",
              value: firstName,
              onChangeText: setFirstName,
              placeholder: "Maya",
            },
            {
              key: "age",
              label: "Age",
              value: age,
              onChangeText: setAge,
              placeholder: "9",
              keyboardType: "numeric",
            },
            {
              key: "yearGroup",
              label: "Learning stage (optional)",
              value: yearGroup,
              onChangeText: setYearGroup,
              placeholder: "Year 4 equivalent",
            },
          ]}
        />

        <NoticeCard
          title="Private by default"
          body="Child names, ages, plans and evidence never appear in Community."
        />

        {createChild.isError ? (
          <NoticeCard title="Could not save this child" body="Check your connection and try again." tone="danger" />
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        <ScreenActions
          primaryLabel={createChild.isPending ? "Saving..." : "Save child"}
          onPrimaryPress={canSave && !createChild.isPending ? handleSave : undefined}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: homeTokens.colors.bg.shell,
  },
  content: {
    paddingHorizontal: homeTokens.layout.screenHorizontalPadding,
    paddingTop: homeTokens.metrics.screenContentTop,
    paddingBottom: homeTokens.metrics.tabBarAwareBottomPadding,
    gap: homeTokens.metrics.blockGap,
  },
  actions: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: homeTokens.layout.screenHorizontalPadding,
    paddingBottom: homeTokens.metrics.blockGap,
  },
});
