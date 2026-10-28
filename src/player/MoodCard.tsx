// The chapter mood card (01.4, spec 01 A16, A21): not a separate card but the expanded playing row's mood part
// (design/layouts/DECISION.md, "Mood card, reached chapter"). Top to bottom: every emotion chip with its intensity,
// the named piece (title, then composer or artist and kind), a muted line of alternates, and the listener's pick:
// Auto or one alternate, saved per chapter. 07.4 (spec 07 A5) adds the listener's say beside the piece: "Fits" and
// "Doesn't fit" on the piece that plays (the pick, else the named piece), one lit at most, kept on the device per
// chapter; "Doesn't fit" opens the chapter's other pieces right there, so the next step is a pick. Nothing is
// previewed or played (v1). 07.2 (spec 07 A2) adds the scene band under the chapter's chips: the playing scene's
// emotions, a thin band that changes as the clock crosses a scene boundary and shows nothing for a scene not yet
// reached (src/lib/mood-card.ts sceneBand). Never a chapter's events and never
// a source's text: the card draws only emotions and pieces. A row not yet reached never gets here (A21). 07.6 (spec 07
// A7): an unscored chapter's card offers "Set the mood" (src/player/SetMoodSheet.tsx); a seeded chapter's card says
// "Your mood", names the matched piece or says the chapter plays its soundscape, and takes no verdict, so the
// listener's own emotions never leave the device.
// 01.22 (A35): a reached, non-playing row (or a listener's own seed, reached or not) opens the same card in place
// from its chips, without moving playback; it is not playing, so it shows the chapter's emotions and piece and never
// a scene band.
// 05.3 (spec 05 A3, D13): the named piece is a catalog piece, its line carrying its license ("CC BY 4.0"); beside it
// the research's famous piece shows as one muted line, "In the spirit of <title> by <artist>": shown, never played,
// never a pick.
import type { ReactNode } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { alternatesLine, EMOTION_NAMES, misfitOffers, pieceLine, referenceLine, referenceLinks, strongest, type MoodCardView } from "@/lib/mood-card";
import type { StreamingLink } from "@/lib/streaming-links";
import type { EmotionScore, Piece } from "@/lib/types";
import type { Verdict } from "@/lib/verdict-store";
import { Button } from "@/ui/Button";
import { Chip } from "@/ui/Chip";
import { Icon } from "@/ui/Icon";
import { Sticker } from "@/ui/Sticker";
import { colors, sizes, spacing, strokes, typography } from "@/ui/theme";

const COPY = {
  emotions: "Emotions in this chapter",
  scene: "In this scene",
  sceneEmotions: "Emotions in the playing scene",
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
  yours: "Your mood",
  yoursEmotions: "Your mood for this chapter",
  matched: "Matched piece",
  soundscape: "No piece on this device matches your mood, so this chapter plays its soundscape.",
  setMood: "Set the mood",
  setMoodA11y: "Set the mood for this chapter yourself",
  changeMood: "Change your mood",
  changeMoodA11y: "Change your mood for this chapter",
  // Link-outs to the reference piece (01.11, A24): a plain search on each service; Mood Read plays none of it.
  referenceLinkA11y: (label: string, title: string, artist: string) => `${label}: search for ${title} by ${artist}`,
};

/**
 * A row of emotion stickers with intensity ("Curious 70%"); `limit` keeps the strongest few (a collapsed row: 2).
 * `label` names the list (the chapter's emotions by default); `idPrefix` keeps each sticker's test id apart from the
 * chapter's when two rows share a card (the scene band: `scene-emotion-`).
 */
