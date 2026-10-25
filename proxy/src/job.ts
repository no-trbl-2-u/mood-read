// One book's scoring job (01.2; spec 01 "Scoring is a job, not a play-time call"; A13, A15, A22). A job runs in
// small steps (a few searches, one reading of the sources, one batch of pieces), saving its state after each, so a
// step that dies is retried from where it stopped and nothing has to fit in one request. In production each book's
// job is its own Durable Object and a step is one alarm (index.ts); tests drive step() in a loop.
//
// - start: a book already scored returns its cached result with no new run, to any listener; a run already going
//   is returned as it stands; a new run starts only under the monthly cap, else the job waits as `capped` and starts
//   by itself once a status poll finds the month's spend under the cap again.
// - rescore is explicit: it starts a new run even for a cached book; the old result stays until the new one lands.
//   A cached book is rescored only once its result is at least the minimum age (01.21, A34).
// - a book with a Project Gutenberg number is read from its own text first (05.9, text-research.ts): phase `text`
//   stands in for `search` and `moods`, and falls back to them when the text is missing or matches nothing.
// - a pre-score run (05.10, prescore.ts) is billed to the meter's pre-score share and runs a step only while that
//   share's budget is open; when it closes the run waits as `capped`, keeping its progress. A listener who asks for
//   the same book takes the run over: from then on it is billed and gated as the listener's.
// - every listener's start that would begin a new run (running or waiting at the cap) must first be admitted by the
//   limiter (limiter.ts, 01.21, A34); a cached book, a run already going, or a listener taking over a paused pre-score
//   run never asks it. A refused start stores nothing. A pre-score start (the owner's token route) is not limited
//   per client: its own budget share bounds it.
// - a model call that fails is metered too: the usage the provider reported, else a conservative estimate (01.21).
import { usageOf, type ModelClient, type SearchClient } from "./clients.ts";
import {
  SCORER_VERSION,
  type BookRequest,
  type BookResult,
  type ChapterMood,
  type ChapterResult,
  type EmotionScore,
  type JobState,
  type JobView,
  type Scene,
  type SourceLink,
} from "./contract.ts";
import { matchChapters } from "./match.ts";
import { DAY_MS, DEFAULT_RESCORE_MIN_AGE_DAYS, UNKNOWN_CLIENT, type Limiter, type Refusal } from "./limiter.ts";
import { BRAVE_USD_PER_QUERY, estimateUsage, monthOf, openAiCost, underCap, type Meter } from "./meter.ts";
import { PRESCORE_BUCKET, prescoreOpen } from "./prescore.ts";
import { CATALOG, catalogPieces } from "./catalog.ts";
import {
  CANDIDATES_PER_CHAPTER,
  candidateRequest,
  chooseReference,
  confirmedInstrumental,
  firstGuard,
  nameKey,
  parseCandidates,
  vocalsCheckRequest,
  type Candidate,
  type ChapterAsk,
} from "./pieces.ts";
import { addSources, buildQueries, moodRequest, parseMoods, sourcesFor, type Query, type Source } from "./research.ts";
import type { Store } from "./store.ts";
import type { CatalogPiece } from "../../src/lib/catalog.ts";
import { textStep, type TextRun, type TextSource } from "./text-research.ts";

export const SEARCHES_PER_STEP = 6;
export const MOOD_CHAPTERS_PER_STEP = 10;
export const PIECE_CHAPTERS_PER_STEP = 5;
/** Rounds of candidates per chapter before it is given up as unscored. */
export const PIECE_ROUNDS = 2;
/** Consecutive failures of one step before the run is marked failed. */
export const MAX_ATTEMPTS = 3;
export const RETRY_DELAY_MS = 30_000;

type Phase = "text" | "search" | "moods" | "pieces" | "done";
/** `scenes` is absent on a draft saved before 07.1: read through `scenesOf`, one scene. */
type Draft = { emotions: EmotionScore[]; scenes?: Scene[]; sources: SourceLink[] };

/** A scored draft's scenes, in order: its own, else one scene equal to the chapter (A1). */
const scenesOf = (d: Draft): Scene[] => (d.scenes && d.scenes.length ? d.scenes : [{ emotions: d.emotions, span: 1 }]);

