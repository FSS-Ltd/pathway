import type { ReactNode } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";

import * as paceApi from "@/lib/api/pace";
import ServeTabsLayout from "../../../../app/(serve)/(tabs)/_layout";
import { PaceScreen } from "./pace-screen";

let mockTabScene: ReactNode = null;
const mockWindowDimensions = jest.fn();
const mockAppReady = jest.fn();

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => mockWindowDimensions(),
}));

jest.mock("expo-router", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const routes = [
    { key: "attendance-key", name: "attendance" },
    { key: "schedule-key", name: "schedule" },
    { key: "pace-key", name: "pace" },
    { key: "communications-key", name: "communications" },
    { key: "account-key", name: "account" },
  ];
  const Tabs = ({
    tabBar,
  }: {
    tabBar: (props: Record<string, unknown>) => ReactNode;
  }) =>
    React.createElement(
      React.Fragment,
      null,
      mockTabScene,
      tabBar({
        descriptors: {},
        insets: { bottom: 0, left: 0, right: 0, top: 0 },
        navigation: {
          emit: jest.fn(() => ({ defaultPrevented: false })),
          navigate: jest.fn(),
        },
        state: { index: 2, routes },
      }),
    );
  Tabs.Screen = () => null;
  return {
    router: { push: jest.fn(), replace: jest.fn() },
    Tabs,
  };
});

jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context");
  return {
    ...actual,
    useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
  };
});

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("@/components/primitives/brand-logo", () => ({
  BrandLogo: () => null,
}));

jest.mock("@/hooks/use-app-ready", () => ({
  useAppReady: () => mockAppReady(),
}));

beforeEach(() => {
  mockWindowDimensions.mockReturnValue({
    fontScale: 2,
    height: 640,
    scale: 2,
    width: 320,
  });
  mockAppReady.mockReturnValue({
    isReady: true,
    bootstrapState: {
      status: "ready",
      route: "/(auth)/site-select",
      state: {
        userId: "user-1",
        activeSiteId: "site-1",
        updatedAt: "2026-08-12T09:00:00.000Z",
      },
      roles: {},
      activeSiteState: { activeSiteId: "site-1", sites: [] },
      space: "serve",
      availableSpaces: ["serve"],
      isDualSpaceUser: false,
      hasFamilyAccess: false,
      hasServeAccess: true,
    },
    refreshBootstrap: jest.fn(),
    signOut: jest.fn(),
    switchSpace: jest.fn(),
    switchActiveSite: jest.fn(),
  });
  jest.spyOn(paceApi, "fetchPaceRoster").mockResolvedValue({
    items: [
      {
        child: { id: "child-1", displayName: "Jordan Smith" },
        group: null,
        subject: { id: "subject-1", name: "Mathematics" },
        currentPace: 1001,
        targetPace: 1012,
        status: "ON_TRACK",
        currentLevel: 10,
        rebuiltAt: null,
      },
    ],
    nextCursor: null,
  });
  jest.spyOn(SecureStore, "getItemAsync").mockResolvedValue(
    JSON.stringify({
      childId: "child-1",
      subjectId: "subject-1",
      paceNumber: "1001",
      assessmentType: "FinalTest",
      score: "76",
      assessedAt: "2026-08-12T09:30:00.000Z",
      reason: "Supervised PACE test",
      idempotencyKey: "command-1",
    }),
  );
  jest.spyOn(SecureStore, "setItemAsync").mockResolvedValue();
  jest.spyOn(SecureStore, "deleteItemAsync").mockResolvedValue();
  mockTabScene = <PaceScreen />;
});

afterEach(() => {
  mockTabScene = null;
  mockWindowDimensions.mockReset();
  mockAppReady.mockReset();
  jest.restoreAllMocks();
});

it("keeps the PACE Record action scrollable above the expanded Serve nav at 320pt and 200% text", async () => {
  const screen = render(<ServeTabsLayout />);

  await waitFor(() =>
    expect(screen.getByText("Record assessment")).toBeTruthy(),
  );
  expect(mockWindowDimensions).toHaveBeenCalled();

  fireEvent(screen.getByTestId("serve-bottom-nav"), "layout", {
    nativeEvent: { layout: { height: 220, width: 320, x: 0, y: 0 } },
  });

  const scrollView = screen.UNSAFE_root.findByType(ScrollView);
  const contentStyle = StyleSheet.flatten(
    scrollView.props.contentContainerStyle,
  );
  expect(contentStyle?.paddingBottom).toBeGreaterThanOrEqual(220);
});
