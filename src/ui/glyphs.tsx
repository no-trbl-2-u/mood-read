// Small glyphs drawn with views, so no icon font or emoji is needed: play, pause, chevrons, a plus, "More".
// Lucide replaces them in 06.4.
import { StyleSheet, View } from "react-native";

import { sizes, spacing, strokes } from "./theme";

export function PlayGlyph({ size, color }: { size: number; color: string }) {
  return (
    <View
      style={{
        width: 0,
        height: 0,
        borderLeftWidth: size,
        borderLeftColor: color,
        borderTopWidth: size * 0.6,
        borderTopColor: "transparent",
        borderBottomWidth: size * 0.6,
        borderBottomColor: "transparent",
      }}
    />
  );
}

export function PauseGlyph({ size, color }: { size: number; color: string }) {
  const bar = { width: size * 0.32, height: size * 1.2, backgroundColor: color, borderRadius: 1 };
  return (
    <View style={[styles.row, { gap: size * 0.3 }]}>
      <View style={bar} />
      <View style={bar} />
    </View>
  );
}

export function BackChevron({ size, color }: { size: number; color: string }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderLeftWidth: 2,
        borderBottomWidth: 2,
        borderColor: color,
        transform: [{ rotate: "45deg" }],
      }}
    />
  );
}

export function PlusGlyph({ size, color }: { size: number; color: string }) {
  const t = Math.max(2, Math.round(size / 8));
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={{ position: "absolute", width: size, height: t, backgroundColor: color }} />
      <View style={{ position: "absolute", width: t, height: size, backgroundColor: color }} />
    </View>
  );
}

/** A chevron pointing right (a row that pushes a screen) or down (a row that is open). */
export function Chevron({ size, color, open = false }: { size: number; color: string; open?: boolean }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRightWidth: strokes.outline,
        borderBottomWidth: strokes.outline,
        borderColor: color,
        transform: [{ rotate: open ? "45deg" : "-45deg" }],
      }}
    />
  );
}

/** Three stacked dots: the overflow ("More") button. */
export function MoreGlyph({ color }: { color: string }) {
  const dot = { width: sizes.dot, height: sizes.dot, borderRadius: sizes.dot, backgroundColor: color };
  return (
    <View style={{ gap: spacing.xs, alignItems: "center" }}>
      <View style={dot} />
      <View style={dot} />
      <View style={dot} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
});
