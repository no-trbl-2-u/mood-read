import { StyleSheet, Text, View } from "react-native";

import { colors, spacing, typography } from "@/ui/theme";

// The library: every book on the device (empty-state copy per
// agents.md's standing decisions). The real book list arrives in spec 01.
export default function LibraryScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Library</Text>
      <Text style={styles.caption}>No books yet. Add an audiobook file you own to start listening.</Text>
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
