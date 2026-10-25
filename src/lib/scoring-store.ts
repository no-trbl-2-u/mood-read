// Scores on the device (01.2, A13, A15): per book, the scoring job (so it resumes after the app closes) and, once
// done, each chapter's ChapterMood, its Pieces and its ChapterPlaylist, so a book is scored once, not on every play.
// 07.6 (spec 07 A7) adds the listener's seeds (`seeds:<book id>`): moods the listener set for an unscored book or
// chapter ("Set the mood", src/lib/mood-match.ts), kept apart from the research so a seed alone is never a scoring
// run, and read with it (`chapters`). The replace rule: a later research result replaces a chapter's seed only when it
// comes back `scored`; a `too-little` result keeps the seed.
// 05.3 (spec 05 A3): a book scored before v2 is re-matched against the music catalog the device loaded, from its stored
// emotions, with no request to the proxy (`rematch`, src/lib/catalog-match.ts); its old named piece becomes the
// chapter's reference, shown as "In the spirit of" and never played (D13).
// Pure: over the same key-value backend as the library (src/lib/library-store.ts), reached only through src/lib/.
import { rematchScores, type MatchablePiece } from "./catalog-match.ts";
import type { Kv } from "./library-store.ts";
import type { Book, BookScores, Chapter, ChapterScore, JobView, ScoringJob } from "./types.ts";

export const jobKey = (bookId: string) => `scorejob:${bookId}`;
export const scoresKey = (bookId: string) => `scores:${bookId}`;
export const seedsKey = (bookId: string) => `seeds:${bookId}`;

const sameChapter = (a: ChapterScore, b: ChapterScore) => a.mood.chapterIndex === b.mood.chapterIndex && a.mood.chapterTitle === b.mood.chapterTitle;

/**
 * A book's chapters as the device reads them, by chapter index: each research chapter, except that a seed under the
 * same index and title stands in for one the research did not score (`too-little`), and a seed fills a chapter the
 * research never returned. A seed never shows over a researched (`scored`) mood.
 */
export function mergeSeeds(scores: Pick<BookScores, "chapters"> | null, seeds: readonly ChapterScore[] | null): ChapterScore[] {
  const research = scores?.chapters ?? [];
  const mine = seeds ?? [];
  const out = research.map((c) => (c.mood.coverage === "scored" ? c : (mine.find((s) => sameChapter(s, c)) ?? c)));
  for (const s of mine) if (!research.some((c) => sameChapter(c, s))) out.push(s);
  return out.sort((a, b) => a.mood.chapterIndex - b.mood.chapterIndex);
}

/** The replace rule (A7): the seeds a research result leaves standing, every one but those it scored. */
export function keepSeeds(seeds: readonly ChapterScore[], scores: Pick<BookScores, "chapters"> | null): ChapterScore[] {
  const scored = (scores?.chapters ?? []).filter((c) => c.mood.coverage === "scored");
  return seeds.filter((s) => !scored.some((c) => sameChapter(c, s)));
}

/** The chapters a seed may go on: those without a researched mood under their current title. */
export function seedable<C extends Pick<Chapter, "index" | "title">>(chapters: readonly C[], scores: Pick<BookScores, "chapters"> | null): C[] {
  return chapters.filter((c) => !scores?.chapters.some((s) => s.mood.coverage === "scored" && s.mood.chapterIndex === c.index && s.mood.chapterTitle === c.title));
}

/**
 * A chapter title as the proxy compares it (proxy/src/validate.ts bookKey): the proxy collapses whitespace, and a
 * cached book carries the first listener's casing, so titles that differ only in those are the same chapter.
 */
export const sameChapterTitle = (a: string, b: string) => {
  const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  return norm(a) === norm(b);
};

/**
 * Turns a finished job's chapters into what the device keeps, matched to the book's chapters by index and title. A
 * kept mood carries the device's own chapter title, so later lookups compare against the title as it is on the device.
 */
export function toBookScores(book: Pick<Book, "chapters">, view: JobView, previous: BookScores | null): BookScores | null {
  const r = view.result;
  if (!r) return null;
  const chapters: ChapterScore[] = [];
  for (const c of r.chapters) {
    const mine = book.chapters[c.index];
    if (!mine || !sameChapterTitle(mine.title, c.title)) continue;
    // The chapter's piece, its alternates, then any piece only a scene plays (07.1), each once.
    const pieces = c.pieces ? [c.pieces.piece, ...c.pieces.alternates, ...(c.pieces.scenePieces ?? [])].filter((p, i, all) => all.findIndex((q) => q.id === p.id) === i) : [];
    const scenePieces = c.pieces?.scenePieces && c.mood.scenes && c.pieces.scenePieces.length === c.mood.scenes.length ? c.pieces.scenePieces.map((p) => p.id) : undefined;
    const old = previous?.chapters.find((x) => x.mood.chapterIndex === c.index && x.mood.chapterTitle === mine.title)?.playlist;
    const keepPick = old && old.pick !== "auto" && pieces.some((p) => p.id === old.pick) ? old.pick : "auto";
    // The reference (05.3, D13): shown as "In the spirit of", never played, so never among the pieces.
    const reference = c.pieces?.reference && !pieces.some((p) => p.id === c.pieces!.reference!.id) ? { reference: c.pieces.reference } : {};
    chapters.push({
      ...reference,
      mood: { ...c.mood, chapterTitle: mine.title },
      pieces,
      playlist: c.pieces
        ? { chapterIndex: c.index, piece: c.pieces.piece.id, alternates: c.pieces.alternates.map((p) => p.id), pick: keepPick, ...(scenePieces ? { scenePieces } : {}) }
        : null,
    });
  }
  return { jobId: view.jobId, model: r.model, version: r.version, scoredAt: r.scoredAt, costUsd: r.costUsd, chapters };
}

