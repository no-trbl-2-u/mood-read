import { useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { colors, spacing, typography } from "@/ui/theme";

// One book's player, keyed by its id. The real player (transport, the
// soundscape layer) arrives in spec 01; this is the placeholder shell.
export default function BookPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Player</Text>
      <Text style={styles.caption}>Book id: {id}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "flex-start",
    justifyContent: "flex-start",
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    ...typography.title,
  },
  caption: {
    ...typography.caption,
  },
});
