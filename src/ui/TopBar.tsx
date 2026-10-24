import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, type IconName } from "./Icon";
import { colors, spacing } from "./theme";

/**
 * A screen's top bar: an optional back control (Lucide `chevron-left` and the parent's title, or the chevron alone
 * where the title line is full, as on the river), the title, and optional trailing actions.
 */
export function TopBar(props: {
  title: string;
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
            hitSlop={8}
          >
            <Icon name="back" />
            {!props.back.iconOnly && <Text style={styles.backText}>{props.back.label}</Text>}
          </Pressable>
        )}
        <Text style={styles.title} numberOfLines={1} role="heading">
          {props.title}
        </Text>
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
      hitSlop={6}
    >
      {props.icon ? <Icon name={props.icon} /> : <Text style={styles.actionText}>{props.label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border },
  inner: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md },
  back: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingVertical: spacing.sm, paddingLeft: 2 },
  backText: { color: colors.text, fontSize: 15 },
  title: { flex: 1, color: colors.text, fontSize: 17, fontWeight: "700" },
  trailing: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  action: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: spacing.sm + 2,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionText: { color: colors.text, fontSize: 14, fontWeight: "600" },
});
