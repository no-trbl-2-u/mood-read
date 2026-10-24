import { StyleSheet, Text, View } from "react-native";

import { colors, emotionHues, hardShadow, radii, shadows, spacing, strokes, tilts, typography, type Emotion } from "./theme";

/**
 * An emotion sticker (design/system/DECISION.md, Components): the emotion's hue as fill, its label in `onAccent`
 * (never colour alone), an `ink` outline, the `edge` hard shadow, and a tilt cycled by `index`. Tilt is shape, not
 * motion, so it stays under reduce motion.
 */
export function Sticker(props: {
  emotion: Emotion;
  label: string;
  index: number;
  decorative?: boolean;
  /** What a screen reader says, when it differs from the label ("Tension, 80 percent" for "Tension 80%"). */
  a11yLabel?: string;
  testID?: string;
}) {
  const tilt = tilts[props.index % tilts.length];
  return (
    <View
      testID={props.testID}
      aria-hidden={props.decorative || undefined}
      role={props.a11yLabel && !props.decorative ? "img" : undefined}
      aria-label={props.decorative ? undefined : props.a11yLabel}
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
