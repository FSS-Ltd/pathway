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
const auth0CustomScheme = clean(process.env.AUTH0_MOBILE_CUSTOM_SCHEME, "nexsteps");
const apiUrl = clean(process.env.EXPO_PUBLIC_API_URL ?? process.env.AUTH0_MOBILE_API_URL);
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
