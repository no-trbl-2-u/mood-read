// Small glyphs drawn with views, so no icon font or emoji is needed: play, pause, a back chevron, a plus.
import { StyleSheet, View } from "react-native";

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

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
});
