// The chapter river: every chapter of the book in one scrolling list, which is also the chapter list. A row shows
// its title; the playing row is expanded in place and marked with a heavy left rule and a play mark. The river
// carries no times: every time readout sits in the mini player (A28). The expanded row carries the inline mixer
// (01.5: balance, master volume, duck under voice; 01.7: the Layer chips) and the chapter edits (01.6, spec 01 A6):
// rename, merge with the next chapter, and split at the current position. 01.2 adds the dashed "Unscored" chip on a
// chapter scoring found too little written about. 01.4 adds the moods (spec 01 A16, A21): a reached, scored row
// shows its two strongest emotion chips; the playing row expands to the mood card (./MoodCard.tsx) above the mixer;
// a row not yet reached is muted with a lock mark and shows no chips of any kind, and never expands (its title
// still jumps there, which reaches it). 01.22 (A35): tapping a reached, non-playing row's chips opens the same mood
// card in place, without moving playback; one such row at a time, a second tap closes it, and a jump closes it.
// Since 07.2 the playing row carries a scene band; an opened row is not playing, so it shows the chapter-level card
// (its emotions and its piece) and no scene band.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from "react-native";

import { canMergeWithNext, canSplitAt } from "@/lib/chapters";
import { stickerLabel } from "@/lib/labels";
import { canPeek, EMOTION_NAMES, strongest, togglePeek, type MoodCardView } from "@/lib/mood-card";
import type { Book, PieceVerdict } from "@/lib/types";
import type { Verdict } from "@/lib/verdict-store";
import { Icon } from "@/ui/Icon";
import { Button } from "@/ui/Button";
import { pressStyle, useReduceMotion } from "@/ui/motion";
import { EmotionChips, MoodCard } from "./MoodCard";
import { colors, hardShadow, radii, shadows, sizes, spacing, strokes, typography } from "@/ui/theme";

