// The mixer's Layer (01.7; design/layouts/DECISION.md "Mixer (inline, in the expanded row)"): chips for Off and each
// bundled soundscape in one horizontally scrolling row, inline in the playing row, never a sheet. A pick sets the
// book's soundscape, which every chapter plays; "This chapter only" gives the playing chapter its own, so picks then
// apply to it alone (A12). Saved with the book's mix.
import { ScrollView, StyleSheet, Text, View } from "react-native";

import type { LayerPick } from "@/lib/bed";
import { Chip } from "@/ui/Chip";
import { spacing, typography } from "@/ui/theme";

import { SOUNDSCAPES } from "./soundscapes";

const COPY = {
  layer: "Layer",
  off: "Off",
  chapterOnly: "This chapter only",
  chapterOnlyA11y: "Layer for this chapter only",
};

export function LayerPicker(props: {
  /** The chip that is on, or null for none (the music layer, 01.10). */
  pick: LayerPick | null;
  /** True when the playing chapter has its own layer. */
  chapterOnly: boolean;
  onPick: (pick: LayerPick) => void;
  onChapterOnly: (on: boolean) => void;
}) {
  const name = props.pick === "off" ? COPY.off : (SOUNDSCAPES.find((s) => s.id === props.pick)?.name ?? COPY.off);
  const chips: { id: LayerPick; label: string }[] = [
    { id: "off", label: COPY.off },
    ...SOUNDSCAPES.map((s) => ({ id: s.id, label: s.name })),
  ];
  return (
    <View style={styles.layer} testID="layer-line" role="group" aria-label={COPY.layer}>
      <View style={styles.captionRow}>
        <Text style={styles.label}>{COPY.layer}</Text>
        <Text style={styles.value} testID="layer-sound">
          {name}
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="layer-chips" contentContainerStyle={styles.chips}>
        {chips.map((c) => (
          <Chip
            key={c.id}
            testID={`layer-chip-${c.id}`}
            label={c.label}
            a11yLabel={`${COPY.layer}: ${c.label}`}
            on={props.pick === c.id}
            onPress={() => props.onPick(c.id)}
          />
        ))}
      </ScrollView>
      <View style={styles.chapterRow}>
        <Chip
          testID="layer-chapter-only"
          label={COPY.chapterOnly}
          a11yLabel={COPY.chapterOnlyA11y}
          on={props.chapterOnly}
          onPress={() => props.onChapterOnly(!props.chapterOnly)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { gap: spacing.xs },
  captionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  label: typography.label,
  value: typography.caption,
  chips: { flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.xxs, paddingRight: spacing.xs },
  chapterRow: { flexDirection: "row" },
});
