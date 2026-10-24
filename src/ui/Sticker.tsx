import { StyleSheet, Text, View } from "react-native";

import { stickerLabel } from "@/lib/labels";

import { colors, emotionHues, hardShadow, radii, shadows, spacing, strokes, tilts, typography, type Emotion } from "./theme";

/**
 * An emotion sticker (design/system/DECISION.md, Components): the emotion's hue as fill, its label in `onAccent`
 * (never colour alone), an `ink` outline, the `edge` hard shadow, and a tilt cycled by `index`. Tilt is shape, not
 * motion, so it stays under reduce motion. A scored sticker shows its intensity with its label ("Tension 80%"), and
 * a screen reader reads exactly that text, so what is seen and what is heard never differ (06.5); a decorative one
 * (the empty shelf's) is hidden from screen readers.
 */
export function Sticker(props: {
  emotion: Emotion;
  /** The emotion's name ("Tension"). */
  label: string;
  index: number;
  /** 0 to 1, once the chapter is scored. */
  intensity?: number;
  decorative?: boolean;
  testID?: string;
}) {
  const tilt = tilts[props.index % tilts.length];
  return (
    <View
      testID={props.testID}
      aria-hidden={props.decorative || undefined}
      style={[styles.sticker, { backgroundColor: emotionHues[props.emotion], transform: [{ rotate: `${tilt}deg` }] }]}
    >
      <Text style={styles.label}>{stickerLabel(props.label, props.intensity)}</Text>
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
