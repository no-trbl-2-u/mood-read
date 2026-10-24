import { Pressable, StyleSheet, Text } from "react-native";

import { Icon, type IconName } from "./Icon";
import { pressStyle, useReduceMotion } from "./motion";
import { colors, hardShadow, opacities, radii, shadows, sizes, spacing, strokes, typography } from "./theme";

/**
 * A sticker button (design/system/DECISION.md, Components). Primary: `accent` fill, `ink` outline, the `pop` hard
 * shadow. Secondary: no fill, an `edge` outline. Danger: the confirming destructive action, `danger` fill. Pill
 * shaped, never tilted, at least 44 px tall.
 */
export function Button(props: {
  label: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "danger";
  icon?: IconName;
  /** The 44 px size for rows and bands; 48 px otherwise. */
  small?: boolean;
  disabled?: boolean;
  role?: "button" | "link";
  a11yLabel?: string;
  expanded?: boolean;
  testID?: string;
}) {
  const reduceMotion = useReduceMotion();
  const kind = props.kind ?? "primary";
  const filled = kind !== "secondary";
  const ink = filled ? colors.onAccent : colors.text;
  return (
    <Pressable
      testID={props.testID}
      role={props.role ?? "button"}
      aria-label={props.a11yLabel ?? props.label}
      aria-disabled={props.disabled || undefined}
      aria-expanded={props.expanded}
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.button,
        props.small && styles.small,
        styles[kind],
        props.disabled && styles.disabled,
        pressStyle(pressed, reduceMotion),
      ]}
    >
      {props.icon && <Icon name={props.icon} size="small" color={ink} />}
      <Text style={[styles.label, { color: ink }]}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: sizes.button,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: strokes.heavy,
  },
  small: { minHeight: sizes.touch, paddingHorizontal: spacing.md },
  primary: { backgroundColor: colors.accent, borderColor: colors.ink, boxShadow: hardShadow(shadows.button) },
  secondary: { backgroundColor: colors.transparent, borderColor: colors.edge },
  danger: { backgroundColor: colors.danger, borderColor: colors.ink, boxShadow: hardShadow(shadows.button) },
  disabled: { opacity: opacities.disabled },
  label: typography.label,
});
