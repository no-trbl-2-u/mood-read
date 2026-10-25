// The listener's verdicts leave the device only as daily aggregates (07.5, spec 07 A6). Once a book has a verdict
// (07.4, ./verdict-store.ts), the app posts to the proxy, at most once a day, rows of `{ pieceId, emotions, verdict }`:
// the piece, the chapter's emotion set (names only, from the stored research scores) and the verdict. No book id,
// chapter index, device id, position or time rides with a row, and the request carries no header but its content
// type (./scoring-api.ts sendVerdicts).
//
// Rules, each tested in ./verdict-sync.test.ts:
//   - nothing is sent while "Share what fits" (Settings.shareVerdicts) is off; verdicts stay on the device either way;
//   - Wi-Fi-only (Settings.wifiOnly) holds the post back off Wi-Fi. As with downloads (05.6, ./download-queue.ts),
//     the app binds `onWifi` to the network watch (./network.ts); left out it says yes and the gate is the setting alone;
//   - only a researched chapter's verdict is sent: a chapter whose stored mood is not `scored` (a listener's own seed,
//     07.6, or one with too little written) sends nothing, and the seeds are never read here at all;
//   - a verdict is skipped when its chapter's title no longer matches the stored score (the chapter list was edited
//     since, so the index may name another chapter), or its piece is no longer among that chapter's pieces;
//   - the device keeps the day it last posted (a local date, never sent) and posts at most once on any day; the day
//     is spent when the post is made, even if it fails, so the proxy is never asked twice in a day;
//   - each verdict is sent once: a sent marker (its chapter, piece and verdict) is kept per book once the proxy took
//     it, so the same verdict is not counted again every day. A changed verdict is a new one and is sent; a cleared
//     and re-given verdict is the same one and is not. At most MAX_VERDICT_ROWS go in one post; the rest wait a day.
// Pure over the key-value backend, so `node --test` runs the code the app runs. The app binds it in ./verdicts.ts.
import type { Kv } from "./library-store.ts";
import { EMOTIONS, MAX_VERDICT_ROWS, type Book, type BookScores, type PieceVerdict, type Settings, type VerdictRow } from "./types.ts";

export const VERDICT_SYNC_KEY = "verdict-sync";

/** What the device keeps about sending: the local day it last posted, and each book's sent markers. */
export type VerdictSyncState = { day: string | null; sent: Record<string, string[]> };

/** One verdict's sent marker: its chapter, verdict and piece. Kept on the device only. */
export const sentMark = (v: Pick<PieceVerdict, "chapterIndex" | "pieceId" | "verdict">) => `${v.chapterIndex}|${v.verdict}|${v.pieceId}`;

/** A local calendar day, "YYYY-MM-DD": the once-a-day clock. Never sent. */
export function localDay(ms: number): string {
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

export type PendingVerdict = { bookId: string; mark: string; row: VerdictRow };

type SyncBook = Pick<Book, "id" | "chapters">;

/** A book's verdicts not yet sent, as rows (the rules above); verdicts that may not be sent are left out. */
export function pendingRows(book: SyncBook, verdicts: readonly PieceVerdict[], scores: Pick<BookScores, "chapters"> | null, sent: readonly string[]): PendingVerdict[] {
  const out: PendingVerdict[] = [];
  for (const v of verdicts) {
    const mark = sentMark(v);
    if (sent.includes(mark)) continue;
    const chapter = book.chapters[v.chapterIndex];
    if (!chapter) continue;
    const score = scores?.chapters.find((c) => c.mood.chapterIndex === v.chapterIndex && c.mood.chapterTitle === chapter.title);
    if (!score || score.mood.coverage !== "scored" || score.mood.emotions.length === 0) continue;
    if (!score.pieces.some((p) => p.id === v.pieceId)) continue;
    const names = score.mood.emotions.map((e) => e.emotion);
    out.push({ bookId: book.id, mark, row: { pieceId: v.pieceId, emotions: EMOTIONS.filter((e) => names.includes(e)), verdict: v.verdict } });
  }
  return out;
}

export function readSyncState(raw: string | null): VerdictSyncState {
  try {
    const v = raw == null ? null : (JSON.parse(raw) as Partial<VerdictSyncState>);
    const sent: Record<string, string[]> = {};
    if (v && typeof v.sent === "object" && v.sent !== null) {
      for (const [id, marks] of Object.entries(v.sent)) if (Array.isArray(marks)) sent[id] = marks.filter((m): m is string => typeof m === "string");
    }
    return { day: typeof v?.day === "string" ? v.day : null, sent };
  } catch {
    return { day: null, sent: {} };
  }
}

export type SyncOutcome = "sent" | "off" | "no-wifi" | "today" | "nothing" | "failed" | "busy";

export function createVerdictSync(deps: {
  kv: Kv;
  books: () => readonly SyncBook[];
  verdicts: (bookId: string) => readonly PieceVerdict[];
  /** The book's research scores (never the listener's seeds). */
  scores: (bookId: string) => Pick<BookScores, "chapters"> | null;
  settings: () => Pick<Settings, "shareVerdicts" | "wifiOnly">;
  send: (rows: VerdictRow[]) => Promise<void>;
  /** Whether the device is on Wi-Fi now; yes until the app has a network check (see above). */
  onWifi?: () => boolean;
  now?: () => number;
}) {
  const onWifi = deps.onWifi ?? (() => true);
  const now = deps.now ?? Date.now;
  let busy = false;

  const read = () => readSyncState(deps.kv.getItem(VERDICT_SYNC_KEY));
  const write = (s: VerdictSyncState) => deps.kv.setItem(VERDICT_SYNC_KEY, JSON.stringify(s));

  function pending(state: VerdictSyncState = read()): PendingVerdict[] {
    return deps.books().flatMap((b) => pendingRows(b, deps.verdicts(b.id), deps.scores(b.id), state.sent[b.id] ?? []));
  }

  return {
    pending: () => pending(),
    /** Posts today's batch when every rule allows it; says why not otherwise. */
    async run(): Promise<SyncOutcome> {
      if (busy) return "busy";
      const s = deps.settings();
      if (!s.shareVerdicts) return "off";
      if (s.wifiOnly && !onWifi()) return "no-wifi";
      const state = read();
      const today = localDay(now());
      if (state.day === today) return "today";
      const batch = pending(state).slice(0, MAX_VERDICT_ROWS);
      if (batch.length === 0) return "nothing";
      busy = true;
      write({ ...state, day: today });
      try {
        await deps.send(batch.map((p) => p.row));
      } catch {
        return "failed";
      } finally {
        busy = false;
      }
      const after = read();
      const live = new Set(deps.books().map((b) => b.id));
      const sent: Record<string, string[]> = {};
      for (const [id, marks] of Object.entries(after.sent)) if (live.has(id)) sent[id] = marks;
      for (const p of batch) if (live.has(p.bookId)) sent[p.bookId] = [...(sent[p.bookId] ?? []), p.mark];
      write({ day: today, sent });
      return "sent";
    },
  };
}

export type VerdictSync = ReturnType<typeof createVerdictSync>;
