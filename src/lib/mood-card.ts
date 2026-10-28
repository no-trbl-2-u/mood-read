// The chapter mood card's content (01.4, spec 01 A16, A21), pure so its rules and wording are tested where they are
// made: which emotions a row shows (none before the chapter is reached), each one's intensity (a chip reads
// "Tension 80%", through labels.ts stickerLabel), the named piece and its alternates, and the listener's pick over auto. Never a chapter's events, never a source's text: a
// ChapterMood holds neither, and the card shows only emotions, intensities and pieces.
import { sceneAt, sceneStarts } from "./bed.ts";
import { isSceneReached } from "./reached.ts";
import { scenesOf } from "./scenes.ts";
import { streamingLinks, type StreamingLink } from "./streaming-links.ts";
import type { Chapter, ChapterScore, Emotion, EmotionScore, Piece } from "./types.ts";

export const EMOTION_NAMES: Record<Emotion, string> = {
  tension: "Tension",
  sorrow: "Sorrow",
  wonder: "Wonder",
  joy: "Joy",
  dread: "Dread",
  calm: "Calm",
  romance: "Romance",
  triumph: "Triumph",
};

const KIND_NAMES: Record<Piece["kind"], string> = {
  score: "Score",
  instrumental: "Instrumental",
  ambient: "Ambient",
};

/** An intensity (0 to 1) as a whole percent, clamped. */
export function intensityPercent(intensity: number): number {
  if (!Number.isFinite(intensity)) return 0;
  return Math.round(Math.min(1, Math.max(0, intensity)) * 100);
}

/** Strongest first, at most `limit` (all when omitted). */
export function strongest(emotions: readonly EmotionScore[], limit?: number): EmotionScore[] {
  const sorted = [...emotions].sort((a, b) => b.intensity - a.intensity);
  return limit === undefined ? sorted : sorted.slice(0, limit);
}

/**
 * A piece's muted line: "Composer 1 · Score", and with its catalog license (05.3, A3) "Kevin MacLeod · Ambient ·
 * CC BY 4.0", so the card shows the piece's title, artist and license.
 */
export function pieceLine(p: Pick<Piece, "artist" | "kind">, license?: string | null): string {
  return license ? `${p.artist} · ${KIND_NAMES[p.kind]} · ${license}` : `${p.artist} · ${KIND_NAMES[p.kind]}`;
}

/** The reference (05.3, D13): "In the spirit of Title by Artist". Shown only; it never plays. */
export function referenceLine(p: Pick<Piece, "title" | "artist">): string {
  return `In the spirit of ${p.title} by ${p.artist}`;
}

/**
 * The reference piece's link-outs (01.11, spec 01 A24): gated exactly like `referenceLine` — a reached, scored
 * chapter's own researched reference, never the listener's own seed (07.6, whose coverage is never a spoiler but
 * also never carries a reference). Each link is a plain search on the service, never an exact-track lookup; Mood
 * Read plays none of it.
 */
export function referenceLinks(v: MoodCardView): StreamingLink[] {
  if (v.kind !== "scored" || !v.reference || v.listener) return [];
  return streamingLinks(v.reference);
}

/** The muted line of alternates: "Theme 2 (Composer 2) · Theme 3 (Composer 3)". */
export function alternatesLine(alternates: readonly Pick<Piece, "title" | "artist">[]): string {
  return alternates.map((p) => `${p.title} (${p.artist})`).join(" · ");
}

export type MoodCardView =
  /** Not reached yet: no emotions, no piece, no chips of any kind (A21). */
  | { kind: "locked" }
  /** Never scored (no stored score under this title): nothing to show. */
  | { kind: "none" }
  /** Scoring found too little written about it: the "Unscored" chip, never a guessed mood (A19). */
  | { kind: "unscored" }
  | {
      kind: "scored";
      /** Strongest first. */
      emotions: EmotionScore[];
      /** The named piece, null when no piece passed the no-vocals checks (A20). */
      piece: Piece | null;
      alternates: Piece[];
      /** `auto` or one of the alternates' ids. */
      pick: "auto" | string;
      /** The piece that plays for the chapter: the picked alternate, else the named piece; what a verdict is on (A5). */
      playing: Piece | null;
      /** The playing scene's emotions, strongest first (07.2, sceneBand); absent or null, no band. */
      scene?: EmotionScore[] | null;
      /** The named piece's license as people write it ("CC BY 4.0"), from the catalog; null when not known (05.3). */
      license?: string | null;
      /** The famous piece the research named beside the catalog pick (05.3, D13): shown as "In the spirit of", never played. */
      reference?: Piece | null;
      /**
       * The listener's own seed (07.6, A7), not a researched mood: the card says "Your mood", calls the piece the
       * matched one (or says the soundscape plays), and offers no verdict, so a seed's emotions never leave the device.
       */
      listener?: true;
    };

