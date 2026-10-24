import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";

import { PlayerProvider } from "@/player/PlayerProvider";
import { colors } from "@/ui/theme";

// A two-level stack with no tab bar: the library, then a book's chapter river or the Import screen
// (design/layouts/DECISION.md).
// Each screen draws its own top bar, so the stack's header is off.
export default function RootLayout() {
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
          <Stack.Screen name="index" options={{ title: "Library" }} />
          <Stack.Screen name="import" options={{ title: "Import" }} />
          <Stack.Screen name="book/[id]" options={{ title: "Mood Read" }} />
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