export type Run = {
  key: string;
  book: BookRequest;
  state: JobState;
  phase: Phase;
  queries: Query[];
  cursor: number;
  sources: Source[];
  /** Per chapter: emotions found and awaiting pieces. */
  drafts: (Draft | null)[];
  /** Per chapter: its final result once known. */
  results: (ChapterResult | null)[];
  step: number;
  steps: number;
  costUsd: number;
  startedAt: number;
  attempts: number;
  error?: string;
  /** The text path's matching and cursor (05.9): chapter numbers only, never the text. */
  text?: TextRun;
  /** Started by the owner's pre-scoring (05.10); billed and gated as such until a listener asks for the book. */
  prescore?: boolean;
};

const JOB = "job";
const RESULT = "result";
/** Set when a listener asks for a book whose pre-score run is going: kept apart from the run so no step overwrites it. */
const LISTENER = "listener";

export type JobDeps = {
  store: Store;
  meter: Meter;
  capUsd: number;
  search: SearchClient;
  model: ModelClient;
  /** A public-domain book's own text (05.9); without it every book is researched on the web. */
  text?: TextSource;
  /** Admits new runs per client and per hour; without one (some tests) every new run is admitted. */
  limiter?: Limiter;
  /** How old a cached result must be before a rescore may replace it; 7 days unless given. */
  rescoreMinAgeMs?: number;
  now?: () => number;
  /** The catalog pieces a chapter's pieces come from (05.3); the snapshot bundled into the Worker unless given. */
  catalog?: readonly CatalogPiece[];
  /** Told when a run finishes (05.10: the pre-scored books' index). A failure here never fails the run. */
  onFinish?: (done: { key: string; book: BookRequest; prescore: boolean }, result: BookResult) => Promise<void>;
};

export type Schedule = { view: JobView; run: boolean };
/** What a start answers: the job, or why no run was started and when to ask again. */
export type Started = Schedule | { refused: Refusal };

const chunks = (n: number, size: number) => Math.ceil(n / size);

function estimateSteps(run: Pick<Run, "queries" | "book">): number {
  const n = run.book.chapters.length;
  return chunks(run.queries.length, SEARCHES_PER_STEP) + chunks(n, MOOD_CHAPTERS_PER_STEP) + chunks(n, PIECE_CHAPTERS_PER_STEP);
}

function view(key: string, run: Run | undefined, result: BookResult | undefined): JobView | null {
  if (!run && !result) return null;
  if (!run || (run.state === "done" && result)) {
    const n = result!.chapters.length;
    const steps = run?.steps || 1;
    return { jobId: key, state: "done", progress: { step: steps, steps, chaptersDone: n, chapters: n }, result };
  }
  const chapters = run.book.chapters.length;
  const chaptersDone = run.results.filter(Boolean).length;
  const out: JobView = { jobId: key, state: run.state, progress: { step: Math.min(run.step, run.steps), steps: run.steps, chaptersDone, chapters } };
  // A rescore running, waiting at the cap or failed leaves the old result standing: it is shown alongside, so a
  // status poll sees the same cached book that a start does.
  if (result) out.result = result;
  return out;
}

