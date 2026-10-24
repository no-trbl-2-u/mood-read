import { Pressable, StyleSheet, Text } from "react-native";

import { colors, radii, sizes, spacing } from "./theme";

/** A selectable chip: speed presets, sleep timer choices, the mixer's duck, the default soundscape. */
export function Chip(props: { label: string; a11yLabel?: string; on: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      testID={props.testID}
      role="button"
      aria-label={props.a11yLabel}
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
    minHeight: sizes.touch,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  text: { color: colors.text, fontSize: 14 },
  textOn: { color: colors.onAccent, fontWeight: "700" },
});
