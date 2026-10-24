// The chapter mood card (01.4, spec 01 A16, A21): not a separate card but the expanded playing row's mood part
// (design/layouts/DECISION.md, "Mood card, reached chapter"). Top to bottom: every emotion chip with its intensity,
// the named piece (title, then composer or artist and kind), a muted line of alternates, and the listener's pick:
// Auto or one alternate, saved per chapter. 07.4 (spec 07 A5) adds the listener's say beside the piece: "Fits" and
// "Doesn't fit" on the piece that plays (the pick, else the named piece), one lit at most, kept on the device per
// chapter; "Doesn't fit" opens the chapter's other pieces right there, so the next step is a pick. Nothing is
// previewed or played (v1). Never a chapter's events and never
// a source's text: the card draws only emotions and pieces. A row not yet reached never gets here (A21).
import { StyleSheet, Text, View } from "react-native";

import { alternatesLine, EMOTION_NAMES, misfitOffers, pieceLine, strongest, type MoodCardView } from "@/lib/mood-card";
import type { EmotionScore, Piece } from "@/lib/types";
import type { Verdict } from "@/lib/verdict-store";
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
  verdictHeading: (title: string) => `Does ${title} fit this chapter?`,
  fits: "Fits",
  misfit: "Doesn't fit",
  fitsA11y: (title: string) => `Fits: ${title} suits this chapter`,
  misfitA11y: (title: string) => `Doesn't fit: ${title} does not suit this chapter`,
  offers: "Try one of these instead",
  offerA11y: (title: string, artist: string) => `Try ${title} by ${artist} for this chapter instead`,
  noOffers: "No other piece is named for this chapter.",
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
  /** The listener's verdict on the playing piece in this chapter, or null (A5). */
  verdict?: Verdict | null;
  /** A tap on "Fits" or "Doesn't fit" for the playing piece; the screen decides what it does to the kept verdict. */
  onVerdict?: (pieceId: string, tapped: Verdict) => void;
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
      <EmotionChips emotions={v.emotions} testID="mood-emotions" />
      {v.piece ? (
        <>
          <View style={styles.block} testID="mood-piece">
            <Text style={styles.heading}>{COPY.piece}</Text>
            <Text style={styles.pieceTitle}>{v.piece.title}</Text>
            <Text style={styles.muted}>{pieceLine(v.piece)}</Text>
          </View>
          {v.playing && props.onVerdict && (
            <VerdictTargets
              playing={v.playing}
              verdict={props.verdict ?? null}
              offers={misfitOffers(v)}
              onVerdict={(tapped) => props.onVerdict!(v.playing!.id, tapped)}
              onPick={(id) => props.onPick(id === v.piece?.id ? "auto" : id)}
            />
          )}
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

/** "Fits" and "Doesn't fit" on the playing piece; "Doesn't fit" lit opens the chapter's other pieces in place. */
function VerdictTargets(props: {
  playing: Piece;
  verdict: Verdict | null;
  offers: readonly Piece[];
  onVerdict: (tapped: Verdict) => void;
  onPick: (pieceId: string) => void;
}) {
  const title = props.playing.title;
  return (
    <>
      <View style={styles.block} testID="mood-verdict">
        <Text style={styles.heading}>{COPY.verdictHeading(title)}</Text>
        <View style={styles.chips}>
          <Chip
            testID="verdict-fits"
            label={COPY.fits}
            a11yLabel={COPY.fitsA11y(title)}
            on={props.verdict === "fits"}
            onPress={() => props.onVerdict("fits")}
          />
          <Chip
            testID="verdict-misfit"
            label={COPY.misfit}
            a11yLabel={COPY.misfitA11y(title)}
            on={props.verdict === "misfit"}
            onPress={() => props.onVerdict("misfit")}
          />
        </View>
      </View>
      {props.verdict === "misfit" && (
        <View style={styles.block} testID="mood-misfit-offers">
          <Text style={styles.heading}>{COPY.offers}</Text>
          {props.offers.length > 0 ? (
            <View style={styles.chips}>
              {props.offers.map((p) => (
                <Chip
                  key={p.id}
                  testID={`offer-${p.id}`}
                  label={p.title}
                  a11yLabel={COPY.offerA11y(p.title, p.artist)}
                  on={false}
                  onPress={() => props.onPick(p.id)}
                />
              ))}
            </View>
          ) : (
            <Text style={styles.muted}>{COPY.noOffers}</Text>
          )}
        </View>
      )}
    </>
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
