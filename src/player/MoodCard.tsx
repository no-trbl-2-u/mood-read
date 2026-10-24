// The chapter mood card (01.4, spec 01 A16, A21): not a separate card but the expanded playing row's mood part
// (design/layouts/DECISION.md, "Mood card, reached chapter"). Top to bottom: every emotion chip with its intensity,
// the named piece (title, then composer or artist and kind), a muted line of alternates, and the listener's pick:
// Auto or one alternate, saved per chapter. Nothing is previewed or played (v1). Never a chapter's events and never
// a source's text: the card draws only emotions and pieces. A row not yet reached never gets here (A21). 01.22 (A35):
// a reached, non-playing row opens the same card in place from its chips, without moving playback.
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { alternatesLine, EMOTION_NAMES, pieceLine, strongest, type MoodCardView } from "@/lib/mood-card";
import type { EmotionScore } from "@/lib/types";
import { Chip } from "@/ui/Chip";
import { Sticker } from "@/ui/Sticker";
import { colors, spacing, strokes, typography } from "@/ui/theme";

const COPY = {
  emotions: "Emotions in this chapter",
  piece: "Named piece",
  alternates: "Alternates",
  pick: "Your pick",
  auto: "Auto",
  autoA11y: (title: string | null) => (title ? `Auto: the named piece, ${title}` : "Auto: the named piece"),
  pickA11y: (title: string, artist: string) => `Pick ${title} by ${artist} for this chapter`,
  noPiece: "No piece named for this chapter yet.",
  unscored: "Not enough has been written about this chapter to score it. Shown unscored, never guessed.",
};

/** A row of emotion stickers with intensity ("Curious 70%"); `limit` keeps the strongest few (a collapsed row: 2). */
export function EmotionChips(props: { emotions: readonly EmotionScore[]; limit?: number; testID?: string }) {
  const shown = strongest(props.emotions, props.limit);
  if (shown.length === 0) return null;
  return (
    <View style={styles.chips} testID={props.testID} role="list" aria-label={COPY.emotions}>
      {shown.map((e, i) => (
        <View key={e.emotion} role="listitem">
          <Sticker
            emotion={e.emotion}
            label={EMOTION_NAMES[e.emotion]}
            intensity={e.intensity}
            index={i}
            testID={`emotion-${e.emotion}`}
          />
        </View>
      ))}
    </View>
  );
}

export function MoodCard(props: {
  view: MoodCardView;
  onPick: (pick: "auto" | string) => void;
  /** Drawn in place of the emotion chips: a reached row's chips toggle that open its card (01.22, A35). */
  emotions?: ReactNode;
}) {
  const v = props.view;
  if (v.kind === "unscored") {
    return (
      <View style={styles.card} testID="mood-card">
        <Text style={styles.muted}>{COPY.unscored}</Text>
        <View style={styles.rule} />
      </View>
    );
  }
  if (v.kind !== "scored") return null;
  return (
    <View style={styles.card} testID="mood-card">
      {props.emotions ?? <EmotionChips emotions={v.emotions} testID="mood-emotions" />}
      {v.piece ? (
        <>
          <View style={styles.block} testID="mood-piece">
            <Text style={styles.heading}>{COPY.piece}</Text>
            <Text style={styles.pieceTitle}>{v.piece.title}</Text>
            <Text style={styles.muted}>{pieceLine(v.piece)}</Text>
          </View>
          {v.alternates.length > 0 && (
            <>
              <View style={styles.block} testID="mood-alternates">
                <Text style={styles.heading}>{COPY.alternates}</Text>
                <Text style={styles.muted}>{alternatesLine(v.alternates)}</Text>
              </View>
              <View style={styles.block}>
                <Text style={styles.heading}>{COPY.pick}</Text>
                <View style={styles.chips} testID="mood-pick">
                  <Chip
                    testID="pick-auto"
                    label={COPY.auto}
                    a11yLabel={COPY.autoA11y(v.piece.title)}
                    on={v.pick === "auto"}
                    onPress={() => props.onPick("auto")}
                  />
                  {v.alternates.map((p) => (
                    <Chip
                      key={p.id}
                      testID={`pick-${p.id}`}
                      label={p.title}
                      a11yLabel={COPY.pickA11y(p.title, p.artist)}
                      on={v.pick === p.id}
                      onPress={() => props.onPick(p.id)}
                    />
                  ))}
                </View>
              </View>
            </>
          )}
        </>
      ) : (
        <Text style={styles.muted}>{COPY.noPiece}</Text>
      )}
      <View style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, marginTop: spacing.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  block: { gap: spacing.xxs },
  heading: { ...typography.caption, fontWeight: typography.label.fontWeight },
  pieceTitle: { ...typography.body, fontWeight: typography.label.fontWeight },
  muted: typography.caption,
  rule: { height: strokes.hairline, backgroundColor: colors.border, marginTop: spacing.xs },
});
