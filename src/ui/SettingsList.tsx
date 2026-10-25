import { Children, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "./Icon";
import { colors, opacities, radii, sizes, spacing, strokes, typography } from "./theme";

// The settings screen's parts (design/layouts/DECISION.md, Settings): grouped cards under section labels, rows
// 56 px or taller. Each row is one control with its own label and role, the whole row its touch target.

const NOT_YET = "Not available yet";

/** A section label and the card that groups its rows. */
export function SettingsSection(props: { label: string; children: ReactNode }) {
  return (
    <View>
      <Text style={styles.section} role="heading" aria-level={2}>
        {props.label}
      </Text>
      <View style={styles.group}>
        {Children.toArray(props.children).map((child, i) => (
          <View key={i} style={i > 0 && styles.divided}>
            {child}
          </View>
        ))}
      </View>
    </View>
  );
}

/** A row that is a switch: on or off, saved as it changes. */
export function SwitchRow(props: {
  title: string;
  caption?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={props.testID}
      role="switch"
      aria-checked={props.value}
      aria-label={props.title}
      accessibilityHint={props.caption}
      onPress={() => props.onChange(!props.value)}
      style={styles.row}
    >
      <View style={styles.text}>
        <Text style={styles.title}>{props.title}</Text>
        {props.caption && <Text style={styles.caption}>{props.caption}</Text>}
      </View>
      <View style={[styles.track, props.value && styles.trackOn]}>
        <View style={[styles.knob, props.value && styles.knobOn]} />
      </View>
    </Pressable>
  );
}

/** A row that opens another screen (or, with `expanded`, opens in place). */
export function LinkRow(props: {
  title: string;
  caption?: string;
  value?: string;
  onPress: () => void;
  expanded?: boolean;
  testID?: string;
}) {
  const inPlace = props.expanded !== undefined;
  return (
    <Pressable
      testID={props.testID}
      role={inPlace ? "button" : "link"}
      aria-expanded={props.expanded}
      onPress={props.onPress}
      style={styles.row}
    >
      <View style={styles.text}>
        <Text style={styles.title}>{props.title}</Text>
        {props.caption && <Text style={styles.caption}>{props.caption}</Text>}
      </View>
      {props.value && <Text style={styles.value}>{props.value}</Text>}
      <Icon name={props.expanded ? "chevron-down" : "chevron-right"} size="small" color={colors.textMuted} />
    </Pressable>
  );
}

/** A row that does something in place when pressed; its caption can report how that went. */
export function ActionRow(props: { title: string; caption?: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable testID={props.testID} role="button" aria-label={props.title} onPress={props.onPress} style={styles.row}>
      <View style={styles.text}>
        <Text style={styles.title}>{props.title}</Text>
        {props.caption && (
          <Text style={styles.caption} aria-live="polite">
            {props.caption}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

/** A row for something that has not shipped yet: shown, dimmed, read as its two words, and not a control. */
export function UnavailableRow(props: { title: string; testID?: string }) {
  return (
    <View
      testID={props.testID}
      aria-disabled
      style={[styles.row, styles.disabled]}
    >
      <View style={styles.text}>
        <Text style={styles.title}>{props.title}</Text>
      </View>
      <Text style={styles.value}>{NOT_YET}</Text>
    </View>
  );
}

/** A row that only tells: a title, its caption lines and, optionally, controls of its own beside or under them. */
export function InfoRow(props: { title: string; captions?: (string | null | undefined)[]; testID?: string; children?: ReactNode }) {
  return (
    <View testID={props.testID} style={styles.row}>
      <View style={styles.text}>
        <Text style={styles.title}>{props.title}</Text>
        {props.captions?.map((c, i) => c && <Text key={i} style={styles.caption}>{c}</Text>)}
      </View>
      {props.children}
    </View>
  );
}

/** The space under a row that opened in place. */
export function RowDrawer(props: { children: ReactNode }) {
  return <View style={styles.drawer}>{props.children}</View>;
}

const styles = StyleSheet.create({
  section: {
    ...typography.caption,
    fontWeight: typography.label.fontWeight,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  group: {
    backgroundColor: colors.surface,
    borderWidth: strokes.hairline,
    borderColor: colors.border,
    borderRadius: radii.lg,
    overflow: "hidden",
  },
  row: {
    minHeight: sizes.settingRow,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  divided: { borderTopWidth: strokes.hairline, borderTopColor: colors.border },
  disabled: { opacity: opacities.disabled },
  text: { flex: 1, minWidth: 0, gap: spacing.xxs },
  title: { ...typography.label, fontSize: typography.body.fontSize },
  caption: typography.caption,
  value: { ...typography.caption, fontSize: typography.label.fontSize },
  track: {
    width: sizes.switchWidth,
    height: sizes.switchHeight,
    borderRadius: radii.pill,
    borderWidth: strokes.outline,
    borderColor: colors.edge,
    backgroundColor: colors.background,
    justifyContent: "center",
    paddingHorizontal: spacing.xxs,
  },
  trackOn: { backgroundColor: colors.accent, alignItems: "flex-end" },
  knob: { width: sizes.switchKnob, height: sizes.switchKnob, borderRadius: radii.pill, backgroundColor: colors.textMuted },
  knobOn: { backgroundColor: colors.onAccent },
  drawer: { paddingBottom: spacing.md },
});