export function createBookJob(deps: JobDeps) {
  const now = deps.now ?? Date.now;
  const { store, meter } = deps;

  const load = () => Promise.all([store.get<Run>(JOB), store.get<BookResult>(RESULT)]);

  /** True while the run is billed and gated as pre-scoring. */
  const prescoring = async (run: Run) => !!run.prescore && !(await store.get<boolean>(LISTENER));

  /** Whether a new run, or the next step of a waiting one, may go: pre-scoring's half or the whole cap. */
  const mayRun = async (prescore: boolean) => (prescore ? prescoreOpen(meter, deps.capUsd, now()) : underCap(meter, deps.capUsd, now()));

  function freshRun(key: string, book: BookRequest, state: JobState, prescore = false): Run {
    const queries = buildQueries(book);
    const run: Run = {
      key,
      book,
      state,
      phase: book.gutenbergId && deps.text ? "text" : "search",
      queries,
      cursor: 0,
      sources: [],
      drafts: book.chapters.map(() => null),
      results: book.chapters.map(() => null),
      step: 0,
      steps: 0,
      costUsd: 0,
      startedAt: now(),
      attempts: 0,
      ...(prescore ? { prescore: true } : {}),
    };
    // A text run reads its chapters in a step or a few (05.9); its count firms up once the text is matched.
    run.steps = run.phase === "text" ? 1 + chunks(book.chapters.length, PIECE_CHAPTERS_PER_STEP) : estimateSteps(run);
    return run;
  }

  async function begin(key: string, book: BookRequest, result: BookResult | undefined, prescore = false): Promise<Schedule> {
    await store.delete(LISTENER);
    if (!(await mayRun(prescore))) {
      const waiting = freshRun(key, book, "capped", prescore);
      await store.put(JOB, waiting);
      return { view: view(key, waiting, result)!, run: false };
    }
    const run = freshRun(key, book, "running", prescore);
    await store.put(JOB, run);
    return { view: view(key, run, result)!, run: true };
  }

  async function charge(run: Run, usd: number) {
    run.costUsd += usd;
    await meter.add(monthOf(now()), usd, (await prescoring(run)) ? PRESCORE_BUCKET : undefined);
  }

  async function complete(run: Run, req: Parameters<ModelClient["complete"]>[0]) {
    let out;
    try {
      out = await deps.model.complete(req);
    } catch (e) {
      // A failed call may still have been billed: count what the provider reported, else a conservative estimate.
      await charge(run, openAiCost(deps.model.model, usageOf(e) ?? estimateUsage(req)));
      throw e;
    }
    await charge(run, openAiCost(deps.model.model, out.usage));
    return out.value;
  }

  const mood = (run: Run, i: number, d: Draft | null): ChapterMood => ({
    chapterIndex: i,
    chapterTitle: run.book.chapters[i],
    emotions: d ? d.emotions : [],
    ...(d ? { scenes: scenesOf(d) } : {}),
    sources: d ? d.sources : [],
    coverage: d ? "scored" : "too-little",
    model: deps.model.model,
    version: SCORER_VERSION,
    scoredAt: now(),
  });

  const unscored = (run: Run, i: number): ChapterResult => ({ index: i, title: run.book.chapters[i], mood: mood(run, i, null), pieces: null });

  async function searchStep(run: Run) {
    const batch = run.queries.slice(run.cursor, run.cursor + SEARCHES_PER_STEP);
    let sources = run.sources;
    for (const q of batch) {
      const hits = await deps.search.search(q.q);
      await charge(run, BRAVE_USD_PER_QUERY);
      sources = addSources(sources, hits, q.chapter);
    }
    run.sources = sources;
    run.cursor += batch.length;
    if (run.cursor >= run.queries.length) {
      run.phase = "moods";
      run.cursor = 0;
    }
  }

  async function moodStep(run: Run) {
    const indices: number[] = [];
    for (let i = run.cursor; i < run.book.chapters.length && indices.length < MOOD_CHAPTERS_PER_STEP; i++) indices.push(i);
    const sources = sourcesFor(run.sources, indices);
    const matched = sources.length
      ? matchChapters(parseMoods(await complete(run, moodRequest(run.book, indices, sources)), sources), run.book.chapters, indices)
      : new Map();
    for (const i of indices) {
      const f = matched.get(i);
      if (f && f.coverage === "scored") run.drafts[i] = { emotions: f.emotions, scenes: f.scenes, sources: f.sources };
      else run.results[i] = unscored(run, i);
    }
    run.cursor += indices.length;
    if (run.cursor >= run.book.chapters.length) {
      run.phase = "pieces";
      run.cursor = 0;
      const scored = run.drafts.filter(Boolean).length;
      run.steps = run.step + 1 + chunks(scored, PIECE_CHAPTERS_PER_STEP);
    }
  }

  async function textPhase(run: Run) {
    const out = await textStep({ book: run.book, gutenbergId: run.book.gutenbergId!, text: run.text, source: deps.text!, complete: (req) => complete(run, req) });
    if (out.kind === "fallback") {
      run.phase = "search";
      run.text = undefined;
      return;
    }
    run.text = out.text;
    for (const [i, d] of out.drafts) run.drafts[i] = d;
    for (const i of out.unscored) run.results[i] = unscored(run, i);
    if (out.done) {
      run.phase = "pieces";
      run.steps = run.step + 1 + chunks(run.drafts.filter(Boolean).length, PIECE_CHAPTERS_PER_STEP);
    }
  }

  // A chapter's pieces (05.3, A3): the catalog's, matched from its emotions and scenes (catalog.ts), never the
  // model's. The model names only the chapter's reference (D13), one famous piece shown as "In the spirit of" and
  // never played, through the same no-vocals checks as ever (A20): the flag, the name screen, the tags, and a second,
  // separate check.
  async function piecesFor(run: Run, indices: number[]) {
    const passed = new Map<number, Candidate[]>(indices.map((i) => [i, []]));
    const rejected = new Map<number, Set<string>>(indices.map((i) => [i, new Set()]));
    const tried = new Map<number, Set<string>>(indices.map((i) => [i, new Set()]));
    for (let round = 0; round < PIECE_ROUNDS; round++) {
      const short = indices.filter((i) => passed.get(i)!.length < 1);
      if (!short.length) break;
      const asks: ChapterAsk[] = short.map((i) => ({
        index: i,
        emotions: run.drafts[i]!.emotions,
        // A retry asks the model not to suggest again what it offered and the checks refused.
        exclude: [...tried.get(i)!],
      }));
      const offered = parseCandidates(await complete(run, candidateRequest(run.book, asks)));
      const fresh: { i: number; c: Candidate; id: string }[] = [];
      for (const ask of asks) {
        const i = ask.index;
        const some = (offered.get(i) ?? []).slice(0, CANDIDATES_PER_CHAPTER);
        for (const c of some) tried.get(i)!.add(`${c.title} by ${c.artist}`);
        const ok = firstGuard(some, ask.emotions, rejected.get(i)!);
        for (const c of ok) fresh.push({ i, c, id: `p${fresh.length + 1}` });
      }
      if (!fresh.length) continue;
      const confirmed = confirmedInstrumental(await complete(run, vocalsCheckRequest(fresh.map((f) => ({ id: f.id, title: f.c.title, artist: f.c.artist })))));
      for (const f of fresh) {
        if (confirmed.has(f.id)) passed.get(f.i)!.push(f.c);
        else rejected.get(f.i)!.add(nameKey(f.c));
      }
    }
    for (const i of indices) {
      const d = run.drafts[i]!;
      const reference = chooseReference(passed.get(i)!, d.emotions);
      // Catalog pieces for the chapter and each of its scenes; null only when the catalog has too few that fit, and
      // then the mood stays scored with its sources (A13) and no piece is named.
      const matched = catalogPieces({ emotions: d.emotions, scenes: scenesOf(d) }, deps.catalog ?? CATALOG);
      const pieces = matched && (reference ? { ...matched, reference } : matched);
      run.results[i] = { index: i, title: run.book.chapters[i], mood: mood(run, i, d), pieces };
      run.drafts[i] = null;
    }
  }

  async function pieceStep(run: Run) {
    const pending: number[] = [];
    for (let i = 0; i < run.book.chapters.length && pending.length < PIECE_CHAPTERS_PER_STEP; i++) {
      if (run.drafts[i] && !run.results[i]) pending.push(i);
    }
    if (pending.length) await piecesFor(run, pending);
    if (!run.drafts.some(Boolean)) run.phase = "done";
  }

  async function finish(run: Run): Promise<void> {
    const chapters = run.results.map((r, i) => r ?? unscored(run, i));
    const next: BookResult = { key: run.key, chapters, model: deps.model.model, version: SCORER_VERSION, scoredAt: now(), costUsd: run.costUsd };
    await store.put(RESULT, next);
    // The search snippets go with the run: only the findings and their links are kept (Open questions 4).
    await store.put(JOB, { ...run, state: "done", phase: "done", queries: [], sources: [], drafts: [], step: run.steps } satisfies Run);
    try {
      await deps.onFinish?.({ key: run.key, book: run.book, prescore: !!run.prescore }, next);
    } catch {
      // The index is a convenience for Browse; the scored book is cached either way.
    }
  }

  /** A waiting run with progress picks up where it stopped (a pre-score run paused mid-way); else it starts afresh. */
  const resumed = (run: Run): Run =>
    run.step > 0 ? { ...run, state: "running", attempts: 0 } : freshRun(run.key, run.book, "running", !!run.prescore);

  const rescoreMinAgeMs = deps.rescoreMinAgeMs ?? DEFAULT_RESCORE_MIN_AGE_DAYS * DAY_MS;

  return {
    /**
     * Starts the book's job, or answers its cached result or the run already going. `opts.client` names the caller
     * only for the limiter, which keeps no more than a salted hash of it for the hour; it is never stored here.
     * `opts.prescore` marks the owner's pre-score run (05.10), which the per-client limiter never counts.
     */
    async start(key: string, book: BookRequest, rescore = false, opts: { prescore?: boolean; client?: string } = {}): Promise<Started> {
      const prescore = !!opts.prescore && !rescore;
      const [run, result] = await load();
      if (run && run.state === "running") {
        // A listener asking for a book being pre-scored takes the run over (05.10): it is no longer paused at the half.
        if (run.prescore && !prescore) await store.put(LISTENER, true);
        return { view: view(key, run, result)!, run: false };
      }
      if (result && !rescore) return { view: view(key, undefined, result)!, run: false };
      if (result && rescore) {
        const age = now() - result.scoredAt;
        if (age < rescoreMinAgeMs) return { refused: { reason: "rescore-too-soon", retryAfterMs: rescoreMinAgeMs - age } };
      }
      // A pre-score run paused at the half keeps its progress for whoever asks next, while their budget allows. It is
      // not a new run, so taking it over never asks the limiter.
      if (run && run.state === "capped" && run.step > 0 && run.prescore) {
        if (!prescore) await store.put(LISTENER, true);
        if (!(await mayRun(await prescoring(run)))) return { view: view(key, run, result)!, run: false };
        const going = resumed(run);
        await store.put(JOB, going);
        return { view: view(key, going, result)!, run: true };
      }
      if (deps.limiter && !prescore) {
        const admitted = await deps.limiter.admit(opts.client ?? UNKNOWN_CLIENT, now());
        if (!admitted.ok) return { refused: { reason: admitted.reason, retryAfterMs: admitted.retryAfterMs } };
      }
      return begin(key, book, result, prescore);
    },

    /** The job as it stands; a capped job starts here once the month's spend is under the cap again. */
    async status(): Promise<{ view: JobView | null; run: boolean }> {
      const [run, result] = await load();
      if (run && run.state === "capped" && (await mayRun(await prescoring(run)))) {
        const going = resumed(run);
        await store.put(JOB, going);
        return { view: view(run.key, going, result), run: true };
      }
      return { view: view(run?.key ?? result?.key ?? "", run, result), run: false };
    },

    /** Runs one step of a running job. `more` asks for another step after `delayMs`. */
    async step(): Promise<{ more: boolean; delayMs: number }> {
      const run = await store.get<Run>(JOB);
      if (!run || run.state !== "running") return { more: false, delayMs: 0 };
      // A pre-score step runs only while pre-scoring's half has room for it (prescore.ts); else the run waits.
      if ((await prescoring(run)) && !(await mayRun(true))) {
        await store.put(JOB, { ...run, state: "capped" } satisfies Run);
        return { more: false, delayMs: 0 };
      }
      try {
        if (run.phase === "text") await textPhase(run);
        else if (run.phase === "search") await searchStep(run);
        else if (run.phase === "moods") await moodStep(run);
        else if (run.phase === "pieces") await pieceStep(run);
        run.step += 1;
        run.attempts = 0;
        if (run.phase === "done") {
          await finish(run);
          return { more: false, delayMs: 0 };
        }
        run.steps = Math.max(run.steps, run.step + 1);
        await store.put(JOB, run);
        return { more: true, delayMs: 0 };
      } catch (e) {
        // The step's paid calls so far are already on the meter; the run's own copy of what it cost is kept too.
        const saved = (await store.get<Run>(JOB)) ?? run;
        saved.costUsd = run.costUsd;
        saved.attempts = (saved.attempts ?? 0) + 1;
        saved.error = e instanceof Error ? e.message : String(e);
        if (saved.attempts >= MAX_ATTEMPTS) {
          await store.put(JOB, { ...saved, state: "failed", queries: [], sources: [], drafts: [] } satisfies Run);
          return { more: false, delayMs: 0 };
        }
        await store.put(JOB, saved);
        return { more: true, delayMs: RETRY_DELAY_MS };
      }
    },
  };
}

export type BookJob = ReturnType<typeof createBookJob>;
