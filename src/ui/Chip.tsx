import { Pressable, StyleSheet, Text } from "react-native";

import { colors, spacing } from "./theme";

/** A selectable chip: speed presets, sleep timer choices. */
export function Chip(props: { label: string; on: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      testID={props.testID}
      role="button"
      aria-pressed={props.on}
      onPress={props.onPress}
      style={[styles.chip, props.on && styles.chipOn]}
    >
      <Text style={[styles.text, props.on && styles.textOn]}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  text: { color: colors.text, fontSize: 14 },
  textOn: { color: colors.onAccent, fontWeight: "700" },
});
