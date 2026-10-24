import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, type IconName } from "./Icon";
import { colors, radii, sizes, spacing, strokes, typography } from "./theme";

/**
 * A screen's top bar: an optional back control (Lucide `chevron-left` and the parent's title, or the chevron alone
 * where the title line is full, as on the river), the title, and optional trailing actions.
 */
export function TopBar(props: {
  /** Empty on a page whose own heading already names what it shows (design/layouts/DECISION.md, "A LibriVox
   *  book"): the bar then draws only the back control and any trailing actions. */
  title: string;
  /** The library's title is the big `title` type; every other screen's is `heading`. */
  large?: boolean;
  back?: { label: string; a11yLabel?: string; iconOnly?: boolean; onPress: () => void };
  trailing?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top }]}>
      <View style={styles.inner}>
        {props.back && (
          <Pressable
            testID="top-back"
            role="button"
            aria-label={props.back.a11yLabel ?? props.back.label}
            onPress={props.back.onPress}
            style={styles.back}
          >
            <Icon name="back" />
            {!props.back.iconOnly && <Text style={styles.backText}>{props.back.label}</Text>}
          </Pressable>
        )}
        {props.title ? (
          <Text style={[styles.title, props.large && styles.titleLarge]} role="heading">
            {props.title}
          </Text>
        ) : (
          <View style={styles.title} />
        )}
        {props.trailing && <View style={styles.trailing}>{props.trailing}</View>}
      </View>
    </View>
  );
}

/** A trailing action: an icon button (the label is then its screen-reader name) or a short text button. */
export function TopBarButton(props: {
  label: string;
  icon?: IconName;
  a11yLabel?: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={props.testID}
      role="button"
      aria-label={props.a11yLabel ?? props.label}
      onPress={props.onPress}
      style={styles.action}
    >
      {props.icon ? <Icon name={props.icon} /> : <Text style={styles.actionText}>{props.label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.background, borderBottomWidth: strokes.hairline, borderBottomColor: colors.border },
  inner: {
    minHeight: sizes.topBar,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  back: {
    minHeight: sizes.touch,
    minWidth: sizes.touch,
    marginLeft: -spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  backText: typography.body,
  title: { ...typography.heading, flex: 1, minWidth: 0 },
  titleLarge: typography.title,
  trailing: { flexDirection: "row", alignItems: "center", gap: spacing.xxs, marginRight: -spacing.sm },
  action: {
    minHeight: sizes.touch,
    minWidth: sizes.touch,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
  },
  actionText: typography.label,
});
