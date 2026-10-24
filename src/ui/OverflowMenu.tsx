import { useRef, useState, type ComponentRef } from "react";
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { Icon, type IconName } from "./Icon";
import { colors, hardShadow, radii, shadows, sizes, spacing, strokes, typography } from "./theme";

export type MenuItem = { key: string; label: string; icon?: IconName; onPress: () => void; ruleBefore?: boolean };

type Anchor = { top: number; right: number };

/**
 * A top bar's overflow button ("More") and the popover it opens (design/layouts/DECISION.md, Navigation, v2):
 * anchored under the button, right-aligned, no handle and no scrim. A tap outside, the back gesture or Escape
 * closes it.
 */
export function OverflowMenu(props: {
  items: MenuItem[];
  label?: string;
  testID?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const button = useRef<ComponentRef<typeof Pressable>>(null);
  const { width } = useWindowDimensions();
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const setOpen = (next: Anchor | null) => {
    setAnchor(next);
    props.onOpenChange?.(next !== null);
  };
  const open = () =>
    button.current?.measureInWindow((x, y, w, h) => setOpen({ top: y + h + spacing.xs, right: width - (x + w) }));
  const close = () => setOpen(null);

  return (
    <>
      <Pressable
        ref={button}
        testID={props.testID}
        role="button"
        aria-label={props.label ?? "More"}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        onPress={open}
        style={styles.button}
      >
        <Icon name="more" />
      </Pressable>
      <Modal transparent visible={anchor !== null} onRequestClose={close} animationType="none">
        <Pressable role="button" style={StyleSheet.absoluteFill} onPress={close} aria-label="Close menu" />
        {anchor && (
          <View role="menu" style={[styles.menu, { top: anchor.top, right: anchor.right }]}>
            {props.items.map((item) => (
              <View key={item.key}>
                {item.ruleBefore && <View style={styles.rule} />}
                <Pressable
                  testID={`menu-${item.key}`}
                  role="menuitem"
                  aria-label={item.label}
                  style={styles.item}
                  onPress={() => {
                    close();
                    item.onPress();
                  }}
                >
                  {item.icon && <Icon name={item.icon} />}
                  <Text style={styles.itemText}>{item.label}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: sizes.menuRow,
    minHeight: sizes.menuRow,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
  },
  menu: {
    position: "absolute",
    width: sizes.menuWidth,
    padding: spacing.xs,
    backgroundColor: colors.raised,
    borderWidth: strokes.outline,
    borderColor: colors.edge,
    borderRadius: radii.lg,
    boxShadow: hardShadow(shadows.card),
  },
  item: {
    minHeight: sizes.menuRow,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  itemText: { ...typography.label, fontSize: typography.body.fontSize },
  rule: { borderTopWidth: strokes.hairline, borderTopColor: colors.border, marginVertical: spacing.xs, marginHorizontal: spacing.sm },
});
