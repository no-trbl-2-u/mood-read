import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "@/ui/Icon";
import { colors, radii, sizes, spacing, strokes, typography } from "@/ui/theme";

/**
 * A one-time notice that rises in the screen's flow, above the mini player (07.5: the first "Fits" tap says what is
 * shared). It is announced politely (role status) and stays until its dismiss button (44 px, labelled) is pressed,
 * so nobody has to read it against a clock. It takes space rather than covering anything. The copy is the screen's.
 */
export function Toast(props: { text: string; dismissLabel: string; onDismiss: () => void; testID?: string }) {
  return (
    <View style={styles.toast} role="status" aria-live="polite" testID={props.testID}>
      <Icon name="shield-check" size="small" />
      <Text style={styles.text}>{props.text}</Text>
      <Pressable
        testID={props.testID ? `${props.testID}-dismiss` : undefined}
        role="button"
        aria-label={props.dismissLabel}
        onPress={props.onDismiss}
        style={styles.dismiss}
      >
        <Icon name="x" size="small" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingLeft: spacing.sm,
    backgroundColor: colors.raised,
    borderWidth: strokes.outline,
    borderColor: colors.edge,
    borderRadius: radii.md,
  },
  text: { ...typography.label, flex: 1, paddingVertical: spacing.xs },
  dismiss: { minWidth: sizes.touch, minHeight: sizes.touch, alignItems: "center", justifyContent: "center" },
});
