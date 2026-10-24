import { useRef, useState, type ComponentRef } from "react";
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { colors, hardShadow, radii, shadows, sizes, spacing, strokes, typography } from "./theme";

/**
 * An item that asks first (Delete book, Rescore): pressing it grows a short question and two buttons under it, in
 * the menu (design/layouts/DECISION.md, Navigation, v2: never a dialog or a sheet). Only the confirm runs `onPress`.
 */
export type MenuConfirm = { question: string; detail?: string; confirm: string; cancel: string; danger?: boolean };

export type MenuItem = {
  key: string;
  label: string;
  /** A muted line under the label ("Reads every chapter's mood again."). */
  caption?: string;
  icon?: IconName;
  onPress: () => void;
  ruleBefore?: boolean;
  confirm?: MenuConfirm;
};

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
  const [asking, setAsking] = useState<string | null>(null);

  const setOpen = (next: Anchor | null) => {
    setAnchor(next);
    setAsking(null);
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
                  aria-label={item.caption ? undefined : item.label}
                  aria-expanded={item.confirm ? asking === item.key : undefined}
                  style={styles.item}
                  onPress={() => {
                    if (item.confirm) return setAsking(asking === item.key ? null : item.key);
                    close();
                    item.onPress();
                  }}
                >
                  {item.icon && <Icon name={item.icon} />}
                  <View style={styles.itemText}>
                    <Text style={styles.itemLabel}>{item.label}</Text>
                    {item.caption && <Text style={typography.caption}>{item.caption}</Text>}
                  </View>
                </Pressable>
                {item.confirm && asking === item.key && (
                  <View role="group" aria-label={item.confirm.question} style={styles.confirm} testID={`menu-${item.key}-confirm`}>
                    <Text style={typography.label}>{item.confirm.question}</Text>
                    {item.confirm.detail && <Text style={typography.caption}>{item.confirm.detail}</Text>}
                    <View style={styles.confirmButtons}>
                      <Button
                        small
                        kind={item.confirm.danger ? "danger" : "primary"}
                        label={item.confirm.confirm}
                        role="menuitem"
                        testID={`menu-${item.key}-yes`}
                        onPress={() => {
                          close();
                          item.onPress();
                        }}
                      />
                      <Button
                        small
                        kind="secondary"
                        role="menuitem"
                        label={item.confirm.cancel}
                        testID={`menu-${item.key}-no`}
                        onPress={close}
                      />
                    </View>
                  </View>
                )}
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
  itemText: { flex: 1, gap: spacing.xxs, paddingVertical: spacing.sm },
  itemLabel: { ...typography.label, fontSize: typography.body.fontSize },
  confirm: { gap: spacing.xs, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  confirmButtons: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingTop: spacing.xs },
  rule: { borderTopWidth: strokes.hairline, borderTopColor: colors.border, marginVertical: spacing.xs, marginHorizontal: spacing.sm },
});
