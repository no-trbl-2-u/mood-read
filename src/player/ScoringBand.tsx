// The book's scoring line under the top bar (01.2): the minimum to start scoring, see its progress, and see that a
// book is scored, with an explicit Rescore (A13). 01.17 turns this into the designed action band (06.2: icons, the
// bar, the dismissable first-run note, Rescore in the overflow with its confirmation). It never shows a chapter's
// emotions or events: the mood card is 01.4's, and spoilers stay out (Open questions 7). Its copy lives here; the
// cap line and the first-scoring line are the fixed lines of design/system/DECISION.md, word for word.
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { BookScores, ScoringJob } from "@/lib/types";
import { colors, radii, spacing, typography } from "@/ui/theme";

const COPY = {
  start: "Score this book",
  startCaption: "Reads the mood of every chapter.",
  sent: "Only the title, author and chapter titles are sent.",
  scoring: (pct: number) => `Scoring ${pct}%`,
  chapters: (done: number, total: number) => `${done} of ${total} chapters`,
  capped: "Waiting: this month's scoring budget is spent.",
  cappedCaption: "Chapters already scored still play.",
  failed: "Scoring stopped before it finished. Try again.",
  unreachable: "Couldn't reach the scoring service. Check your connection and try again.",
  retry: "Try again",
  scored: (n: number, total: number) => (n === total ? `Scored: all ${total} chapters` : `Scored: ${n} of ${total} chapters`),
  rescore: "Rescore",
} as const;

export function ScoringBand(props: {
  chapters: number;
  job: ScoringJob | null;
  scores: BookScores | null;
  onStart: () => void;
  onRescore: () => void;
}) {
  const { job, scores } = props;

  if (job?.state === "running") {
    const p = job.progress;
    const pct = p.steps > 0 ? Math.min(99, Math.round((p.step / p.steps) * 100)) : 0;
    return (
      <View style={styles.band} testID="scoring-band">
        <View style={styles.row}>
          <Text style={styles.live} testID="scoring-progress" role="status">
            {COPY.scoring(pct)}
          </Text>
          <Text style={styles.caption}>{COPY.chapters(p.chaptersDone, p.chapters || props.chapters)}</Text>
        </View>
      </View>
    );
  }

  if (job?.state === "capped") {
    return (
      <View style={styles.band} testID="scoring-band">
        <Text style={styles.text} testID="scoring-capped" role="status">
          {COPY.capped}
        </Text>
        <Text style={styles.caption}>{COPY.cappedCaption}</Text>
      </View>
    );
  }

  if (job?.state === "failed" || job?.state === "unreachable") {
    return (
      <View style={styles.band} testID="scoring-band">
        <Text style={styles.error} role="alert">
          {job.state === "failed" ? COPY.failed : COPY.unreachable}
        </Text>
        <Button testID="scoring-retry" label={COPY.retry} onPress={job.rescore ? props.onRescore : props.onStart} />
      </View>
    );
  }

  if (scores) {
    const scored = scores.chapters.filter((c) => c.mood.coverage === "scored").length;
    return (
      <View style={styles.band} testID="scoring-band">
        <View style={styles.row}>
          <Text style={styles.text} testID="scoring-done">
            {COPY.scored(scored, props.chapters)}
          </Text>
          <Button testID="rescore" label={COPY.rescore} onPress={props.onRescore} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.band} testID="scoring-band">
      <View style={styles.row}>
        <Button testID="score-book" label={COPY.start} onPress={props.onStart} primary />
        <Text style={styles.caption}>{COPY.startCaption}</Text>
      </View>
      <Text style={styles.caption}>{COPY.sent}</Text>
    </View>
  );
}

function Button(props: { label: string; onPress: () => void; testID: string; primary?: boolean }) {
  return (
    <Pressable testID={props.testID} role="button" onPress={props.onPress} style={[styles.button, props.primary && styles.primary]}>
      <Text style={[styles.buttonText, props.primary && styles.primaryText]}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  band: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    borderStyle: "dashed",
  },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  live: { ...typography.label, color: colors.accent },
  text: typography.label,
  caption: typography.caption,
  error: { ...typography.label, color: colors.danger },
  button: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.edge,
    backgroundColor: colors.surface,
  },
  primary: { backgroundColor: colors.accent, borderColor: colors.ink },
  buttonText: { color: colors.text, fontSize: 14, fontWeight: "700" },
  primaryText: { color: colors.onAccent },
});
