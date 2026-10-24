// Scores on the device (01.2, A13, A15): per book, the scoring job (so it resumes after the app closes) and, once
// done, each chapter's ChapterMood, its Pieces and its ChapterPlaylist, so a book is scored once, not on every play.
// Pure: over the same key-value backend as the library (src/lib/library-store.ts), reached only through src/lib/.
import type { Kv } from "./library-store.ts";
import type { Book, BookScores, Chapter, ChapterScore, JobView, ScoringJob } from "./types.ts";

export const jobKey = (bookId: string) => `scorejob:${bookId}`;
export const scoresKey = (bookId: string) => `scores:${bookId}`;

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
    const pieces = c.pieces ? [c.pieces.piece, ...c.pieces.alternates] : [];
    const old = previous?.chapters.find((x) => x.mood.chapterIndex === c.index && x.mood.chapterTitle === mine.title)?.playlist;
    const keepPick = old && old.pick !== "auto" && pieces.some((p) => p.id === old.pick) ? old.pick : "auto";
    chapters.push({
      mood: { ...c.mood, chapterTitle: mine.title },
      pieces,
      playlist: c.pieces ? { chapterIndex: c.index, piece: c.pieces.piece.id, alternates: c.pieces.alternates.map((p) => p.id), pick: keepPick } : null,
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

  function write(key: string, value: unknown) {
    if (value === null) kv.removeItem(key);
    else kv.setItem(key, JSON.stringify(value));
    cache.set(key, value);
    listeners.forEach((l) => l());
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
    saveScores: (bookId: string, scores: BookScores) => write(scoresKey(bookId), scores),
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
    forget(bookId: string) {
      write(jobKey(bookId), null);
      write(scoresKey(bookId), null);
    },
  };
}

export type ScoringStore = ReturnType<typeof createScoringStore>;
