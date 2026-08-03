import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { ContentCard, FieldGroup, FieldInput, NoticeCard, ScreenActions, ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import { ApiError } from "@/lib/api";
import { useChild, useUpdateChild } from "@/lib/queries/children";
import { useSubjects } from "@/lib/queries/family-planner";

export default function ChildDetailsScreen() {
  const { childId } = useLocalSearchParams<{ childId?: string }>();
  const childQuery = useChild(childId ?? "");
  const subjectsQuery = useSubjects();
  const updateChild = useUpdateChild();

  const [firstName, setFirstName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  // Hydrate local edit state from the fetched child once, not on every
  // refetch - the app's QueryClient default is staleTime: 0
  // (src/providers/app-providers.tsx), so a background refetch while the
  // user is mid-edit would otherwise silently overwrite unsaved keystrokes.
  const hasHydrated = useRef(false);

  useEffect(() => {
    if (childQuery.data && !hasHydrated.current) {
      hasHydrated.current = true;
      setFirstName(childQuery.data.firstName);
      setPreferredName(childQuery.data.preferredName ?? "");
    }
  }, [childQuery.data]);

  if (!childId || childQuery.isError) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ScreenHeader eyebrow="Family" title="Could not load this child" />
          <NoticeCard title="Something went wrong" body="Check your connection and try again." tone="danger" />
        </View>
      </SafeAreaView>
    );
  }

  if (childQuery.isLoading || !childQuery.data) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ScreenHeader eyebrow="Family" title="Loading..." />
        </View>
      </SafeAreaView>
    );
  }

  const child = childQuery.data;
  const canSave = firstName.trim().length > 0;
  const isPermissionDenied =
    updateChild.isError && updateChild.error instanceof ApiError && updateChild.error.status === 403;

  const handleSave = () => {
    if (!canSave) return;
    updateChild.mutate(
      { id: child.id, input: { firstName: firstName.trim(), preferredName: preferredName.trim() || null } },
      { onSuccess: () => router.push("/(home)/(tabs)/family") },
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow={`Family · ${child.preferredName || child.firstName}`}
          title="Child details"
          description="Personal settings that support the week and learning record."
        />

        <FieldInput
          fields={[
            {
              key: "firstName",
              label: "First name",
              value: firstName,
              onChangeText: setFirstName,
              placeholder: "Maya",
            },
            {
              key: "preferredName",
              label: "Nickname (optional)",
              value: preferredName,
              onChangeText: setPreferredName,
              placeholder: "Shown across the app",
            },
          ]}
        />

        <FieldGroup fields={[{ label: "Learning stage", value: child.yearGroup ?? "Not set" }]} />

        <ContentCard
          title="Subjects"
          body={`${subjectsQuery.data?.length ?? 0} active subjects`}
          action="Manage subjects"
          onPress={() => router.push("/(home)/(tabs)/progress/subjects")}
        />

        {isPermissionDenied ? (
          <NoticeCard
            title="You can't edit this child"
            body="Only admins and linked parents can make changes."
            tone="danger"
          />
        ) : updateChild.isError ? (
          <NoticeCard title="Could not save changes" body="Check your connection and try again." tone="danger" />
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        <ScreenActions
          primaryLabel={updateChild.isPending ? "Saving..." : "Save changes"}
          onPrimaryPress={canSave && !updateChild.isPending ? handleSave : undefined}
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
