import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";

import "@/lib/downloads";
// The verdict sender (07.5): on start it posts the day's batch, if any is due (src/lib/verdict-sync.ts).
import "@/lib/verdicts";

import { library } from "@/lib/library";
import { scoring } from "@/lib/scoring";

import { PlayerProvider } from "@/player/PlayerProvider";
import { installFocusRing } from "@/ui/focus-ring";
import { colors, fonts } from "@/ui/theme";

// A keyboard focus draws the theme's focus ring on the web (06.5).
installFocusRing();

// A two-level stack with no tab bar: the library ("Your shelf"), then a book's chapter river, the Import screen or
// Settings (design/layouts/DECISION.md). Each screen draws its own top bar, so the stack's header is off.
// The display face (Bricolage Grotesque, OFL) is loaded here before the first screen draws; if it fails to load,
// the screens draw in the system font rather than not at all. The file is a byte-for-byte copy of
// @expo-google-fonts/bricolage-grotesque's (src/lib/fonts.test.ts) kept in assets/fonts/ with its OFL text, because
// the web export puts a package's assets under dist/assets/node_modules/, which Cloudflare Pages never uploads.
const DISPLAY_FACE = require("../../assets/fonts/BricolageGrotesque_800ExtraBold.ttf");

export default function RootLayout() {
  const [loaded, failed] = useFonts({ [fonts.display]: DISPLAY_FACE });
  // Scoring runs on the proxy whether or not the app is open; on start, pick up any job left running (A15).
  useEffect(() => {
    scoring.resumeAll(library.books());
  }, []);
  if (!loaded && !failed) return <View style={styles.root} />;
  return (
    <PlayerProvider>
      <View style={styles.root}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ title: "Your shelf" }} />
          <Stack.Screen name="import" options={{ title: "Import" }} />
          <Stack.Screen name="book/[id]" options={{ title: "Mood Read" }} />
          <Stack.Screen name="browse" options={{ title: "Browse" }} />
          <Stack.Screen name="browse/[id]" options={{ title: "Browse" }} />
          <Stack.Screen name="settings" options={{ title: "Settings" }} />
          <Stack.Screen name="downloads" options={{ title: "Downloads" }} />
          <Stack.Screen name="privacy" options={{ title: "Privacy policy" }} />
          <Stack.Screen name="licenses" options={{ title: "Open-source licenses" }} />
          <Stack.Screen name="soundtrack" options={{ title: "Your soundtrack" }} />
          <Stack.Screen name="credits" options={{ title: "Credits" }} />
        </Stack>
      </View>
    </PlayerProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
