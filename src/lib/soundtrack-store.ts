// "Your soundtrack" (07.8, spec 07 A9): every piece that has played for a reached chapter, by book. The device logs a
// piece id and its book the first time a reached chapter with that piece plays, under one key, `soundtrack`, in the
// order they first played; never a time or a position. What plays for a chapter is the listener's pick, else the
// chapter's named piece (as the mood card decides it, src/lib/mood-card.ts), and its scene pieces (07.1) when no pick
// covers the chapter; a scene's piece only once its scene is reached (07.2, spec 07 A2: the clock at or past its
// start, now or before, src/lib/reached.ts), so the list never names a later scene's piece ahead of the listener.
// "Clear" empties the log; removing a book drops its entries (src/lib/library-store.ts). Titles
// and artists are read from the book's stored scores when the list shows, so the log keeps ids only. Pure over the
// library's key-value backend, so `node --test` exercises the code the app runs. Screens reach it through
// ./soundtrack.ts.
import { sceneStarts } from "./bed.ts";
import type { Kv } from "./library-store.ts";
import { moodCardView } from "./mood-card.ts";
import { isSceneReached } from "./reached.ts";
import { scenePiecesOf, scenesOf } from "./scenes.ts";
import type { Book, BookScores, Chapter, ChapterScore, Piece, SoundtrackEntry } from "./types.ts";

export const SOUNDTRACK_KEY = "soundtrack";

/** How far the clock has been in the chapter: its span, the clock's place, the furthest place reached in it. */
export type SceneReach = { chapter: Pick<Chapter, "start" | "end">; position: number | null; furthestIn: number | null };

/**
 * The piece ids that play for a reached chapter: the one the mood card names as playing, then the pieces of its
 * scenes reached so far (`reach`; absent, only the first scene). A pick covers every scene, so it logs alone.
 */
export function piecesPlayed(score: ChapterScore, reach?: SceneReach): string[] {
  const view = moodCardView(true, score);
  if (view.kind !== "scored" || !view.playing) return [];
  const known = new Set(score.pieces.map((p) => p.id));
  const sceneList = scenesOf(score.mood);
  const pieces = view.pick === "auto" ? scenePiecesOf(score.playlist, sceneList.length) : [];
  const length = reach ? Math.max(0, reach.chapter.end - reach.chapter.start) : 0;
  const starts = sceneStarts(length, sceneList);
  const reached = pieces.filter((_, i) => i === 0 || (!!reach && isSceneReached(reach.chapter.start + starts[i], reach.furthestIn, reach.position)));
  return [...new Set([view.playing.id, ...reached])].filter((id) => known.has(id));
}

function isEntry(v: unknown): v is SoundtrackEntry {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return typeof r.bookId === "string" && r.bookId.length > 0 && typeof r.pieceId === "string" && r.pieceId.length > 0;
}

const EMPTY: readonly SoundtrackEntry[] = Object.freeze([]);
const same = (a: SoundtrackEntry, b: SoundtrackEntry) => a.bookId === b.bookId && a.pieceId === b.pieceId;

function parse(raw: string | null): readonly SoundtrackEntry[] {
  if (raw == null) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    const kept: SoundtrackEntry[] = [];
    for (const v of parsed) {
      if (!isEntry(v)) continue;
      const e = { bookId: v.bookId, pieceId: v.pieceId };
      if (!kept.some((k) => same(k, e))) kept.push(e);
    }
    return kept.length > 0 ? kept : EMPTY;
  } catch {
    return EMPTY;
  }
}

function save(kv: Kv, list: readonly SoundtrackEntry[]) {
  if (list.length === 0) kv.removeItem(SOUNDTRACK_KEY);
  else kv.setItem(SOUNDTRACK_KEY, JSON.stringify(list));
}

/** Drops a removed book's entries from the log (called by the library's removeBook). */
export function dropSoundtrackBook(kv: Kv, bookId: string): void {
  const raw = kv.getItem(SOUNDTRACK_KEY);
  if (raw == null) return;
  save(kv, parse(raw).filter((e) => e.bookId !== bookId));
}

export function createSoundtrackStore(kv: Kv) {
  const listeners = new Set<() => void>();
  // Keyed on the stored text, so a write from elsewhere (a removed book) is read fresh, and a snapshot stays stable.
  let memo: { raw: string | null; list: readonly SoundtrackEntry[] } | null = null;

  function entries(): readonly SoundtrackEntry[] {
    const raw = kv.getItem(SOUNDTRACK_KEY);
    if (!memo || memo.raw !== raw) memo = { raw, list: parse(raw) };
    return memo.list;
  }

  function write(list: readonly SoundtrackEntry[]) {
    save(kv, list);
    listeners.forEach((l) => l());
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Every logged piece, in the order it first played; the same array until the log changes. */
    entries,
    /** A reached chapter of `bookId` plays these pieces: each is logged the first time. A no-op tells no listener. */
    log(bookId: string, pieceIds: readonly string[]): void {
      if (!bookId) return;
      const was = entries();
      const fresh = [...new Set(pieceIds)]
        .filter((pieceId) => pieceId && !was.some((e) => same(e, { bookId, pieceId })))
        .map((pieceId) => ({ bookId, pieceId }));
      if (fresh.length > 0) write([...was, ...fresh]);
    },
    /** The "Clear" row: empties the whole log. */
    clear(): void {
      if (kv.getItem(SOUNDTRACK_KEY) == null) return;
      write(EMPTY);
    },
  };
}

export type SoundtrackStore = ReturnType<typeof createSoundtrackStore>;

export type SoundtrackPiece = Pick<Piece, "id" | "title" | "artist">;
export type SoundtrackGroup = { bookId: string; title: string; author: string; pieces: SoundtrackPiece[] };

/**
 * The list "Your soundtrack" shows: one group per book on the shelf with something logged, in the shelf's order,
 * its pieces in the order they first played, each with the title and artist its book's stored scores give. A piece
 * the scores no longer hold (a rescore dropped it) has no title to show and is left out; so is a removed book.
 */
export function soundtrackView(
  entries: readonly SoundtrackEntry[],
  books: readonly Pick<Book, "id" | "title" | "author">[],
  scoresOf: (bookId: string) => BookScores | null,
): SoundtrackGroup[] {
  const groups: SoundtrackGroup[] = [];
  for (const book of books) {
    const ids = entries.filter((e) => e.bookId === book.id).map((e) => e.pieceId);
    if (ids.length === 0) continue;
    const known = new Map<string, Piece>();
    for (const c of scoresOf(book.id)?.chapters ?? []) for (const p of c.pieces) if (!known.has(p.id)) known.set(p.id, p);
    const pieces = ids.flatMap((id) => {
      const p = known.get(id);
      return p ? [{ id: p.id, title: p.title, artist: p.artist }] : [];
    });
    if (pieces.length > 0) groups.push({ bookId: book.id, title: book.title, author: book.author, pieces });
  }
  return groups;
}
