export type MobileDeviceGeometry = {
  device: {
    width: number;
    height: number;
  };
  screen: {
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
  };
  safeArea: {
    top: number;
    bottom: number;
  };
  keyboard: {
    height: number;
  };
};

export const iphoneGeometry = {
  // CSS-space coordinates for the 3x iPhone assets. Keep source PNG dimensions
  // divisible by 3 so the rendered phone frame lands on whole CSS pixels.
  device: {
    width: 511,
    height: 968,
  },
  screen: {
    x: 59,
    y: 58,
    width: 393,
    height: 852,
    radius: 42,
  },
  safeArea: {
    top: 54,
    bottom: 34,
  },
  keyboard: {
    height: 338,
  },
} as const satisfies MobileDeviceGeometry;

export const pixelGeometry = {
  // Pixel10.png is a 2x asset. Its 854 x 1904 screen opening renders at
  // exactly 427 x 952 CSS pixels inside the 566 x 1022 asset canvas.
  device: {
    width: 566,
    height: 1022,
  },
  screen: {
    x: 70,
    y: 35,
    width: 427,
    height: 952,
    radius: 58,
  },
  safeArea: {
    top: 64,
    bottom: 48,
  },
  keyboard: {
    height: 316,
  },
} as const satisfies MobileDeviceGeometry;

export const tabletGeometry = {
  // No bezel asset for this preset (see Device.tsx) - the device canvas IS
  // the screen, at iPad 11" landscape logical points (1194 x 834). safeArea
  // approximates iPadOS's status bar and centred home-indicator regions;
  // exactness matters less here since there is no photographed hardware
  // bezel establishing a real pixel grid to match, unlike the iPhone/Pixel
  // presets.
  device: {
    width: 1194,
    height: 834,
  },
  screen: {
    x: 0,
    y: 0,
    width: 1194,
    height: 834,
    radius: 24,
  },
  safeArea: {
    top: 24,
    bottom: 20,
  },
  keyboard: {
    height: 380,
  },
} as const satisfies MobileDeviceGeometry;

export type IPhoneGeometry = typeof iphoneGeometry;
