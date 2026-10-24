// The "Set the mood" bottom sheet (07.6, spec 07 A7), over the river like Speed & Sleep and Bookmarks: the eight
// emotions as chips (one tap low, two high, a third clears; up to three lit), then "Apply to this chapter" or "Apply
// to the whole book". What the listener lights is kept on the device as their own mood and matched there to a piece
// the device already knows (src/lib/mood-match.ts); nothing is sent anywhere. A chip says its level in words, never
// by colour alone.
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { EMOTION_NAMES } from "@/lib/mood-card";
import { MAX_SEED, seedLevel, tapSeed, type SeedLevel } from "@/lib/mood-match";
import { EMOTIONS, type EmotionScore } from "@/lib/types";
import { Button } from "@/ui/Button";
import { Chip } from "@/ui/Chip";
import { Sheet } from "@/ui/Sheet";
import { spacing, typography } from "@/ui/theme";

const LEVEL: Record<Exclude<SeedLevel, "off">, string> = { low: "Low", high: "High" };

const COPY = {
  title: "Set the mood",
  how: `Tap once for low, twice for high, a third time to clear. Up to ${MAX_SEED}.`,
  stays: "Your mood stays on this device. A piece it already knows is matched to it.",
  emotions: "Emotions",
  lit: (n: number) => `${n} of ${MAX_SEED} lit`,
  chip: (name: string, level: SeedLevel) => (level === "off" ? name : `${name} · ${LEVEL[level]}`),
  chipA11y: (name: string, level: SeedLevel) => (level === "off" ? `${name}, not lit` : `${name}, ${level} intensity`),
  chapter: "Apply to this chapter",
  chapterA11y: (label: string) => `Apply to this chapter, ${label}`,
  book: "Apply to the whole book",
  bookCaption: "Every chapter not scored yet takes this mood.",
};

export function SetMoodSheet(props: {
  /** The chapter the sheet was opened for, as its row names it ("Ch.2 — The Storm"); null: the book only. */
  chapterLabel: string | null;
  /** The chapter's kept seed as a draft (draftFrom), or empty. */
  initial: readonly EmotionScore[];
  onApply: (target: "chapter" | "book", lit: EmotionScore[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<EmotionScore[]>([...props.initial]);
  const none = draft.length === 0;
  return (
    <Sheet title={COPY.title} onClose={props.onClose} testID="set-mood-sheet">
      <Text style={styles.muted}>{COPY.how}</Text>
      <View style={styles.section}>
        <Text style={styles.label}>{COPY.emotions}</Text>
        <View style={styles.chips} role="list" aria-label={COPY.emotions}>
          {EMOTIONS.map((e) => {
            const level = seedLevel(draft, e);
            return (
              <View key={e} role="listitem">
                <Chip
                  testID={`seed-${e}`}
                  label={COPY.chip(EMOTION_NAMES[e], level)}
                  a11yLabel={COPY.chipA11y(EMOTION_NAMES[e], level)}
                  on={level !== "off"}
                  onPress={() => setDraft((d) => tapSeed(d, e))}
                />
              </View>
            );
          })}
        </View>
        <Text style={styles.muted} testID="seed-count" role="status">
          {COPY.lit(draft.length)}
        </Text>
      </View>
      <View style={styles.section}>
        {props.chapterLabel !== null && (
          <Button
            testID="seed-apply-chapter"
            label={COPY.chapter}
            a11yLabel={COPY.chapterA11y(props.chapterLabel)}
            disabled={none}
            onPress={() => props.onApply("chapter", draft)}
          />
        )}
        <Button testID="seed-apply-book" kind="secondary" label={COPY.book} disabled={none} onPress={() => props.onApply("book", draft)} />
        <Text style={styles.muted}>{COPY.bookCaption}</Text>
      </View>
      <Text style={styles.muted}>{COPY.stays}</Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  label: { ...typography.caption, fontWeight: typography.label.fontWeight },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  muted: typography.caption,
});
