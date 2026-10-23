import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing } from "./theme";

/**
 * A bottom sheet over the river: it rises from just above the docked mini player, with a handle, over a dimmed
 * river; the mini player below stays undimmed (design/layouts/DECISION.md). Render it inside the river's area.
 */
export function Sheet(props: { title: string; onClose: () => void; children: ReactNode; testID?: string }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable
        testID="sheet-scrim"
        aria-label="Close"
        style={[StyleSheet.absoluteFill, styles.scrim]}
        onPress={props.onClose}
      />
      <View style={styles.sheet} testID={props.testID} role="dialog" aria-label={props.title}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title} role="heading">
            {props.title}
          </Text>
          <Pressable role="button" onPress={props.onClose} hitSlop={8} testID="sheet-done">
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {props.children}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: colors.scrim },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "85%",
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: "700" },
  done: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  body: { padding: spacing.md, gap: spacing.md },
});
