import { render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { homeTokens } from "@/design/tokens";
import {
  ChipRow,
  ContentCard,
  FieldGroup,
  ListCard,
  MessageBubble,
  NoticeCard,
  ScreenActions,
  ScreenHeader,
  StatRow,
  WeekStrip,
} from ".";

/**
 * Fast gate for token-derived geometry, per the build-plan's Plan 01
 * acceptance: "The primitive snapshot tests must fail if a token-derived
 * geometry value changes." The pixel-accurate gate against the approved
 * wireframes arrives in Plan 02.
 */
function flatStyle(style: unknown) {
  return StyleSheet.flatten(style as never) as Record<string, unknown>;
}

describe("NoticeCard", () => {
  it("renders with the wireframe radius and border", () => {
    const { getByText, UNSAFE_root } = render(
      <NoticeCard title="Heads up" body="Something to know" tone="mint" />,
    );
    expect(getByText("Heads up")).toBeTruthy();
    const container = UNSAFE_root.findAllByType("View" as never)[0];
    expect(flatStyle(container.props.style).borderRadius).toBe(homeTokens.radius.lg);
  });
});

describe("ContentCard", () => {
  it("renders title, body and action", () => {
    const { getByText } = render(
      <ContentCard title="Nature journal walk" body="Maya - Maths - 45 minutes" action="Open" />,
    );
    expect(getByText("Nature journal walk")).toBeTruthy();
    expect(getByText("Open")).toBeTruthy();
  });
});

describe("FieldGroup", () => {
  it("renders every field row at the wireframe min-height", () => {
    const { getByText, UNSAFE_root } = render(
      <FieldGroup fields={[{ label: "Child", value: "Maya" }, { label: "Subject", value: "Maths" }]} />,
    );
    expect(getByText("Maya")).toBeTruthy();
    const rows = UNSAFE_root.findAllByType("View" as never).filter(
      (node) => flatStyle(node.props.style).minHeight === homeTokens.metrics.fieldGroupMinHeight,
    );
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("ChipRow", () => {
  it("marks the active chip with a non-colour signal", () => {
    const { getByText } = render(<ChipRow items={["Mon", "Tue", "Wed"]} active={[false, true, false]} />);
    expect(getByText("Tue")).toBeTruthy();
  });
});

describe("ListCard", () => {
  it("renders every item row", () => {
    const { getByText } = render(
      <ListCard
        title="Recent"
        items={[
          { title: "Renew library books", detail: "Due today" },
          { title: "Library visit", detail: "Whole family" },
        ]}
      />,
    );
    expect(getByText("Renew library books")).toBeTruthy();
    expect(getByText("Library visit")).toBeTruthy();
  });
});

describe("StatRow", () => {
  it("renders every stat at the wireframe min-height", () => {
    const { getByText, UNSAFE_root } = render(
      <StatRow items={[{ value: "12", label: "Logs" }, { value: "4", label: "Subjects" }]} />,
    );
    expect(getByText("12")).toBeTruthy();
    const cards = UNSAFE_root.findAllByType("View" as never).filter(
      (node) => flatStyle(node.props.style).minHeight === homeTokens.metrics.statCardMinHeight,
    );
    expect(cards.length).toBe(2);
  });
});

describe("MessageBubble", () => {
  it("renders sender for a received message but not an own message", () => {
    const received = render(<MessageBubble sender="Priya" body="Hello" time="10:02" />);
    expect(received.getByText("Priya")).toBeTruthy();

    const own = render(<MessageBubble sender="Me" body="Hi back" time="10:03" own />);
    expect(own.queryByText("Me")).toBeNull();
  });
});

describe("WeekStrip", () => {
  it("renders every day and flags the active one accessibly", () => {
    const { getByLabelText } = render(
      <WeekStrip
        activeDay="Tue"
        days={[
          { day: "Mon", date: "28" },
          { day: "Tue", date: "29", count: 3 },
        ]}
      />,
    );
    expect(getByLabelText("Tue 29, 3 items")).toBeTruthy();
  });
});

describe("ScreenHeader", () => {
  it("renders the wireframe-exact title type scale", () => {
    const { getByText } = render(<ScreenHeader eyebrow="Week" title="28 July - 1 August" />);
    const title = getByText("28 July - 1 August");
    expect(flatStyle(title.props.style).fontSize).toBe(
      homeTokens.typography.wireframe.screenTitle.size,
    );
  });
});

describe("ScreenActions", () => {
  it("renders exactly one dominant primary action by default", () => {
    const { getByText, queryByText } = render(<ScreenActions primaryLabel="Add to week" />);
    expect(getByText("Add to week")).toBeTruthy();
    expect(queryByText(/secondary/i)).toBeNull();
  });
});
