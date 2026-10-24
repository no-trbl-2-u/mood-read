import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, radii, sizes, spacing, strokes, typography } from "./theme";

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
          <Pressable role="button" onPress={props.onClose} hitSlop={spacing.sm} testID="sheet-done" style={styles.doneHit}>
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
    borderTopWidth: strokes.outline,
    borderColor: colors.edge,
  },
  handle: {
    alignSelf: "center",
    width: sizes.handleWidth,
    height: sizes.handleHeight,
    borderRadius: radii.pill,
    backgroundColor: colors.textMuted,
    marginTop: spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  title: typography.heading,
  doneHit: { minHeight: sizes.touch, justifyContent: "center", paddingHorizontal: spacing.xs },
  done: { ...typography.label, color: colors.accent },
  body: { padding: spacing.md, gap: spacing.md },
});
