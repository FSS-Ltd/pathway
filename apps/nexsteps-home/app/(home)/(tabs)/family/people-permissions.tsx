import { useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  ContentCard,
  FieldInput,
  ListCard,
  NoticeCard,
  ScreenActions,
  ScreenHeader,
  type ListCardItem,
} from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import { useAppReady } from "@/hooks";
import { ApiError } from "@/lib/api";
import type { OrgRole } from "@/lib/api/org-people";
import {
  useInviteAdult,
  useOrgPeople,
  usePendingInvites,
  useRemovePersonAccess,
  useRevokeInvite,
} from "@/lib/queries/org-people";

// The wireframe's "Contributor · selected learning logs only" role has no
// counterpart here - see the ponytail note in src/lib/api/org-people.ts.
// ORG_ADMIN/ORG_MEMBER are the only roles this screen can display for an
// invited-and-accepted person; ORG_BILLING exists on the model but has no
// wireframe copy, so it gets a plain, undesigned description.
const ROLE_COPY: Record<OrgRole, string> = {
  ORG_ADMIN: "Owner · full family and billing access",
  ORG_MEMBER: "Parent · planning, logs and reports",
  ORG_BILLING: "Billing · manages billing and subscription",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function PeoplePermissionsScreen() {
  const { bootstrapState } = useAppReady();
  const currentUserId = bootstrapState.status === "ready" ? bootstrapState.session.userId : undefined;

  const peopleQuery = useOrgPeople();
  const invitesQuery = usePendingInvites();
  const inviteAdult = useInviteAdult();
  const revokeInvite = useRevokeInvite();
  const removePersonAccess = useRemovePersonAccess();

  const [isInviting, setIsInviting] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  const canInvite = EMAIL_PATTERN.test(email.trim());

  // The org-admin guards behind these mutations (assertOrgAdmin,
  // requireOrgAdminAccess) throw UnauthorizedException, which Nest maps to
  // 401, not 403 - check both so this state is actually reachable.
  const isDeniedStatus = (status: number) => status === 401 || status === 403;
  const isPermissionDenied =
    (inviteAdult.isError && inviteAdult.error instanceof ApiError && isDeniedStatus(inviteAdult.error.status)) ||
    (removePersonAccess.isError &&
      removePersonAccess.error instanceof ApiError &&
      isDeniedStatus(removePersonAccess.error.status)) ||
    (revokeInvite.isError && revokeInvite.error instanceof ApiError && isDeniedStatus(revokeInvite.error.status));
  const isValidationError =
    inviteAdult.isError && inviteAdult.error instanceof ApiError && inviteAdult.error.status === 400;
  const isOtherError =
    !isPermissionDenied &&
    !isValidationError &&
    (inviteAdult.isError || removePersonAccess.isError || revokeInvite.isError);

  const handleInvite = () => {
    if (!canInvite) return;
    inviteAdult.mutate(
      { email: email.trim(), name: name.trim() || undefined },
      {
        onSuccess: () => {
          setEmail("");
          setName("");
          setIsInviting(false);
        },
      },
    );
  };

  const handleCancelInvite = () => {
    setIsInviting(false);
    setEmail("");
    setName("");
  };

  const handleRemovePerson = (person: { id: string; name: string }) => {
    Alert.alert(
      "Remove access?",
      `${person.name} will lose access to this family account immediately. They can be re-invited later.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove access", style: "destructive", onPress: () => removePersonAccess.mutate(person.id) },
      ],
    );
  };

  const handleRevokeInvite = (invite: { id: string; email: string }) => {
    Alert.alert("Revoke invite?", `${invite.email} will no longer be able to accept this invitation.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Revoke invite", style: "destructive", onPress: () => revokeInvite.mutate(invite.id) },
    ]);
  };

  if (peopleQuery.isError || invitesQuery.isError) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ScreenHeader eyebrow="Family · People" title="Could not load people & permissions" />
          <NoticeCard title="Something went wrong" body="Check your connection and try again." tone="danger" />
        </View>
      </SafeAreaView>
    );
  }

  if (peopleQuery.isLoading || invitesQuery.isLoading || !peopleQuery.data || !invitesQuery.data) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ScreenHeader eyebrow="Family · People" title="Loading..." />
        </View>
      </SafeAreaView>
    );
  }

  const memberItems: ListCardItem[] = peopleQuery.data.map((person) => {
    const isYou = person.id === currentUserId;
    return {
      title: person.name,
      detail: ROLE_COPY[person.orgRole] ?? person.orgRole,
      meta: isYou ? "You" : "Active",
      onPress: isYou ? undefined : () => handleRemovePerson({ id: person.id, name: person.name }),
    };
  });

  const inviteItems: ListCardItem[] = invitesQuery.data.map((invite) => ({
    title: invite.email,
    detail: "Invited · not yet accepted",
    meta: "Invited",
    onPress: () => handleRevokeInvite({ id: invite.id, email: invite.email }),
  }));

  const items = [...memberItems, ...inviteItems];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Family · People"
          title="People & permissions"
          description="Invite adults with the minimum access they need."
        />

        {items.length === 0 ? (
          <NoticeCard
            title="No one else yet"
            body="Invite an adult below to share access to this family account."
          />
        ) : (
          <ListCard items={items} />
        )}

        <NoticeCard
          title="Community identity"
          body="Each adult controls their own Community profile and connections."
        />

        <ContentCard
          title="Invite an adult"
          body="Send a secure invitation to share access."
          action={isInviting ? undefined : "Invite"}
          tone="mint"
          onPress={isInviting ? undefined : () => setIsInviting(true)}
        />

        {isInviting ? (
          <>
            <FieldInput
              fields={[
                {
                  key: "email",
                  label: "Email",
                  value: email,
                  onChangeText: setEmail,
                  placeholder: "auntie.may@example.com",
                  autoCapitalize: "none",
                  keyboardType: "email-address",
                },
                {
                  key: "name",
                  label: "Name (optional)",
                  value: name,
                  onChangeText: setName,
                  placeholder: "Auntie May",
                },
              ]}
            />
            <ScreenActions
              primaryLabel={inviteAdult.isPending ? "Sending invite..." : "Send invite"}
              onPrimaryPress={canInvite && !inviteAdult.isPending ? handleInvite : undefined}
              secondaryLabel="Cancel"
              onSecondaryPress={handleCancelInvite}
            />
          </>
        ) : null}

        {isPermissionDenied ? (
          <NoticeCard
            title="You can't manage people"
            body="Only admins can invite, remove or revoke access."
            tone="danger"
          />
        ) : isValidationError ? (
          <NoticeCard title="Check the invite details" body="Enter a valid email address." tone="danger" />
        ) : isOtherError ? (
          <NoticeCard title="Something went wrong" body="Check your connection and try again." tone="danger" />
        ) : null}
      </ScrollView>
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
});
