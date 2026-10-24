import { StyleSheet, Text, View } from "react-native";

import { colors, emotionHues, hardShadow, radii, shadows, spacing, strokes, tilts, typography, type Emotion } from "./theme";

/**
 * An emotion sticker (design/system/DECISION.md, Components): the emotion's hue as fill, its label in `onAccent`
 * (never colour alone), an `ink` outline, the `edge` hard shadow, and a tilt cycled by `index`. Tilt is shape, not
 * motion, so it stays under reduce motion.
 */
export function Sticker(props: { emotion: Emotion; label: string; index: number; decorative?: boolean }) {
  const tilt = tilts[props.index % tilts.length];
  return (
    <View
      aria-hidden={props.decorative || undefined}
      style={[styles.sticker, { backgroundColor: emotionHues[props.emotion], transform: [{ rotate: `${tilt}deg` }] }]}
    >
      <Text style={styles.label}>{props.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sticker: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: strokes.outline,
    borderColor: colors.ink,
    boxShadow: hardShadow(shadows.chip),
  },
  label: { ...typography.label, color: colors.onAccent },
});
