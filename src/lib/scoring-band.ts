// What the river's action band says about scoring (01.17, spec 01 A30; design/layouts/DECISION.md, v2: "Scoring:
// start", "progress and the first-run line", "the cap", "Rescore"), and the first-run note's one-time state. Pure, so
// `node --test` checks the rules the screen follows: the band is a function of the book's job and stored scores,
// and the note that only the title, author and chapter titles are sent belongs to one run on this device, ever.
import type { Kv } from "./library-store.ts";
import type { BookScores, ScoringJob } from "./types.ts";

export type ScoringBandView =
  /** Never scored and nothing running: "Score this book". */
  | { kind: "start" }
  /** A run going (a first scoring or a rescore): its percent and chapters done. */
  | { kind: "running"; percent: number; done: number; total: number }
  /** The proxy's monthly cap stopped the run: it waits, and picks up by itself; the bar stays where it stopped. */
  | { kind: "capped"; percent: number; done: number; total: number }
  /** The run failed, or the proxy could not be reached: a plain line and "Try again" (as a rescore, if it was one). */
  | { kind: "failed"; rescore: boolean }
  | { kind: "unreachable"; rescore: boolean };

/** A run's percent from its steps: whole, and never 100 while it still runs (the band goes once it is done). */
export function scoringPercent(step: number, steps: number): number {
  if (!(steps > 0) || !Number.isFinite(step)) return 0;
  return Math.max(0, Math.min(99, Math.round((step / steps) * 100)));
}

/**
 * The scoring band for a book, or null when there is nothing to do: a scored book with no run going shows no band
 * (Rescore lives in the overflow menu).
 */
export function scoringBandView(job: ScoringJob | null, scores: BookScores | null, chapters: number): ScoringBandView | null {
  if (job?.state === "running" || job?.state === "capped") {
    const p = job.progress;
    return { kind: job.state, percent: scoringPercent(p.step, p.steps), done: p.chaptersDone, total: p.chapters || chapters };
  }
  if (job?.state === "failed" || job?.state === "unreachable") return { kind: job.state, rescore: job.rescore };
  return scores ? null : { kind: "start" };
}

/** "Rescore" in the river's overflow: only on a scored book, and not while a run is going or waiting at the cap. */
export function canRescore(job: ScoringJob | null, scores: BookScores | null): boolean {
  return scores !== null && job?.state !== "running" && job?.state !== "capped";
}

// ---- the first-run note ----

/** Which run on this device carried the first-run note, and whether the listener dismissed it. */
export type ScoringNote = { bookId: string; startedAt: number; dismissed: boolean } | null;

export const NOTE_KEY = "scoring-note";

/**
 * Shows on the first run on this device only: the run it was claimed for (its book and start time, which a resumed
 * or retried run keeps), until dismissed. Never on another book, nor on a later run of the same book.
 */
export function showsNote(note: ScoringNote, bookId: string, job: ScoringJob | null): boolean {
  if (!note || note.dismissed || !job) return false;
  if (job.state !== "running" && job.state !== "capped") return false;
  return note.bookId === bookId && note.startedAt === job.startedAt;
}

/** Whether this run should claim the note: nothing has claimed it yet, and a run is under way. */
export function claimsNote(note: ScoringNote, job: ScoringJob | null): boolean {
  return note === null && (job?.state === "running" || job?.state === "capped");
}

function parseNote(raw: string | null): ScoringNote {
  try {
    const v = raw == null ? null : (JSON.parse(raw) as unknown);
    if (typeof v !== "object" || v === null) return null;
    const n = v as Record<string, unknown>;
    if (typeof n.bookId !== "string" || typeof n.startedAt !== "number") return null;
    return { bookId: n.bookId, startedAt: n.startedAt, dismissed: n.dismissed === true };
  } catch {
    return null;
  }
}

/** The note's state on the device, over the library's key-value backend. */
export function createScoringNoteStore(kv: Kv) {
  let state: ScoringNote = parseNote(kv.getItem(NOTE_KEY));
  const listeners = new Set<() => void>();
  const save = (next: ScoringNote) => {
    state = next;
    kv.setItem(NOTE_KEY, JSON.stringify(next));
    listeners.forEach((l) => l());
  };
  return {
    subscribe(l: () => void): () => void {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    get: (): ScoringNote => state,
    /** Claims the note for this run, once per device; a later claim does nothing. */
    claim(bookId: string, job: ScoringJob | null): void {
      if (job && claimsNote(state, job)) save({ bookId, startedAt: job.startedAt, dismissed: false });
    },
    dismiss(): void {
      if (state && !state.dismissed) save({ ...state, dismissed: true });
    },
  };
}

export type ScoringNoteStore = ReturnType<typeof createScoringNoteStore>;