export function ChapterRiver(props: {
  book: Book;
  currentIndex: number | undefined;
  /** The playing position in the book, in seconds: where Split cuts. Never shown here (A28). */
  position: number;
  /** The inline mixer with its Layer chips, shown in the playing row; absent until the book is open in the player. */
  mixer?: ReactNode;
  /**
   * What each chapter's row may show, by chapter index (src/lib/mood-card.ts moodCardView): locked until reached
   * (A21), the "Unscored" chip (A19), or its emotions and pieces (A16). A missing entry shows nothing.
   */
  moods?: readonly MoodCardView[];
  /** The listener picks an alternate, or Auto, for a chapter (A16). */
  onPick?: (index: number, pick: "auto" | string) => void;
  /** The book's kept verdicts (07.4, A5): the playing row lights the one on its playing piece. */
  verdicts?: readonly PieceVerdict[];
  /** The listener taps "Fits" or "Doesn't fit" on a chapter's playing piece (A5). */
  onVerdict?: (index: number, pieceId: string, tapped: Verdict) => void;
  /** Opens "Set the mood" for a chapter (07.6, A7), from its card when it is unscored or the listener's own seed. */
  onSetMood?: (index: number) => void;
  onJump: (index: number) => void;
  /** Chapter edits; absent until the book is open in the player. */
  edits?: ChapterEditsApi;
}) {
  const scroll = useRef<ScrollViewInstance>(null);
  const rowY = useRef<Record<number, number>>({});
  const scrolledTo = useRef<number | null>(null);
  // The one reached, non-playing row whose mood card is open from its chips (A35); never moves playback. It is kept
  // with the chapter playing when it opened, so any chapter change closes it.
  const [opened, setOpened] = useState<{ index: number | null; at: number | undefined }>({ index: null, at: undefined });

  // On opening a book, bring the playing row into view (layout Default); once per chapter change.
  const current = props.currentIndex;
  const peek = opened.at === current ? opened.index : null;
  const setPeek = (index: number | null) => setOpened({ index, at: current });
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
        const mood: MoodCardView = props.moods?.[c.index] ?? { kind: "none" };
        const locked = mood.kind === "locked";
        const label = `Ch.${c.index + 1} — ${c.title}`;
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
            {/* The "Unscored" chip sits beside the title's button, not in it, so the button's visible text stays
                inside its name (WCAG 2.5.3); the name still says it (06.5: what is seen is heard). */}
            <View style={styles.titleLine}>
              <Pressable
                testID={`chapter-${c.index}`}
                role="button"
                aria-label={`Play ${label}${locked ? COPY.notReached : ""}${mood.kind === "unscored" ? COPY.unscored : ""}`}
                onPress={() => props.onJump(c.index)}
                style={styles.titleWrap}
              >
                <Text style={[styles.title, locked && styles.titleLocked]}>{label}</Text>
                {locked && (
                  <View testID={`locked-${c.index}`}>
                    <Icon name="lock" size="small" color={colors.textMuted} />
                  </View>
                )}
                {playing && (
                  <View testID="playing-mark">
                    <Icon name="play" size="small" color={colors.accent} filled />
                  </View>
                )}
              </Pressable>
              {mood.kind === "unscored" && (
                <View style={styles.unscored} testID={`unscored-${c.index}`}>
                  <Text style={styles.unscoredText}>Unscored</Text>
                </View>
              )}
            </View>
            {canPeek(mood, playing) && mood.kind === "scored" && (
              <View style={styles.rowChips}>
                {peek === c.index ? (
                  <View testID="chapter-peek">
                    {/* Not playing: the chapter-level card (its emotions and its piece), never a playing-scene band. */}
                    <MoodCard
                      view={{ ...mood, scene: null }}
                      onPick={(pick) => props.onPick?.(c.index, pick)}
                      emotions={
                        <ChipsToggle index={c.index} label={label} view={mood} open onPress={() => setPeek(togglePeek(peek, c.index))}>
                          <EmotionChips emotions={mood.emotions} testID="mood-emotions" label={mood.listener ? COPY.yours : undefined} />
                        </ChipsToggle>
                      }
                    />
                  </View>
                ) : (
                  <ChipsToggle index={c.index} label={label} view={mood} open={false} onPress={() => setPeek(togglePeek(peek, c.index))}>
                    <EmotionChips
                      emotions={mood.emotions}
                      limit={2}
                      testID={`row-emotions-${c.index}`}
                      label={mood.listener ? COPY.yours : undefined}
                    />
                  </ChipsToggle>
                )}
              </View>
            )}
            {playing && !locked && (
              <View style={styles.expanded} testID="chapter-expanded">
                <MoodCard
                  view={mood}
                  onPick={(pick) => props.onPick?.(c.index, pick)}
                  verdict={
                    mood.kind === "scored" && mood.playing
                      ? (props.verdicts?.find((v) => v.chapterIndex === c.index && v.pieceId === mood.playing!.id)?.verdict ?? null)
                      : null
                  }
                  onVerdict={props.onVerdict ? (pieceId, tapped) => props.onVerdict!(c.index, pieceId, tapped) : undefined}
                  onSetMood={props.onSetMood ? () => props.onSetMood!(c.index) : undefined}
                />
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

const COPY = {
  notReached: ", not reached yet",
  /** A reached row's chips toggle: what it shows first (06.5: what is seen is heard), then what it opens. */
  moodCard: (chips: string, chapter: string) => `${chips}. Mood card for ${chapter}`,
  /** The row's visible "Unscored" chip, in its name too (06.5: what is seen is heard). */
  unscored: ", Unscored",
  /** A seeded row's chips (07.6): the listener's own mood, shown at once. */
  yours: "Your mood for this chapter",
};

/**
 * A reached, non-playing row's emotion chips as one control that opens or closes its mood card in place (A35). It
 * never jumps: the row's title does that. Announced as expanded or collapsed, never by colour alone.
 */
function ChipsToggle(props: {
  index: number;
  label: string;
  view: Extract<MoodCardView, { kind: "scored" }>;
  open: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const reduceMotion = useReduceMotion();
  const chips = strongest(props.view.emotions, props.open ? undefined : 2)
    .map((e) => stickerLabel(EMOTION_NAMES[e.emotion], e.intensity))
    .join(", ");
  return (
    <Pressable
      testID={`row-chips-${props.index}`}
      role="button"
      aria-label={COPY.moodCard(chips, props.label)}
      aria-expanded={props.open}
      onPress={props.onPress}
      style={({ pressed }) => [styles.chipsToggle, pressStyle(pressed, reduceMotion)]}
    >
      {props.children}
    </Pressable>
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
        a11yLabel="Split here, at the current position"
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
  titleWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: sizes.touch },
  title: { ...typography.body, flexShrink: 1, fontWeight: typography.label.fontWeight },
  titleLocked: { color: colors.textMuted },
  rowChips: { paddingBottom: spacing.sm },
  chipsToggle: { minHeight: sizes.touch, justifyContent: "center", alignSelf: "flex-start" },
  unscored: {
    marginLeft: "auto",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radii.pill,
    borderWidth: strokes.outline,
    borderStyle: "dashed",
    borderColor: colors.textMuted,
  },
  unscoredText: { ...typography.caption, fontWeight: typography.label.fontWeight },
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