/**
 * What a chapter's row may show, given whether it is reached and its stored score (or null). A listener's seed is
 * their own words, so it shows at once, reached or not (spec 07, Contracts: Spoilers). `licenseOf` names a catalog
 * piece's license (05.3); without it, or for a piece the catalog does not hold, no license is shown.
 */
export function moodCardView(reached: boolean, score: ChapterScore | null, licenseOf: (pieceId: string) => string | null = () => null): MoodCardView {
  if (!reached && score?.mood.coverage !== "listener") return { kind: "locked" };
  if (!score) return { kind: "none" };
  if (score.mood.coverage === "too-little") return { kind: "unscored" };
  const byId = new Map(score.pieces.map((p) => [p.id, p]));
  const pl = score.playlist;
  const piece = pl ? (byId.get(pl.piece) ?? null) : null;
  const alternates = pl ? pl.alternates.map((id) => byId.get(id)).filter((p): p is Piece => !!p) : [];
  const pick = pl && pl.pick !== "auto" && alternates.some((p) => p.id === pl.pick) ? pl.pick : "auto";
  const playing = pick === "auto" ? piece : (alternates.find((p) => p.id === pick) ?? piece);
  const view: MoodCardView = {
    kind: "scored",
    emotions: strongest(score.mood.emotions),
    piece,
    alternates,
    pick,
    playing,
    license: piece ? licenseOf(piece.id) : null,
    reference: score.reference ?? null,
  };
  return score.mood.coverage === "listener" ? { ...view, listener: true } : view;
}

/**
 * What "Doesn't fit" offers in place (07.4, A5): every piece of the chapter but the one playing, the named piece first,
 * then the alternates, so the next step is a pick (the named piece picks Auto).
 */
export function misfitOffers(v: Extract<MoodCardView, { kind: "scored" }>): Piece[] {
  if (!v.piece || !v.playing) return [];
  return [v.piece, ...v.alternates].filter((p) => p.id !== v.playing!.id);
}

/**
 * The scene band (07.2, spec 07 A2): the emotions of the scene the clock is in, at `position` (book seconds) in
 * `chapter`, strongest first, so the band changes as the clock crosses a boundary and a seek back shows the earlier
 * scene again. Nothing for a scene not yet reached: its start past both the clock and `furthestIn`, the furthest
 * place reached within this chapter (src/lib/reached.ts), so the card never tells the listener how the chapter's end
 * feels before they get there. Null, no band, for a chapter with fewer than two scenes: its own chips say it all.
 */
export function sceneBand(
  score: ChapterScore | null,
  chapter: Pick<Chapter, "start" | "end"> | undefined,
  position: number,
  furthestIn: number | null,
): EmotionScore[] | null {
  if (!score || !chapter || !Number.isFinite(position)) return null;
  const scenes = scenesOf(score.mood);
  if (scenes.length < 2) return null;
  const length = Math.max(0, chapter.end - chapter.start);
  const scene = sceneAt(position - chapter.start, length, scenes);
  if (scene === null) return null;
  if (!isSceneReached(chapter.start + sceneStarts(length, scenes)[scene], furthestIn, position)) return null;
  const shown = strongest(scenes[scene].emotions);
  return shown.length > 0 ? shown : null;
}

/**
 * Whether a row's emotion chips open its mood card in place (01.22, spec 01 A35): a reached, scored row with emotions
 * that is not the playing row (which is always open). A row not yet reached shows no chips and never opens (A21),
 * unless its mood is the listener's own seed (07.6): theirs, not a spoiler, so it shows and opens reached or not.
 */
export function canPeek(view: MoodCardView, playing: boolean): boolean {
  return !playing && view.kind === "scored" && view.emotions.length > 0;
}

/** The row open after a tap on row `index`'s chips: one at a time, and a second tap on the open row closes it. */
export function togglePeek(open: number | null, index: number): number | null {
  return open === index ? null : index;
}
