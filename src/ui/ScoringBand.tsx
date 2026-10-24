// Scoring in the river's action band (01.17, spec 01 A30; design/layouts/DECISION.md, v2: "Scoring: start", "progress
// and the first-run line", "the cap"): "Score this book" on a book never scored, the run's percent and chapters with
// a bar, the cap's plain wait, and a failed or unreachable run's line with "Try again". A scored book shows no band;
// "Rescore" lives in the river's overflow menu. It never shows a chapter's emotions or events (A21). The cap line
// and the first-run line are the fixed lines of design/system/DECISION.md, word for word. Its copy lives here.
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { ScoringBandView } from "@/lib/scoring-band";

import { Button } from "./Button";
import { Icon } from "./Icon";
import { colors, radii, sizes, spacing, strokes, typography } from "./theme";

const COPY = {
  start: "Score this book",
  startCaption: "Reads the mood of every chapter.",
  scoring: (pct: number) => `Scoring ${pct}%`,
  chapters: (done: number, total: number) => `${done} of ${total} chapters`,
  capped: "Waiting: this month's scoring budget is spent.",
  cappedCaption: "Chapters already scored still play. Scoring picks up again on its own when next month's budget opens.",
  failed: "Scoring stopped before it finished. Try again.",
  unreachable: "Couldn't reach the scoring service. Check your connection and try again.",
  retry: "Try again",
  sent: "Only the title, author and chapter titles are sent.",
  dismiss: "Dismiss",
} as const;

export function ScoringBand(props: {
  view: ScoringBandView;
  /** The first-run note: shown on the first run on this device, until dismissed. */
  note: boolean;
  onStart: () => void;
  onRetry: () => void;
  onDismissNote: () => void;
}) {
  const { view } = props;

  if (view.kind === "start") {
    return (
      <View style={styles.row} testID="scoring-band">
        <Button testID="score-book" small icon="sparkles" label={COPY.start} onPress={props.onStart} />
        <Text style={[typography.caption, styles.grow]}>{COPY.startCaption}</Text>
      </View>
    );
  }

  if (view.kind === "failed" || view.kind === "unreachable") {
    return (
      <View style={styles.row} testID="scoring-band">
        <Icon name="triangle-alert" size="small" color={colors.danger} />
        <Text style={[styles.error, styles.grow]} role="alert" testID="scoring-error">
          {view.kind === "failed" ? COPY.failed : COPY.unreachable}
        </Text>
        <Button testID="scoring-retry" small kind="secondary" label={COPY.retry} onPress={props.onRetry} />
      </View>
    );
  }

  const capped = view.kind === "capped";
  return (
    <View style={styles.band} testID="scoring-band">
      {capped ? (
        <View style={styles.top}>
          <Icon name="hourglass" size="small" />
          <View style={styles.grow} role="status" testID="scoring-capped">
            <Text style={typography.label}>{COPY.capped}</Text>
            <Text style={typography.caption}>{COPY.cappedCaption}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.row}>
          <Icon name="sparkles" size="small" color={colors.accent} />
          <Text style={[styles.live, styles.grow]} role="status" testID="scoring-progress">
            {COPY.scoring(view.percent)}
          </Text>
          <Text style={typography.caption}>{COPY.chapters(view.done, view.total)}</Text>
        </View>
      )}
      <View style={styles.row} aria-hidden>
        <View style={[styles.track, styles.grow]}>
          <View style={[styles.fill, capped && styles.paused, { width: `${view.percent}%` }]} />
        </View>
        {capped && <Text style={typography.caption}>{COPY.chapters(view.done, view.total)}</Text>}
      </View>
      {props.note && (
        <View style={styles.note} testID="scoring-note">
          <Icon name="shield-check" size="small" color={colors.accent} />
          <Text style={[typography.body, styles.grow]}>{COPY.sent}</Text>
          <Pressable testID="scoring-note-dismiss" role="button" aria-label={COPY.dismiss} onPress={props.onDismissNote} style={styles.dismiss}>
            <Icon name="x" size="small" />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  band: { gap: spacing.sm },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  top: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  grow: { flex: 1, minWidth: 0 },
  live: { ...typography.label, color: colors.accent },
  error: { ...typography.label, color: colors.danger },
  track: {
    height: sizes.track,
    borderRadius: radii.pill,
    backgroundColor: colors.background,
    borderWidth: strokes.hairline,
    borderColor: colors.edge,
    overflow: "hidden",
  },
  fill: { height: "100%", backgroundColor: colors.accent },
  paused: { backgroundColor: colors.textMuted },
  note: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingLeft: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: strokes.outline,
    borderColor: colors.edge,
    borderRadius: radii.md,
  },
  dismiss: { minWidth: sizes.touch, minHeight: sizes.touch, alignItems: "center", justifyContent: "center" },
});
