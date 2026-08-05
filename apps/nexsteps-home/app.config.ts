import type { ExpoConfig } from "expo/config";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, ".env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function clean(value: string | undefined, fallback = ""): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (/^\$\{.+\}$/.test(trimmed)) return fallback;
  return trimmed;
}

const clerkPublishableKey = clean(
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
);
const apiUrl = clean(process.env.EXPO_PUBLIC_API_URL);
const isProduction = process.env.NODE_ENV === "production";

const config: ExpoConfig = {
  name: "NexSteps Home",
  slug: "nexsteps-home",
  scheme: "nexstepshome",
  version: "0.1.0",
  // "default" (not "portrait") so the app can rotate into the tablet
  // two-pane layout. Android has no separate orientation lock to unset.
  orientation: "default",
  // No icon/splash yet: apps/mobile points at a Nexsteps.png that does not
  // exist in the repo (a pre-existing gap, unfixed there too). Both fields
  // are optional in ExpoConfig; Expo's default icon is used until a real
  // design pass supplies brand assets. Do not point this at a placeholder.
  userInterfaceStyle: "light",
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.nexsteps.home",
    infoPlist: isProduction
      ? undefined
      : {
          NSAppTransportSecurity: {
            NSAllowsLocalNetworking: true,
            NSExceptionDomains: {
              localhost: {
                NSIncludesSubdomains: true,
                NSTemporaryExceptionAllowsInsecureHTTPLoads: true,
                NSTemporaryExceptionMinimumTLSVersion: "TLSv1.0",
              },
              "api.localhost": {
                NSIncludesSubdomains: true,
                NSTemporaryExceptionAllowsInsecureHTTPLoads: true,
                NSTemporaryExceptionMinimumTLSVersion: "TLSv1.0",
              },
            },
          },
        },
  },
  android: {
    package: "com.nexsteps.home",
  },
  plugins: ["expo-router"],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    apiUrl,
    clerkPublishableKey,
  },
};

export default config;
