import { useLocalSearchParams } from "expo-router";
import { Text } from "react-native";

import { Screen } from "@/components/primitives/screen";

export default function ServeAttendanceSessionScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();

  return (
    <Screen
      title="Attendance Session"
      subtitle="Serve Space only. Family Space must never access this view."
    >
      <Text>Session ID: {sessionId}</Text>
      <Text>TODO(offline-sync): queue marks and sync when network is available.</Text>
    </Screen>
  );
}
