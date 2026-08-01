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

function normalizeDomain(value: string | undefined): string {
  return clean(value).replace(/^https?:\/\//, "");
}

const auth0Domain = normalizeDomain(process.env.AUTH0_MOBILE_DOMAIN ?? process.env.AUTH0_ISSUER);
const auth0ClientId = clean(process.env.AUTH0_MOBILE_CLIENT_ID);
const auth0Audience = clean(process.env.AUTH0_MOBILE_AUDIENCE ?? process.env.AUTH0_AUDIENCE);
const auth0Scope = clean(process.env.AUTH0_MOBILE_SCOPE, "openid profile email offline_access");
const auth0CustomScheme = clean(process.env.AUTH0_MOBILE_CUSTOM_SCHEME, "nexstepshome");
const apiUrl = clean(process.env.EXPO_PUBLIC_API_URL ?? process.env.AUTH0_MOBILE_API_URL);
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
  plugins: [
    "expo-router",
    [
      "react-native-auth0",
      {
        domain: auth0Domain,
        customScheme: auth0CustomScheme,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    apiUrl,
    auth0Domain,
    auth0ClientId,
    auth0Audience,
    auth0Scope,
    auth0CustomScheme,
  },
};

export default config;