export function EmotionChips(props: {
  emotions: readonly EmotionScore[];
  limit?: number;
  testID?: string;
  label?: string;
  idPrefix?: string;
}) {
  const shown = strongest(props.emotions, props.limit);
  if (shown.length === 0) return null;
  return (
    <View style={styles.chips} testID={props.testID} role="list" aria-label={props.label ?? COPY.emotions}>
      {shown.map((e, i) => (
        <View key={e.emotion} role="listitem">
          <Sticker
            emotion={e.emotion}
            label={EMOTION_NAMES[e.emotion]}
            intensity={e.intensity}
            index={i}
            testID={`${props.idPrefix ?? "emotion-"}${e.emotion}`}
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
  /** Opens "Set the mood" for this chapter (07.6, A7): offered on an unscored chapter and on the listener's own seed. */
  onSetMood?: () => void;
  /** Drawn in place of the emotion chips: a reached row's chips toggle that open its card (01.22, A35). */
  emotions?: ReactNode;
}) {
  const v = props.view;
  if (v.kind === "unscored") {
    return (
      <View style={styles.card} testID="mood-card">
        <Text style={styles.muted}>{COPY.unscored}</Text>
        {props.onSetMood && <SetMoodButton label={COPY.setMood} a11yLabel={COPY.setMoodA11y} onPress={props.onSetMood} />}
        <View style={styles.rule} />
      </View>
    );
  }
  if (v.kind !== "scored") return null;
  const yours = v.listener === true;
  return (
    <View style={styles.card} testID="mood-card">
      {yours && (
        <Text style={styles.heading} testID="mood-yours">
          {COPY.yours}
        </Text>
      )}
      {props.emotions ?? <EmotionChips emotions={v.emotions} testID="mood-emotions" label={yours ? COPY.yoursEmotions : undefined} />}
      {v.scene && v.scene.length > 0 && (
        <View style={styles.sceneBand} testID="mood-scene">
          <Text style={styles.heading}>{COPY.scene}</Text>
          <EmotionChips emotions={v.scene} testID="mood-scene-emotions" label={COPY.sceneEmotions} idPrefix="scene-emotion-" />
        </View>
      )}
      {v.piece ? (
        <>
          <View style={styles.block} testID="mood-piece">
            <Text style={styles.heading}>{yours ? COPY.matched : COPY.piece}</Text>
            <Text style={styles.pieceTitle}>{v.piece.title}</Text>
            <Text style={styles.muted}>{pieceLine(v.piece, v.license)}</Text>
          </View>
          {v.playing && props.onVerdict && !yours && (
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
      ) : yours ? (
        <Text style={styles.muted} testID="mood-soundscape">
          {COPY.soundscape}
        </Text>
      ) : (
        <Text style={styles.muted}>{COPY.noPiece}</Text>
      )}
      {v.reference && !yours && (
        <View style={styles.block}>
          <Text style={styles.muted} testID="mood-reference">
            {referenceLine(v.reference)}
          </Text>
          <View style={styles.chips} testID="mood-reference-links">
            {referenceLinks(v).map((link) => (
              <ReferenceLink key={link.service} link={link} piece={v.reference!} />
            ))}
          </View>
        </View>
      )}
      {yours && props.onSetMood && <SetMoodButton label={COPY.changeMood} a11yLabel={COPY.changeMoodA11y} onPress={props.onSetMood} />}
      <View style={styles.rule} />
    </View>
  );
}

/**
 * One of the reference piece's link-outs (01.11, A24): a plain search on the named service, opened in the
 * listener's own app or browser. No brand icon (Lucide only) — the service's plain name is the label.
 */
function ReferenceLink(props: { link: StreamingLink; piece: Piece }) {
  const { link, piece } = props;
  return (
    <Pressable
      testID={`reference-link-${link.service}`}
      role="link"
      aria-label={COPY.referenceLinkA11y(link.label, piece.title, piece.artist)}
      onPress={() => Linking.openURL(link.url)}
      style={styles.referenceLink}
    >
      <Text style={styles.referenceLinkText}>{link.label}</Text>
      <Icon name="external-link" size="small" color={colors.accent} />
    </Pressable>
  );
}

function SetMoodButton(props: { label: string; a11yLabel: string; onPress: () => void }) {
  return (
    <View style={styles.action}>
      <Button testID="set-mood" kind="secondary" small label={props.label} a11yLabel={props.a11yLabel} onPress={props.onPress} />
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
  action: { flexDirection: "row" },
  sceneBand: {
    gap: spacing.xxs,
    paddingLeft: spacing.sm,
    borderLeftWidth: strokes.outline,
    borderLeftColor: colors.border,
  },
  referenceLink: { minHeight: sizes.touch, minWidth: sizes.touch, flexDirection: "row", alignItems: "center", gap: spacing.xs },
  referenceLinkText: { ...typography.caption, color: colors.accent },
  heading: { ...typography.caption, fontWeight: typography.label.fontWeight },
  pieceTitle: { ...typography.body, fontWeight: typography.label.fontWeight },
  muted: typography.caption,
  rule: { height: strokes.hairline, backgroundColor: colors.border, marginTop: spacing.xs },
});
