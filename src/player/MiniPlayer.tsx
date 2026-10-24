// The docked mini player at the bottom of a book's river: cover, the playing chapter's title over a progress bar
// that scrubs, and back 30 s, play/pause, forward 30 s in thumb reach (design/layouts/DECISION.md). Under the bar
// sit every time readout of the playing book: the chapter's elapsed / length and, while one runs, the sleep timer's
// remainder (A28). It docks under the river and under every sheet over it, so the readouts show wherever it does.
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { chapterClock, sleepReadout } from "@/lib/readouts";
import { clamp, SKIP_SECONDS } from "@/lib/timeline";
import type { Book, Chapter, SleepTimer } from "@/lib/types";
import { Cover } from "@/ui/Cover";
import { Icon } from "@/ui/Icon";
import { colors, spacing } from "@/ui/theme";

export function MiniPlayer(props: {
  book: Book;
  chapter: Chapter | undefined;
  position: number;
  sleep: SleepTimer | null;
  playing: boolean;
  loading: boolean;
  onToggle: () => void;
  onSkip: (delta: number) => void;
  onSeek: (bookSeconds: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const start = props.chapter?.start ?? 0;
  const end = props.chapter?.end ?? props.book.duration;
  // While the bar is dragged, the elapsed readout follows the finger; it seeks on release.
  const [dragged, setDragged] = useState<number | null>(null);
  const clock = chapterClock(start, end, dragged ?? props.position);
  const now = useClock(props.sleep?.kind === "minutes");
  const sleep = sleepReadout(props.sleep, now);
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]} testID="mini-player">
      <Cover book={props.book} width={44} />
      <View style={styles.middle}>
        <Text style={styles.title} numberOfLines={1} testID="mini-chapter-title">
          {props.chapter?.title ?? props.book.title}
        </Text>
        <Scrubber start={start} end={end} position={props.position} onSeek={props.onSeek} onDrag={setDragged} />
        <View style={styles.readouts}>
          <Text style={styles.time} testID="mini-time">
            <Text testID="mini-elapsed">{clock.elapsed}</Text>
            {" / "}
            <Text testID="mini-length">{clock.length}</Text>
          </Text>
          {sleep && (
            <Text style={styles.sleep} numberOfLines={1} testID="mini-sleep">
              {sleep}
            </Text>
          )}
        </View>
      </View>
      <Pressable
        testID="mini-back-30"
        role="button"
        aria-label={`Back ${SKIP_SECONDS} seconds`}
        style={styles.skip}
        onPress={() => props.onSkip(-SKIP_SECONDS)}
      >
        <Icon name="skip-back" size="small" />
        <Text style={styles.skipText}>{SKIP_SECONDS}</Text>
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
          <Icon name="pause" color={colors.onAccent} filled />
        ) : (
          <Icon name="play" color={colors.onAccent} filled />
        )}
      </Pressable>
      <Pressable
        testID="mini-fwd-30"
        role="button"
        aria-label={`Forward ${SKIP_SECONDS} seconds`}
        style={styles.skip}
        onPress={() => props.onSkip(SKIP_SECONDS)}
      >
        <Icon name="skip-forward" size="small" />
        <Text style={styles.skipText}>{SKIP_SECONDS}</Text>
      </Pressable>
    </View>
  );
}

/** The wall clock in ms, ticking each second while `running` (a minutes sleep timer counts down even when paused). */
function useClock(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  return now;
}

/** The chapter's progress; tap or drag along it to seek within the chapter. */
function Scrubber(props: {
  start: number;
  end: number;
  position: number;
  onSeek: (s: number) => void;
  /** The book position under the finger while dragging, null once let go. */
  onDrag: (s: number | null) => void;
}) {
  const [width, setWidth] = useState(0);
  const [dragging, setDraggingState] = useState<number | null>(null);
  const len = Math.max(0.001, props.end - props.start);
  const setDragging = (f: number | null) => {
    setDraggingState(f);
    props.onDrag(f === null ? null : props.start + f * len);
  };
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
  track: { paddingTop: spacing.sm, paddingBottom: spacing.xs },
  readouts: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: spacing.sm },
  time: { color: colors.text, fontSize: 12, fontVariant: ["tabular-nums"] },
  sleep: { color: colors.textMuted, fontSize: 12, fontVariant: ["tabular-nums"], flexShrink: 1 },
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
});