export function createScoringStore(kv: Kv) {
  const listeners = new Set<() => void>();
  // Snapshots per key, so React's useSyncExternalStore sees a stable value between writes.
  const cache = new Map<string, unknown>();

  function read<T>(key: string): T | null {
    if (cache.has(key)) return cache.get(key) as T | null;
    let v: T | null = null;
    try {
      const raw = kv.getItem(key);
      v = raw == null ? null : (JSON.parse(raw) as T);
    } catch {
      v = null;
    }
    cache.set(key, v);
    return v;
  }

  // The merged read per book (`chapters`), stable between writes; any write drops it.
  const merged = new Map<string, ChapterScore[]>();

  function write(key: string, value: unknown) {
    if (value === null) kv.removeItem(key);
    else kv.setItem(key, JSON.stringify(value));
    cache.set(key, value);
    merged.clear();
    listeners.forEach((l) => l());
  }

  const seedsOf = (bookId: string): ChapterScore[] => read<ChapterScore[]>(seedsKey(bookId)) ?? [];

  /** Saves a research result and applies the replace rule to the book's seeds. */
  function saveScores(bookId: string, scores: BookScores) {
    write(scoresKey(bookId), scores);
    const seeds = seedsOf(bookId);
    const kept = keepSeeds(seeds, scores);
    if (kept.length !== seeds.length) write(seedsKey(bookId), kept.length ? kept : null);
  }

  return {
    subscribe(l: () => void): () => void {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    job: (bookId: string): ScoringJob | null => read<ScoringJob>(jobKey(bookId)),
    saveJob: (bookId: string, job: ScoringJob | null) => write(jobKey(bookId), job),
    scores: (bookId: string): BookScores | null => read<BookScores>(scoresKey(bookId)),
    saveScores,
    /** The listener's seeds for a book (07.6), in chapter order. */
    seeds: seedsOf,
    /** Keeps the listener's seeds (07.6): each replaces any seed already on its chapter. Nothing leaves the device. */
    seed(bookId: string, add: readonly ChapterScore[]) {
      const rest = seedsOf(bookId).filter((s) => !add.some((a) => sameChapter(a, s)));
      write(seedsKey(bookId), [...rest, ...add].sort((a, b) => a.mood.chapterIndex - b.mood.chapterIndex));
    },
    /** The book's chapters as they read with the seeds (mergeSeeds): what the river, the bed and the shelf show. */
    chapters(bookId: string): ChapterScore[] {
      const hit = merged.get(bookId);
      if (hit) return hit;
      const out = mergeSeeds(read<BookScores>(scoresKey(bookId)), seedsOf(bookId));
      merged.set(bookId, out);
      return out;
    },
    /** A chapter's stored score, only while the chapter still has the title it was scored under. */
    chapterScore(bookId: string, chapter: Pick<Chapter, "index" | "title">): ChapterScore | null {
      const s = read<BookScores>(scoresKey(bookId));
      return s?.chapters.find((c) => c.mood.chapterIndex === chapter.index && c.mood.chapterTitle === chapter.title) ?? null;
    },
    /**
     * Saves the listener's pick for a chapter (01.4, A16): one of its alternates, or `auto` for the named piece. Only
     * the chapter's playlist changes, never its ChapterMood. False (and nothing saved) when the chapter has no stored
     * playlist under its current title, or the pick is not one of its alternates.
     */
    savePick(bookId: string, chapter: Pick<Chapter, "index" | "title">, pick: "auto" | string): boolean {
      const s = read<BookScores>(scoresKey(bookId));
      if (!s) return false;
      const at = s.chapters.findIndex((c) => c.mood.chapterIndex === chapter.index && c.mood.chapterTitle === chapter.title);
      const playlist = at < 0 ? null : s.chapters[at].playlist;
      if (!playlist) return false;
      const next = pick === playlist.piece ? "auto" : pick;
      if (next !== "auto" && !playlist.alternates.includes(next)) return false;
      if (playlist.pick === next) return true;
      const chapters = s.chapters.map((c, i) => (i === at ? { ...c, playlist: { ...playlist, pick: next } } : c));
      write(scoresKey(bookId), { ...s, chapters });
      return true;
    },
    /**
     * Re-matches a book scored before v2 against the catalog (05.3, A3): every researched chapter whose pieces are not
     * all catalog pieces gets the catalog's, from its stored emotions; nothing is sent anywhere. True when it changed
     * anything; an empty catalog, or a book already on it, changes nothing.
     */
    rematch(bookId: string, catalog: readonly MatchablePiece[]): boolean {
      const s = read<BookScores>(scoresKey(bookId));
      const next = s && rematchScores(s, catalog);
      if (!next) return false;
      write(scoresKey(bookId), next);
      return true;
    },
    /** Reads the book's keys from the store again, after they were written from outside (05.17's import). */
    refresh(bookId: string) {
      for (const key of [jobKey(bookId), scoresKey(bookId), seedsKey(bookId)]) cache.delete(key);
      merged.clear();
      listeners.forEach((l) => l());
    },
    forget(bookId: string) {
      write(jobKey(bookId), null);
      write(scoresKey(bookId), null);
      write(seedsKey(bookId), null);
    },
  };
}

export type ScoringStore = ReturnType<typeof createScoringStore>;
