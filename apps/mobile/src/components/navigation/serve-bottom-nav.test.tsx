import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

const mockWindowDimensions = jest.fn();

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => {
  return {
    __esModule: true,
    default: () => mockWindowDimensions(),
  };
});

jest.mock("expo-router", () => ({
  Tabs: () => null,
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

import { ServeBottomNav } from "./serve-bottom-nav";

const routes = [
  { key: "attendance-key", name: "attendance" },
  { key: "schedule-key", name: "schedule" },
  { key: "pace-key", name: "pace" },
  { key: "behaviour-key", name: "behaviour" },
  { key: "communications-key", name: "communications" },
  { key: "account-key", name: "account" },
];

describe("ServeBottomNav", () => {
  beforeEach(() => {
    mockWindowDimensions.mockReturnValue({
      fontScale: 2,
      height: 640,
      scale: 2,
      width: 320,
    });
  });

  afterEach(() => {
    mockWindowDimensions.mockReset();
  });

  it("keeps permitted labelled actions usable at 320pt with a 200% font scale", () => {
    const navigation = {
      emit: jest.fn(() => ({ defaultPrevented: false })),
      navigate: jest.fn(),
    };
    const screen = render(
      <ServeBottomNav
        descriptors={{}}
        insets={{ bottom: 0, left: 0, right: 0, top: 0 }}
        navigation={navigation as never}
        state={{ index: 2, routes } as never}
        permissions={["ace.behaviour.read"]}
      />,
    );
    const row = screen.UNSAFE_root.find(
      (node) => typeof node.props.onLayout === "function",
    );
    fireEvent(row, "layout", {
      nativeEvent: { layout: { height: 64, width: 320, x: 0, y: 0 } },
    });

    expect(mockWindowDimensions).toHaveBeenCalled();
    expect(screen.getAllByRole("button")).toHaveLength(6);
    for (const label of [
      "Today",
      "Schedule",
      "PACE",
      "Behaviour",
      "Pickups",
      "Settings",
    ]) {
      const labelNode = screen.getByText(label);
      expect(labelNode.props.maxFontSizeMultiplier).toBeUndefined();
      expect(labelNode.props.numberOfLines).toBeUndefined();
      expect(StyleSheet.flatten(labelNode.props.style).lineHeight).toBe(36);
    }

    fireEvent.press(screen.getByText("Schedule"));
    expect(navigation.navigate).toHaveBeenCalledWith("schedule");
  });

  it("does not expose Behaviour navigation without its read permission", () => {
    const screen = render(
      <ServeBottomNav
        descriptors={{}}
        insets={{ bottom: 0, left: 0, right: 0, top: 0 }}
        navigation={
          {
            emit: jest.fn(() => ({ defaultPrevented: false })),
            navigate: jest.fn(),
          } as never
        }
        state={{ index: 0, routes } as never}
        permissions={[]}
      />,
    );

    expect(screen.queryByText("Behaviour")).toBeNull();
  });
});
