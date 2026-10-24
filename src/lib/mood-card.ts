// The chapter mood card's content (01.4, spec 01 A16, A21), pure so its rules and wording are tested where they are
// made: which emotions a row shows (none before the chapter is reached), each one's intensity (a chip reads
// "Tension 80%", through labels.ts stickerLabel), the named piece and its alternates, and the listener's pick over auto. Never a chapter's events, never a source's text: a
// ChapterMood holds neither, and the card shows only emotions, intensities and pieces.
import type { ChapterScore, Emotion, EmotionScore, Piece } from "./types.ts";

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

/** A piece's muted line: "Composer 1 · Score". */
export function pieceLine(p: Pick<Piece, "artist" | "kind">): string {
  return `${p.artist} · ${KIND_NAMES[p.kind]}`;
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
    };

/** What a chapter's row may show, given whether it is reached and its stored score (or null). */
export function moodCardView(reached: boolean, score: ChapterScore | null): MoodCardView {
  if (!reached) return { kind: "locked" };
  if (!score) return { kind: "none" };
  if (score.mood.coverage === "too-little") return { kind: "unscored" };
  const byId = new Map(score.pieces.map((p) => [p.id, p]));
  const pl = score.playlist;
  const piece = pl ? (byId.get(pl.piece) ?? null) : null;
  const alternates = pl ? pl.alternates.map((id) => byId.get(id)).filter((p): p is Piece => !!p) : [];
  const pick = pl && pl.pick !== "auto" && alternates.some((p) => p.id === pl.pick) ? pl.pick : "auto";
  return { kind: "scored", emotions: strongest(score.mood.emotions), piece, alternates, pick };
}
