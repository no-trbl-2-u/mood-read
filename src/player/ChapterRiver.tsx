// The chapter river: every chapter of the book in one scrolling list, which is also the chapter list. A row shows
// its title; the playing row is expanded in place and marked with a heavy left rule and a play mark. The river
// carries no times: every time readout sits in the mini player (A28). The expanded row carries the inline mixer
// (01.5: balance, master volume, duck under voice; 01.7: the Layer chips) and the chapter edits (01.6, spec 01 A6):
// rename, merge with the next chapter, and split at the current position. Emotion chips, the mood card and lock
// marks join from 01.4.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from "react-native";

import { canMergeWithNext, canSplitAt } from "@/lib/chapters";
import type { Book } from "@/lib/types";
import { Icon } from "@/ui/Icon";
import { Button } from "@/ui/Button";
import { colors, hardShadow, radii, shadows, sizes, spacing, strokes, typography } from "@/ui/theme";

export function ChapterRiver(props: {
  book: Book;
  currentIndex: number | undefined;
  /** The playing position in the book, in seconds: where Split cuts. Never shown here (A28). */
  position: number;
  /** The inline mixer with its Layer chips, shown in the playing row; absent until the book is open in the player. */
  mixer?: ReactNode;
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
                <Text style={styles.title} numberOfLines={2}>
                  Ch.{c.index + 1} — {c.title}
                </Text>
                {playing && (
                  <View testID="playing-mark">
                    <Icon name="play" size="small" color={colors.accent} filled />
                  </View>
                )}
              </View>
            </Pressable>
            {playing && (
              <View style={styles.expanded} testID="chapter-expanded">
                {props.mixer}
                {props.edits && (
                  <ChapterEdits
                    key={`${c.index}:${c.title}`}
                    title={c.title}
                    canMerge={canMergeWithNext(props.book.chapters, c.index)}
                    canSplit={canSplitAt(props.book.chapters, props.position)}
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
        label="Split here"
        a11yLabel="Split this chapter at the current position"
        onPress={props.onSplit}
        disabled={!props.canSplit}
      />
    </View>
  );
}

function EditButton(props: { label: string; a11yLabel?: string; onPress: () => void; disabled?: boolean; testID: string }) {
  return (
    <Button
      testID={props.testID}
      kind="secondary"
      small
      label={props.label}
      a11yLabel={props.a11yLabel}
      disabled={props.disabled}
      onPress={props.onPress}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, paddingRight: spacing.md + shadows.card.offsetX, gap: spacing.sm },
  row: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: strokes.hairline,
    borderColor: colors.border,
    borderRadius: radii.lg,
  },
  rowPlaying: {
    paddingBottom: spacing.md,
    backgroundColor: colors.raised,
    borderLeftWidth: strokes.rule,
    borderLeftColor: colors.accent,
    boxShadow: hardShadow(shadows.card),
  },
  titleLine: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: sizes.touch },
  titleWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { ...typography.body, flexShrink: 1, fontWeight: typography.label.fontWeight },
  expanded: { marginTop: spacing.xs, gap: spacing.xs },
  editRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  input: {
    ...typography.body,
    flexGrow: 1,
    minWidth: sizes.inputMin,
    minHeight: sizes.touch,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderWidth: strokes.outline,
    borderColor: colors.edge,
    backgroundColor: colors.surface,
  },
});
