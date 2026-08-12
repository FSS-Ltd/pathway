import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { mobileTokens } from "@/design/tokens";

const SERVE_ITEMS = [
  { routeName: "attendance", label: "Today", icon: "home-outline" as const },
  { routeName: "schedule", label: "Schedule", icon: "people-outline" as const },
  { routeName: "pace", label: "PACE", icon: "school-outline" as const },
  {
    routeName: "communications",
    label: "Pickups",
    icon: "notifications-outline" as const,
  },
  {
    routeName: "account",
    label: "Settings",
    icon: "settings-outline" as const,
  },
];

type ExpoTabBarProps = Parameters<
  NonNullable<ComponentProps<typeof Tabs>["tabBar"]>
>[0];

const ACTIVE_TILE_WIDTH = 76;

export function ServeBottomNav({
  state,
  descriptors,
  navigation,
}: ExpoTabBarProps) {
  const insets = useSafeAreaInsets();
  const { fontScale, width } = useWindowDimensions();
  const isCompactLargeText = width <= 320 && fontScale >= 2;
  const [rowWidth, setRowWidth] = useState(0);
  const indicatorX = useRef(new Animated.Value(0)).current;
  const indicatorInitialized = useRef(false);
  const entries = useMemo(() => {
    return SERVE_ITEMS.map((item) => {
      const route = state.routes.find(
        (r: { key: string; name: string }) =>
          r.name === item.routeName || r.name.startsWith(`${item.routeName}/`),
      );
      if (!route) return null;
      return {
        ...item,
        route,
      };
    }).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  }, [state.routes]);
  const activeIndex = entries.findIndex(
    (entry) => state.routes[state.index]?.key === entry.route.key,
  );
  const slotWidth =
    entries.length > 0 && rowWidth > 0 ? rowWidth / entries.length : 0;
  const activeTileWidth = Math.min(ACTIVE_TILE_WIDTH, slotWidth);
  const targetX =
    activeIndex >= 0 && slotWidth > 0
      ? activeIndex * slotWidth + (slotWidth - activeTileWidth) / 2
      : 0;

  useEffect(() => {
    if (activeIndex < 0 || slotWidth <= 0) return;

    if (!indicatorInitialized.current) {
      indicatorX.setValue(targetX);
      indicatorInitialized.current = true;
      return;
    }

    Animated.timing(indicatorX, {
      toValue: targetX,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [activeIndex, indicatorX, slotWidth, targetX]);

  return (
    <View
      testID="serve-bottom-nav"
      style={[
        styles.container,
        isCompactLargeText ? styles.compactContainer : undefined,
        { paddingBottom: Math.max(insets.bottom, 10) },
      ]}
    >
      <View
        style={[
          styles.row,
          isCompactLargeText ? styles.largeTextRow : undefined,
        ]}
        onLayout={(event) => {
          setRowWidth(event.nativeEvent.layout.width);
        }}
      >
        {!isCompactLargeText && entries.length > 0 && activeIndex >= 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.activeIndicator,
              {
                transform: [{ translateX: indicatorX }],
                width: activeTileWidth,
              },
            ]}
          />
        ) : null}
        {entries.map((entry) => {
          const isFocused = state.routes[state.index]?.key === entry.route.key;
          const labelStyle = [
            isFocused ? styles.activeText : styles.inactiveText,
            isCompactLargeText
              ? {
                  lineHeight:
                    mobileTokens.typography.body.xs.lineHeight * fontScale,
                }
              : undefined,
          ];
          const options = descriptors[entry.route.key]?.options as
            | {
                tabBarAccessibilityLabel?: string;
                tabBarButtonTestID?: string;
              }
            | undefined;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: entry.route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(entry.route.name);
            }
          };

          return (
            <Pressable
              key={entry.route.key}
              onPress={onPress}
              onLongPress={() => {
                navigation.emit({
                  type: "tabLongPress",
                  target: entry.route.key,
                });
              }}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options?.tabBarAccessibilityLabel}
              testID={options?.tabBarButtonTestID}
              style={({ pressed }) => [
                styles.item,
                isCompactLargeText ? styles.largeTextItem : undefined,
                pressed ? styles.pressedItem : undefined,
              ]}
            >
              <View
                style={[
                  styles.tabTile,
                  isCompactLargeText ? styles.largeTextTile : undefined,
                ]}
              >
                <Ionicons
                  name={entry.icon}
                  size={isFocused ? 23 : 22}
                  color={
                    isFocused
                      ? mobileTokens.colors.text.primary
                      : mobileTokens.colors.text.muted
                  }
                />
                <Text style={labelStyle}>{entry.label}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.pillWrap}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>Serve Space</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: mobileTokens.colors.bg.surface,
    borderTopWidth: 3,
    borderTopColor: mobileTokens.colors.accent.serve,
    paddingTop: 4,
    paddingHorizontal: 12,
  },
  compactContainer: {
    paddingHorizontal: 4,
  },
  row: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    position: "relative",
  },
  largeTextRow: {
    flexWrap: "wrap",
    justifyContent: "center",
  },
  item: {
    flex: 1,
    alignItems: "stretch",
    justifyContent: "center",
  },
  largeTextItem: {
    flexBasis: "33.333%",
    flexGrow: 0,
    flexShrink: 0,
  },
  tabTile: {
    width: "100%",
    maxWidth: ACTIVE_TILE_WIDTH,
    minHeight: 56,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    alignSelf: "center",
  },
  largeTextTile: {
    maxWidth: "100%",
    minHeight: 84,
    paddingHorizontal: 2,
  },
  activeIndicator: {
    position: "absolute",
    width: ACTIVE_TILE_WIDTH,
    minHeight: 56,
    borderRadius: 12,
    backgroundColor: mobileTokens.colors.accent.primary,
  },
  activeText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.xs.size,
    lineHeight: mobileTokens.typography.body.xs.lineHeight,
    fontWeight: mobileTokens.typography.weight.semibold,
    color: mobileTokens.colors.text.primary,
  },
  inactiveText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.xs.size,
    lineHeight: mobileTokens.typography.body.xs.lineHeight,
    fontWeight: mobileTokens.typography.weight.semibold,
    color: mobileTokens.colors.text.muted,
  },
  pillWrap: {
    marginTop: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: mobileTokens.spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: mobileTokens.colors.accent.serve,
  },
  pillText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.xs.size,
    lineHeight: mobileTokens.typography.body.xs.lineHeight,
    fontWeight: mobileTokens.typography.weight.semibold,
    color: mobileTokens.colors.text.primary,
  },
  pressedItem: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
  },
});
