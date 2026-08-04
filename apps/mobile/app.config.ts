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
  name: "Nexsteps",
  slug: "nexsteps-mobile",
  scheme: "nexsteps",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/Nexsteps.png",
  userInterfaceStyle: "light",
  splash: {
    image: "./assets/Nexsteps.png",
    resizeMode: "contain",
    backgroundColor: "#f4f6f8",
  },
  assetBundlePatterns: ["**/*"],
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.nexsteps.mobile",
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
    adaptiveIcon: {
      foregroundImage: "./assets/Nexsteps.png",
      backgroundColor: "#ffffff",
    },
    package: "com.nexsteps.mobile",
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
