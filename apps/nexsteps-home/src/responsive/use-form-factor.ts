import { useWindowDimensions } from "react-native";

import { isTabletWidth } from "./breakpoints";

export type FormFactor = "phone" | "tablet";

/**
 * Built on useWindowDimensions so it tracks rotation live. apps/mobile has
 * no equivalent utility at all (grep for
 * useWindowDimensions|Dimensions|isTablet|PixelRatio|Platform.isPad finds
 * nothing there).
 */
export function useFormFactor(): {
  formFactor: FormFactor;
  isTablet: boolean;
  width: number;
  height: number;
} {
  const { width, height } = useWindowDimensions();
  const isTablet = isTabletWidth(width);

  return {
    formFactor: isTablet ? "tablet" : "phone",
    isTablet,
    width,
    height,
  };
}
