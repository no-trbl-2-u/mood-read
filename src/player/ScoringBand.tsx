// The book's scoring band under the top bar (01.2, 01.17, A30; design/layouts/DECISION.md, Scoring): "Score this
// book", its progress bar, the one-time first-run note, the cap line and the failure lines. Rescore is not here: it
// lives in the river's overflow menu and asks once, inline (RescoreConfirm below, A13). The band never shows a
// chapter's emotions or events: the mood card is 01.4's, and spoilers stay out (Open questions 7). Its copy lives
// here; the cap line and the first-scoring line are the fixed lines of design/system/DECISION.md, word for word.
// A busy proxy (a 429, 01.25, A38) reads as "try later" with the time it named, never as unreachable; once that time
// passes the band offers "Score this book" (or "Rescore") again.
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { clockTimeLabel, dayLabel, sameDay } from "@/lib/labels";
import type { BookScores, BusyReason, ScoringJob } from "@/lib/types";
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
  busy: (time: string) => `Scoring is busy. Try again after ${time}.`,
  tooSoon: (when: string) => `Rescored recently. Try again ${when}.`,
  after: (time: string) => `after ${time}`,
  on: (day: string) => `on ${day}`,
  scored: (n: number, total: number) => (n === total ? `Scored: all ${total} chapters` : `Scored: ${n} of ${total} chapters`),
  dismiss: "Dismiss",
  rescore: "Rescore",
  rescoreAsk: (n: number) => `Rescore all ${n} chapters?`,
  rescoreBody: "It uses this month's scoring budget. The moods you see now stay until the new ones land.",
  cancel: "Cancel",
  setMood: "Set the mood",
  setMoodCaption: "Or seed it yourself; nothing is sent.",
} as const;

/**
 * The waiting line (A38): a busy proxy names the time; a rescore too soon names the day, or the time when it is
 * later today.
 */
export function waitingLine(reason: BusyReason | undefined, until: number, now: number): string {
  if (reason !== "rescore-too-soon") return COPY.busy(clockTimeLabel(until));
  return COPY.tooSoon(sameDay(until, now) ? COPY.after(clockTimeLabel(until)) : COPY.on(dayLabel(until)));
}

/** The clock, read again once `until` has passed, so a waiting band turns back into its button on time. */
function useNowPast(until: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (now >= until) return;
    // setTimeout holds at most about 24.8 days; a longer wait re-arms when this one fires.
    const left = Math.max(0, until - Date.now());
    const h = setTimeout(() => setNow(Date.now()), Math.min(left + 50, 2_147_000_000));
    return () => clearTimeout(h);
  }, [until, now]);
  return now;
}

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
  /** "Set the mood" (07.6, A7): offered while no chapter of the book is scored, so the listener can seed it. */
  onSetMood?: () => void;
}) {
  const setMood = props.onSetMood && (
    <View style={styles.row}>
      <Button testID="band-set-mood" label={COPY.setMood} onPress={props.onSetMood} />
      <Text style={styles.caption}>{COPY.setMoodCaption}</Text>
    </View>
  );
  const { scores } = props;
  const until = props.job?.state === "waiting" ? (props.job.waitUntil ?? 0) : 0;
  const now = useNowPast(until);
  // A wait that has passed reads like no job at all: the band offers its button again (A38).
  const waited = props.job?.state === "waiting" && now >= until ? props.job : null;
  const job = waited ? null : props.job;

  if (job?.state === "waiting") {
    return (
      <View style={styles.band} testID="scoring-band">
        <View style={styles.lead}>
          <Icon name="hourglass" size="small" color={colors.textMuted} />
          <Text style={[styles.text, styles.grow]} testID="scoring-waiting" role="status">
            {waitingLine(job.waitReason, until, now)}
          </Text>
        </View>
      </View>
    );
  }

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
        {waited?.rescore && <Button testID="scoring-rescore" label={COPY.rescore} onPress={props.onRescore} />}
        {setMood}
      </View>
    );
  }

  return (
    <View style={styles.band} testID="scoring-band">
      <View style={styles.row}>
        <Button testID="score-book" label={COPY.start} icon="sparkles" onPress={props.onStart} primary />
        <Text style={styles.caption}>{COPY.startCaption}</Text>
      </View>
      {setMood}
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
  grow: { flexShrink: 1 },
  dismiss: { minWidth: sizes.touch, minHeight: sizes.touch, alignItems: "center", justifyContent: "center" },
  live: { ...typography.label, color: colors.accent },
  text: typography.label,
  caption: typography.caption,
  error: { ...typography.label, color: colors.danger },
});
