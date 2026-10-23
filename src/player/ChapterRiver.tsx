// The chapter river: every chapter of the book in one scrolling list, which is also the chapter list. In 01.1 a
// row shows its title and duration; the playing row is expanded in place and marked with a heavy left rule and a
// play mark. Emotion chips, the mood card, the mixer and lock marks join from 01.3, 01.4, 01.5 and 01.7.
import { useEffect, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from "react-native";

import { formatDuration } from "@/lib/format-duration";
import type { Book, SleepTimer } from "@/lib/types";
import { PlayGlyph } from "@/ui/glyphs";
import { colors, spacing } from "@/ui/theme";

export function ChapterRiver(props: {
  book: Book;
  currentIndex: number | undefined;
  position: number;
  sleep: SleepTimer | null;
  onJump: (index: number) => void;
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
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
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
});
