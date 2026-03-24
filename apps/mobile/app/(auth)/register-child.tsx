import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BrandLogo } from "@/components/primitives/brand-logo";
import { mobileTokens } from "@/design/tokens";

export default function RegisterChildScreen() {
  function handleDemoScan() {
    router.replace("/(family)/(tabs)/home");
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.root}>
        <View style={styles.backgroundLayer} />
        <View style={[styles.glowBlob, styles.glowMint]} />
        <View style={[styles.glowBlob, styles.glowGold]} />
        <View style={[styles.glowBlob, styles.glowBlue]} />

        <View style={styles.headerRow}>
          <View style={styles.logoRow}>
            <BrandLogo width={120} height={42} />
          </View>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.closeButton, pressed ? styles.pressed : undefined]}
          >
            <Ionicons name="close" size={24} color={mobileTokens.colors.text.inverse} />
          </Pressable>
        </View>

        <View style={styles.frameWrap}>
          <View style={styles.scanFrame}>
            <View style={[styles.frameCorner, styles.topLeft]} />
            <View style={[styles.frameCorner, styles.topRight]} />
            <View style={[styles.frameCorner, styles.bottomLeft]} />
            <View style={[styles.frameCorner, styles.bottomRight]} />
          </View>
        </View>

        <View style={styles.overlayCard}>
          <View style={styles.badge}>
            <Ionicons name="camera-outline" size={26} color={mobileTokens.colors.text.primary} />
          </View>

          <Text style={styles.title}>Scan your organization&apos;s QR code to register</Text>
          <Text style={styles.description}>
            Hold your device steady and align the QR code within the frame above to register with your organization
          </Text>

          <Pressable onPress={handleDemoScan} style={({ pressed }) => [styles.demoButton, pressed ? styles.pressed : undefined]}>
            <Text style={styles.demoButtonText}>Demo Scan</Text>
          </Pressable>

          <Text style={styles.helper}>Scanner backend integration is the next step.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0F1117",
  },
  root: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 22,
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(21, 24, 30, 0.9)",
  },
  glowBlob: {
    position: "absolute",
    width: 230,
    height: 230,
    borderRadius: 230,
    opacity: 0.18,
  },
  glowMint: {
    backgroundColor: mobileTokens.colors.accent.primary,
    top: 220,
    left: -90,
  },
  glowGold: {
    backgroundColor: mobileTokens.colors.accent.secondary,
    right: -70,
    bottom: 130,
  },
  glowBlue: {
    backgroundColor: mobileTokens.colors.accent.serve,
    top: 120,
    right: -120,
  },
  headerRow: {
    zIndex: 1,
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  closeButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.26)",
    alignItems: "center",
    justifyContent: "center",
  },
  frameWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 8,
  },
  scanFrame: {
    width: "86%",
    maxWidth: 340,
    aspectRatio: 1,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: "#80E6D3",
  },
  frameCorner: {
    position: "absolute",
    width: 24,
    height: 24,
    borderColor: "#80E6D3",
  },
  topLeft: {
    top: -4,
    left: -4,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 8,
  },
  topRight: {
    top: -4,
    right: -4,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 8,
  },
  bottomLeft: {
    bottom: -4,
    left: -4,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 8,
  },
  bottomRight: {
    bottom: -4,
    right: -4,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 8,
  },
  overlayCard: {
    zIndex: 1,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.24)",
    backgroundColor: "rgba(41, 44, 50, 0.82)",
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 18,
    alignItems: "center",
  },
  badge: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: mobileTokens.colors.accent.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    textAlign: "center",
    color: mobileTokens.colors.text.inverse,
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.bold,
    fontSize: 47,
    lineHeight: 55,
    marginBottom: 10,
  },
  description: {
    textAlign: "center",
    color: "rgba(255,255,255,0.87)",
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: 17,
    lineHeight: 26,
    marginBottom: 16,
  },
  demoButton: {
    minHeight: 62,
    alignSelf: "stretch",
    borderRadius: 18,
    borderWidth: 2,
    borderColor: mobileTokens.colors.accent.primary,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  demoButtonText: {
    color: mobileTokens.colors.text.primary,
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.bold,
    fontSize: 21,
    lineHeight: 28,
  },
  helper: {
    textAlign: "center",
    color: "rgba(255,255,255,0.68)",
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: 12,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.86,
  },
});
