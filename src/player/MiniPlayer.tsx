// The docked mini player at the bottom of a book's river: cover, the playing chapter's title over a progress bar
// that scrubs, and back 30 s, play/pause, forward 30 s in thumb reach (design/layouts/DECISION.md).
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { clamp, SKIP_SECONDS } from "@/lib/timeline";
import type { Book, Chapter } from "@/lib/types";
import { Cover } from "@/ui/Cover";
import { PauseGlyph, PlayGlyph } from "@/ui/glyphs";
import { colors, spacing } from "@/ui/theme";

export function MiniPlayer(props: {
  book: Book;
  chapter: Chapter | undefined;
  position: number;
  playing: boolean;
  loading: boolean;
  onToggle: () => void;
  onSkip: (delta: number) => void;
  onSeek: (bookSeconds: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const start = props.chapter?.start ?? 0;
  const end = props.chapter?.end ?? props.book.duration;
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]} testID="mini-player">
      <Cover book={props.book} width={44} />
      <View style={styles.middle}>
        <Text style={styles.title} numberOfLines={1} testID="mini-chapter-title">
          {props.chapter?.title ?? props.book.title}
        </Text>
        <Scrubber start={start} end={end} position={props.position} onSeek={props.onSeek} />
      </View>
      <Pressable
        testID="mini-back-30"
        role="button"
        aria-label={`Back ${SKIP_SECONDS} seconds`}
        style={styles.skip}
        onPress={() => props.onSkip(-SKIP_SECONDS)}
      >
        <Text style={styles.skipText}>-{SKIP_SECONDS}</Text>
      </Pressable>
      <Pressable
        testID="mini-play-pause"
        role="button"
        aria-label={props.playing ? "Pause" : "Play"}
        style={styles.play}
        onPress={props.onToggle}
      >
        {props.loading ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : props.playing ? (
          <PauseGlyph size={14} color={colors.onAccent} />
        ) : (
          <View style={styles.playNudge}>
            <PlayGlyph size={16} color={colors.onAccent} />
          </View>
        )}
      </Pressable>
      <Pressable
        testID="mini-fwd-30"
        role="button"
        aria-label={`Forward ${SKIP_SECONDS} seconds`}
        style={styles.skip}
        onPress={() => props.onSkip(SKIP_SECONDS)}
      >
        <Text style={styles.skipText}>+{SKIP_SECONDS}</Text>
      </Pressable>
    </View>
  );
}

/** The chapter's progress; tap or drag along it to seek within the chapter. */
function Scrubber(props: { start: number; end: number; position: number; onSeek: (s: number) => void }) {
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState<number | null>(null);
  const len = Math.max(0.001, props.end - props.start);
  const shown = dragging ?? clamp((props.position - props.start) / len, 0, 1);
  const fraction = (e: GestureResponderEvent) => (width > 0 ? clamp(e.nativeEvent.locationX / width, 0, 1) : 0);
  return (
    <View
      testID="scrubber"
      role="slider"
      aria-label="Chapter progress"
      aria-valuemin={0}
      aria-valuemax={Math.round(len)}
      aria-valuenow={Math.round(shown * len)}
      style={styles.track}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => setDragging(fraction(e))}
      onResponderMove={(e) => setDragging(fraction(e))}
      onResponderRelease={(e) => {
        const f = fraction(e);
        setDragging(null);
        props.onSeek(props.start + f * len);
      }}
      onResponderTerminate={() => setDragging(null)}
    >
      <View style={styles.trackBg} pointerEvents="none">
        <View style={[styles.trackFill, { width: `${shown * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  middle: { flex: 1, gap: 2, minWidth: 0 },
  title: { color: colors.text, fontSize: 14, fontWeight: "700" },
  track: { paddingVertical: spacing.sm },
  trackBg: { height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: "hidden" },
  trackFill: { height: 4, backgroundColor: colors.accent },
  skip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  skipText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  play: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  playNudge: { paddingLeft: 3 },
});
