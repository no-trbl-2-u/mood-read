// The book's scoring band under the top bar (01.2, 01.17, A30; design/layouts/DECISION.md, Scoring): "Score this
// book", its progress bar, the one-time first-run note, the cap line and the failure lines. Rescore is not here: it
// lives in the river's overflow menu and asks once, inline (RescoreConfirm below, A13). The band never shows a
// chapter's emotions or events: the mood card is 01.4's, and spoilers stay out (Open questions 7). Its copy lives
// here; the cap line and the first-scoring line are the fixed lines of design/system/DECISION.md, word for word.
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { BookScores, ScoringJob } from "@/lib/types";
import { Button as UIButton } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { colors, radii, sizes, spacing, strokes, typography } from "@/ui/theme";

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
  dismiss: "Dismiss",
  rescore: "Rescore",
  rescoreAsk: (n: number) => `Rescore all ${n} chapters?`,
  rescoreBody: "It uses this month's scoring budget. The moods you see now stay until the new ones land.",
  cancel: "Cancel",
} as const;

/** The Rescore item's caption in the river's overflow menu (design/layouts/DECISION.md, "Rescore"). */
export const RESCORE_MENU = { label: COPY.rescore, caption: "Reads every chapter's mood again." } as const;

export function ScoringBand(props: {
  chapters: number;
  job: ScoringJob | null;
  scores: BookScores | null;
  /** The first-run note ("Only the title, author and chapter titles are sent.") was dismissed on this device. */
  noteDismissed: boolean;
  onDismissNote: () => void;
  onStart: () => void;
  onRescore: () => void;
}) {
  const { job, scores } = props;

  if (job?.state === "running" || job?.state === "capped") {
    const p = job.progress;
    const capped = job.state === "capped";
    const pct = p.steps > 0 ? Math.min(99, Math.round((p.step / p.steps) * 100)) : 0;
    const tone = capped ? colors.textMuted : colors.accent;
    return (
      <View style={styles.band} testID="scoring-band">
        <View style={styles.row}>
          <View style={styles.lead}>
            <Icon name={capped ? "hourglass" : "sparkles"} size="small" color={tone} />
            {capped ? (
              <Text style={styles.text} testID="scoring-capped" role="status">
                {COPY.capped}
              </Text>
            ) : (
              <Text style={styles.live} testID="scoring-progress" role="status">
                {COPY.scoring(pct)}
              </Text>
            )}
          </View>
          <Text style={styles.caption}>{COPY.chapters(p.chaptersDone, p.chapters || props.chapters)}</Text>
        </View>
        {capped && <Text style={styles.caption}>{COPY.cappedCaption}</Text>}
        <View style={styles.track} aria-hidden>
          <View style={[styles.fill, { width: `${capped ? barPct(p) : pct}%`, backgroundColor: tone }]} />
        </View>
        {!props.noteDismissed && (
          <View style={styles.note} testID="scoring-note">
            <Icon name="shield-check" size="small" />
            <Text style={[styles.text, styles.noteText]}>{COPY.sent}</Text>
            <Pressable testID="scoring-note-dismiss" role="button" aria-label={COPY.dismiss} onPress={props.onDismissNote} style={styles.dismiss}>
              <Icon name="x" size="small" />
            </Pressable>
          </View>
        )}
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
        <Text style={styles.text} testID="scoring-done">
          {COPY.scored(scored, props.chapters)}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.band} testID="scoring-band">
      <View style={styles.row}>
        <Button testID="score-book" label={COPY.start} icon="sparkles" onPress={props.onStart} primary />
        <Text style={styles.caption}>{COPY.startCaption}</Text>
      </View>
    </View>
  );
}

function barPct(p: { step: number; steps: number }): number {
  return p.steps > 0 ? Math.min(99, Math.round((p.step / p.steps) * 100)) : 0;
}

/** The inline question a Rescore tap from the overflow menu raises: asked once, in the band's place (A13). */
export function RescoreConfirm(props: { chapters: number; onConfirm: () => void; onCancel: () => void }) {
  return (
    <View style={styles.band} testID="rescore-confirm" role="alert">
      <Text style={styles.text}>{COPY.rescoreAsk(props.chapters)}</Text>
      <Text style={styles.caption}>{COPY.rescoreBody}</Text>
      <View style={styles.row}>
        <Button testID="rescore-confirm-yes" label={COPY.rescore} onPress={props.onConfirm} primary />
        <Button testID="rescore-confirm-cancel" label={COPY.cancel} onPress={props.onCancel} />
      </View>
    </View>
  );
}

function Button(props: { label: string; onPress: () => void; testID: string; primary?: boolean; icon?: "sparkles" }) {
  return (
    <UIButton
      small
      icon={props.icon}
      kind={props.primary ? "primary" : "secondary"}
      label={props.label}
      onPress={props.onPress}
      testID={props.testID}
    />
  );
}

const styles = StyleSheet.create({
  band: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: strokes.hairline,
    borderBottomColor: colors.border,
    borderStyle: "dashed",
  },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  lead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  track: { height: spacing.sm, borderRadius: radii.pill, backgroundColor: colors.border, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radii.pill },
  note: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingLeft: spacing.sm,
    borderWidth: strokes.outline,
    borderColor: colors.edge,
    borderRadius: radii.md,
  },
  noteText: { flex: 1 },
  dismiss: { minWidth: sizes.touch, minHeight: sizes.touch, alignItems: "center", justifyContent: "center" },
  live: { ...typography.label, color: colors.accent },
  text: typography.label,
  caption: typography.caption,
  error: { ...typography.label, color: colors.danger },
});
