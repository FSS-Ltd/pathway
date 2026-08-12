import { ScrollView, StyleSheet } from "react-native";
import * as SecureStore from "expo-secure-store";
import { fireEvent, renderRouter, waitFor } from "expo-router/testing-library";

import { mobileTokens } from "@/design/tokens";
import { ServeBottomNav } from "@/components/navigation/serve-bottom-nav";
import * as paceApi from "@/lib/api/pace";
import ServeTabsLayout from "../../../../app/(serve)/(tabs)/_layout";
import { PaceScreen } from "./pace-screen";

const mockWindowDimensions = jest.fn();
const mockAppReady = jest.fn();

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => mockWindowDimensions(),
}));

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
});

afterEach(() => {
  mockWindowDimensions.mockReset();
  mockAppReady.mockReset();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it("lets the real tab layout reserve the expanded Serve nav exactly once", async () => {
  const screen = renderRouter(
    {
      _layout: ServeTabsLayout,
      account: () => null,
      attendance: () => null,
      communications: () => null,
      pace: () => <PaceScreen />,
      reporting: () => null,
      safeguarding: () => null,
      schedule: () => null,
    },
    { initialUrl: "/pace" },
  );

  await waitFor(() =>
    expect(screen.getByText("Record assessment")).toBeTruthy(),
  );
  expect(mockWindowDimensions).toHaveBeenCalled();

  const tabBar = screen.UNSAFE_root.findByType(ServeBottomNav);
  const tabBarHost = screen.getByTestId("serve-bottom-nav");
  if (typeof tabBarHost.props.onLayout === "function") {
    fireEvent(tabBarHost, "layout", {
      nativeEvent: { layout: { height: 220, width: 320, x: 0, y: 0 } },
    });
  }

  let tabBranch = tabBar;
  let navigator = tabBar.parent;
  while (
    navigator &&
    !navigator.children.some((child) => {
      if (typeof child === "string" || child === tabBranch) return false;
      const style = StyleSheet.flatten(child.props.style);
      return style?.flex === 1 && style?.overflow === "hidden";
    })
  ) {
    tabBranch = navigator;
    navigator = navigator.parent;
  }

  const scene = navigator?.children.find((child) => {
    if (typeof child === "string" || child === tabBranch) return false;
    const style = StyleSheet.flatten(child.props.style);
    return style?.flex === 1 && style?.overflow === "hidden";
  });
  expect(StyleSheet.flatten(navigator?.props.style)?.flexDirection).toBe(
    "column",
  );
  expect(
    typeof scene === "string"
      ? undefined
      : StyleSheet.flatten(scene?.props.style),
  ).toEqual(expect.objectContaining({ flex: 1, overflow: "hidden" }));
  expect(StyleSheet.flatten(tabBranch.props.style)?.position).not.toBe(
    "absolute",
  );
  expect(StyleSheet.flatten(tabBarHost.props.style)?.position).not.toBe(
    "absolute",
  );

  const scrollView = screen.UNSAFE_root.findByType(ScrollView);
  const contentStyle = StyleSheet.flatten(
    scrollView.props.contentContainerStyle,
  );
  expect(contentStyle?.paddingBottom).toBe(mobileTokens.spacing.xs);
});
