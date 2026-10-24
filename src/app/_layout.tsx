import { BricolageGrotesque_800ExtraBold } from "@expo-google-fonts/bricolage-grotesque/800ExtraBold";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";

import { PlayerProvider } from "@/player/PlayerProvider";
import { colors, fonts } from "@/ui/theme";

// A two-level stack with no tab bar: the library ("Your shelf"), then a book's chapter river, the Import screen or
// Settings (design/layouts/DECISION.md). Each screen draws its own top bar, so the stack's header is off.
// The display face (Bricolage Grotesque, OFL) is bundled and loaded here before the first screen draws; if it
// fails to load, the screens draw in the system font rather than not at all.
export default function RootLayout() {
  const [loaded, failed] = useFonts({ [fonts.display]: BricolageGrotesque_800ExtraBold });
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
          <Stack.Screen name="settings" options={{ title: "Settings" }} />
          <Stack.Screen name="privacy" options={{ title: "Privacy policy" }} />
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
