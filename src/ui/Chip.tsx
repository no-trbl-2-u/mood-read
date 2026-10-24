import { Pressable, StyleSheet, Text } from "react-native";

import { pressStyle, useReduceMotion } from "./motion";
import { colors, hardShadow, radii, shadows, sizes, spacing, strokes, typography } from "./theme";

/**
 * A selectable chip: speed presets, sleep timer choices, the mixer's duck and layer, the default soundscape
 * (design/system/DECISION.md, Components). Off: `surface` fill, `edge` outline. On: the `accent` sticker, `ink`
 * outline and the chip's hard shadow, and announced as pressed, never colour alone. Status, so never tilted.
 */
export function Chip(props: { label: string; a11yLabel?: string; on: boolean; onPress: () => void; testID?: string }) {
  const reduceMotion = useReduceMotion();
  return (
    <Pressable
      testID={props.testID}
      role="button"
      aria-label={props.a11yLabel}
      aria-pressed={props.on}
      onPress={props.onPress}
      style={({ pressed }) => [styles.chip, props.on && styles.chipOn, pressStyle(pressed, reduceMotion)]}
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
    borderWidth: strokes.outline,
    borderColor: colors.edge,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.ink, boxShadow: hardShadow(shadows.chip) },
  text: typography.label,
  textOn: { color: colors.onAccent },
});
