// The chapter river: every chapter of the book in one scrolling list, which is also the chapter list. In 01.1 a
// row shows its title and duration; the playing row is expanded in place and marked with a heavy left rule and a
// play mark. The expanded row carries the bed's "Layer" line, its soundscape for this chapter (01.3), and the
// chapter edits (01.6, spec 01 A6): rename, merge with the next chapter, and split at the current position. Emotion
// chips, the mood card, the mixer and lock marks join from 01.4, 01.5 and 01.7.
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from "react-native";

import { canMergeWithNext, canSplitAt } from "@/lib/chapters";
import { formatDuration } from "@/lib/format-duration";
import type { Book, SleepTimer } from "@/lib/types";
import { PlayGlyph } from "@/ui/glyphs";
import { colors, spacing } from "@/ui/theme";

export function ChapterRiver(props: {
  book: Book;
  currentIndex: number | undefined;
  position: number;
  sleep: SleepTimer | null;
  /** The bed's sound for the playing chapter, by name; null when the layer is off. */
  layer: string | null;
  onJump: (index: number) => void;
  /** Chapter edits; absent until the book is open in the player. */
  edits?: ChapterEditsApi;
}) {
  const scroll = useRef<ScrollViewInstance>(null);
  const rowY = useRef<Record<number, number>>({});
  const scrolledTo = useRef<number | null>(null);

  // On opening a book, bring the playing row into view (layout Default); once per chapter change.
  const current = props.currentIndex;
  useEffect(() => {
    if (current === undefined || scrolledTo.current === current) return;
    const y = rowY.current[current];
    if (y === undefined) return;
    scrolledTo.current = current;
    scroll.current?.scrollTo({ y: Math.max(0, y - spacing.xl), animated: false });
  }, [current]);

  return (
    <ScrollView ref={scroll} testID="chapter-river" contentContainerStyle={styles.content}>
      {props.book.chapters.map((c) => {
        const playing = c.index === current;
        const length = c.end - c.start;
        return (
          <View
            key={c.index}
            testID={`chapter-row-${c.index}`}
            aria-current={playing ? "true" : undefined}
            style={[styles.row, playing && styles.rowPlaying]}
            onLayout={(e) => {
              rowY.current[c.index] = e.nativeEvent.layout.y;
              if (playing && scrolledTo.current !== c.index) {
                scrolledTo.current = c.index;
                scroll.current?.scrollTo({ y: Math.max(0, e.nativeEvent.layout.y - spacing.xl), animated: false });
              }
            }}
          >
            <Pressable
              testID={`chapter-${c.index}`}
              role="button"
              aria-label={`Play chapter ${c.index + 1}, ${c.title}`}
              onPress={() => props.onJump(c.index)}
              style={styles.titleLine}
            >
              <View style={styles.titleWrap}>
                <Text style={[styles.title, playing && styles.titlePlaying]} numberOfLines={2}>
                  Ch.{c.index + 1} — {c.title}
                </Text>
                {playing && (
                  <View style={styles.mark} testID="playing-mark">
                    <PlayGlyph size={8} color={colors.accent} />
                  </View>
                )}
              </View>
              <Text style={styles.duration}>{formatDuration(length)}</Text>
            </Pressable>
            {playing && (
              <View style={styles.expanded} testID="chapter-expanded">
                <Text style={styles.muted} testID="chapter-elapsed">
                  {formatDuration(props.position - c.start)} of {formatDuration(length)}
                </Text>
                {props.sleep?.kind === "chapterEnd" && props.sleep.chapterIndex === c.index && (
                  <Text style={styles.muted}>Sleep timer: stops at the end of this chapter.</Text>
                )}
                <View style={styles.layerLine} testID="layer-line">
                  <Text style={styles.label}>Layer</Text>
                  <Text style={styles.layerChip} testID="layer-sound">
                    {props.layer ?? "Off"}
                  </Text>
                </View>
                {props.edits && (
                  <ChapterEdits
                    key={`${c.index}:${c.title}`}
                    title={c.title}
                    canMerge={canMergeWithNext(props.book.chapters, c.index)}
                    canSplit={canSplitAt(props.book.chapters, props.position)}
                    splitLabel={formatDuration(props.position - c.start)}
                    onRename={(t) => props.edits!.rename(c.index, t)}
                    onMerge={() => props.edits!.mergeWithNext(c.index)}
                    onSplit={() => props.edits!.splitAt(props.position)}
                  />
                )}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

export type ChapterEditsApi = {
  rename: (index: number, title: string) => void;
  mergeWithNext: (index: number) => void;
  splitAt: (position: number) => void;
};

/** Rename (an inline field), Merge with next, and Split here, under the playing chapter. */
function ChapterEdits(props: {
  title: string;
  canMerge: boolean;
  canSplit: boolean;
  splitLabel: string;
  onRename: (title: string) => void;
  onMerge: () => void;
  onSplit: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft !== null) {
    const save = () => {
      props.onRename(draft);
      setDraft(null);
    };
    return (
      <View style={styles.editRow}>
        <TextInput
          testID="chapter-title-input"
          aria-label="Chapter title"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={save}
          autoFocus
          style={styles.input}
          placeholderTextColor={colors.textMuted}
        />
        <EditButton testID="chapter-rename-save" label="Save" onPress={save} disabled={!draft.trim()} />
        <EditButton testID="chapter-rename-cancel" label="Cancel" onPress={() => setDraft(null)} />
      </View>
    );
  }
  return (
    <View style={styles.editRow}>
      <EditButton testID="chapter-rename" label="Rename" onPress={() => setDraft(props.title)} />
      <EditButton testID="chapter-merge" label="Merge with next" onPress={props.onMerge} disabled={!props.canMerge} />
      <EditButton
        testID="chapter-split"
        label={`Split at ${props.splitLabel}`}
        a11yLabel="Split this chapter at the current position"
        onPress={props.onSplit}
        disabled={!props.canSplit}
      />
    </View>
  );
}

function EditButton(props: { label: string; a11yLabel?: string; onPress: () => void; disabled?: boolean; testID: string }) {
  return (
    <Pressable
      testID={props.testID}
      role="button"
      aria-label={props.a11yLabel ?? props.label}
      aria-disabled={props.disabled || undefined}
      disabled={props.disabled}
      onPress={props.onPress}
      style={[styles.editButton, props.disabled && styles.disabled]}
    >
      <Text style={styles.editText}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xl },
  row: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: "transparent",
  },
  rowPlaying: { backgroundColor: colors.surface, borderLeftColor: colors.accent },
  titleLine: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 32 },
  titleWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { flexShrink: 1, color: colors.text, fontSize: 15 },
  titlePlaying: { fontWeight: "700" },
  mark: { paddingTop: 1 },
  duration: { color: colors.textMuted, fontSize: 13, fontVariant: ["tabular-nums"] },
  expanded: { marginTop: spacing.sm, gap: spacing.xs },
  muted: { color: colors.textMuted, fontSize: 13 },
  layerLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  label: { color: colors.textMuted, fontSize: 13 },
  layerChip: {
    color: colors.text,
    fontSize: 13,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  editRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  editButton: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: spacing.sm + 2,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  editText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  disabled: { opacity: 0.4 },
  input: {
    flexGrow: 1,
    minWidth: 160,
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 15,
  },
});
