import { StyleSheet, Text, View } from "react-native";

import { colors, hardShadow, radii, shadows, spacing, strokes, typography } from "./theme";

/**
 * The "Scored" state chip (design/layouts/DECISION.md, the library row and Browse, 05.10): `accent` fill, `onAccent`
 * label, `ink` outline and the small chip shadow. A status, never a control, so it is not pressable and never tilted.
 * The words come from the screen that shows it.
 */
export function ScoredChip(props: { label: string; testID?: string }) {
  return (
    <View testID={props.testID} style={styles.chip}>
      <Text style={styles.label}>{props.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: strokes.outline,
    borderColor: colors.ink,
    backgroundColor: colors.accent,
    boxShadow: hardShadow(shadows.chip),
  },
  label: { ...typography.label, color: colors.onAccent },
});
