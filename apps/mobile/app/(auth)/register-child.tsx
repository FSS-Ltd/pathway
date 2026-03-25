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
        <View style={styles.dimmer} />
        <View style={[styles.glowBlob, styles.glowMint]} />
        <View style={[styles.glowBlob, styles.glowGold]} />
        <View style={[styles.glowBlob, styles.glowBlue]} />

        <View style={styles.headerRow}>
          <View style={styles.logoRow}>
            <BrandLogo width={136} height={48} />
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
          <Text style={styles.frameHint}>Position QR code within the frame</Text>
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
    paddingTop: 10,
    paddingBottom: 20,
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#151921",
  },
  dimmer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  glowBlob: {
    position: "absolute",
    width: 230,
    height: 230,
    borderRadius: 230,
    opacity: 0.24,
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
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  closeButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.26)",
    alignItems: "center",
    justifyContent: "center",
  },
  frameWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
    marginBottom: 2,
  },
  scanFrame: {
    width: "84%",
    maxWidth: 326,
    aspectRatio: 1,
    borderRadius: 22,
    borderWidth: 4,
    borderColor: "#80E6D3",
  },
  frameHint: {
    marginTop: 14,
    textAlign: "center",
    color: "rgba(255,255,255,0.92)",
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: mobileTokens.typography.weight.semibold,
  },
  frameCorner: {
    position: "absolute",
    width: 28,
    height: 28,
    borderColor: "#80E6D3",
  },
  topLeft: {
    top: -5,
    left: -5,
    borderTopWidth: 5,
    borderLeftWidth: 5,
    borderTopLeftRadius: 10,
  },
  topRight: {
    top: -5,
    right: -5,
    borderTopWidth: 5,
    borderRightWidth: 5,
    borderTopRightRadius: 10,
  },
  bottomLeft: {
    bottom: -5,
    left: -5,
    borderBottomWidth: 5,
    borderLeftWidth: 5,
    borderBottomLeftRadius: 10,
  },
  bottomRight: {
    bottom: -5,
    right: -5,
    borderBottomWidth: 5,
    borderRightWidth: 5,
    borderBottomRightRadius: 10,
  },
  overlayCard: {
    zIndex: 1,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.28)",
    backgroundColor: "rgba(46, 49, 54, 0.76)",
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 18,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 18,
    elevation: 8,
  },
  badge: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: mobileTokens.colors.accent.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: {
    textAlign: "center",
    color: mobileTokens.colors.text.inverse,
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.bold,
    fontSize: 48,
    lineHeight: 56,
    marginBottom: 12,
  },
  description: {
    textAlign: "center",
    color: "rgba(255,255,255,0.87)",
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: 16,
    lineHeight: 25,
    marginBottom: 18,
  },
  demoButton: {
    minHeight: 60,
    minWidth: 220,
    paddingHorizontal: 20,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: mobileTokens.colors.accent.primary,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  demoButtonText: {
    color: mobileTokens.colors.text.primary,
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.bold,
    fontSize: 19,
    lineHeight: 26,
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
