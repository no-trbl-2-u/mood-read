// One book's scoring job (01.2; spec 01 "Scoring is a job, not a play-time call"; A13, A15, A22). A job runs in
// small steps (a few searches, one reading of the sources, one batch of pieces), saving its state after each, so a
// step that dies is retried from where it stopped and nothing has to fit in one request. In production each book's
// job is its own Durable Object and a step is one alarm (index.ts); tests drive step() in a loop.
//
// - start: a book already scored returns its cached result with no new run, to any listener; a run already going
//   is returned as it stands; a new run starts only under the monthly cap, else the job waits as `capped` and starts
//   by itself once a status poll finds the month's spend under the cap again.
// - rescore is explicit: it starts a new run even for a cached book; the old result stays until the new one lands.
import type { ModelClient, SearchClient } from "./clients.ts";
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
import { BRAVE_USD_PER_QUERY, monthOf, openAiCost, underCap, type Meter } from "./meter.ts";
import {
  MIN_ALTERNATES,
  askEmotions,
  candidateCount,
  candidateRequest,
  choosePieces,
  chooseScenePieces,
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

export const SEARCHES_PER_STEP = 6;
export const MOOD_CHAPTERS_PER_STEP = 10;
export const PIECE_CHAPTERS_PER_STEP = 5;
/** Rounds of candidates per chapter before it is given up as unscored. */
export const PIECE_ROUNDS = 2;
/** Consecutive failures of one step before the run is marked failed. */
export const MAX_ATTEMPTS = 3;
export const RETRY_DELAY_MS = 30_000;

type Phase = "search" | "moods" | "pieces" | "done";
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
};

const JOB = "job";
const RESULT = "result";

export type JobDeps = {
  store: Store;
  meter: Meter;
  capUsd: number;
  search: SearchClient;
  model: ModelClient;
  now?: () => number;
};

export type Schedule = { view: JobView; run: boolean };

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

  function freshRun(key: string, book: BookRequest, state: JobState): Run {
    const queries = buildQueries(book);
    const run: Run = {
      key,
      book,
      state,
      phase: "search",
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
    };
    run.steps = estimateSteps(run);
    return run;
  }

  async function begin(key: string, book: BookRequest, result: BookResult | undefined): Promise<Schedule> {
    if (!(await underCap(meter, deps.capUsd, now()))) {
      const waiting = freshRun(key, book, "capped");
      await store.put(JOB, waiting);
      return { view: view(key, waiting, result)!, run: false };
    }
    const run = freshRun(key, book, "running");
    await store.put(JOB, run);
    return { view: view(key, run, result)!, run: true };
  }

  async function charge(run: Run, usd: number) {
    run.costUsd += usd;
    await meter.add(monthOf(now()), usd);
  }

  async function complete(run: Run, req: Parameters<ModelClient["complete"]>[0]) {
    const out = await deps.model.complete(req);
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

  async function piecesFor(run: Run, indices: number[]) {
    const passed = new Map<number, Candidate[]>(indices.map((i) => [i, []]));
    const rejected = new Map<number, Set<string>>(indices.map((i) => [i, new Set()]));
    for (let round = 0; round < PIECE_ROUNDS; round++) {
      const short = indices.filter((i) => passed.get(i)!.length < 1 + MIN_ALTERNATES);
      if (!short.length) break;
      const asks: ChapterAsk[] = short.map((i) => ({
        index: i,
        emotions: run.drafts[i]!.emotions,
        scenes: scenesOf(run.drafts[i]!),
        exclude: round === 0 ? [] : [...passed.get(i)!.map((c) => `${c.title} by ${c.artist}`)],
      }));
      const offered = parseCandidates(await complete(run, candidateRequest(run.book, asks)));
      const fresh: { i: number; c: Candidate; id: string }[] = [];
      for (const ask of asks) {
        const i = ask.index;
        const have = new Set(passed.get(i)!.map(nameKey));
        // A scene's candidates take the same guard as the chapter's: the flag, the name screen, the tags (A14, A20).
        const ok = firstGuard((offered.get(i) ?? []).slice(0, candidateCount(ask)), askEmotions(ask), rejected.get(i)!);
        for (const c of ok) if (!have.has(nameKey(c))) fresh.push({ i, c, id: `p${fresh.length + 1}` });
      }
      if (!fresh.length) continue;
      const confirmed = confirmedInstrumental(await complete(run, vocalsCheckRequest(fresh.map((f) => ({ id: f.id, title: f.c.title, artist: f.c.artist })))));
      for (const f of fresh) {
        if (confirmed.has(f.id)) passed.get(f.i)!.push(f.c);
        else rejected.get(f.i)!.add(nameKey(f.c));
      }
    }
    for (const i of indices) {
      const chosen = choosePieces(passed.get(i)!, run.drafts[i]!.emotions);
      // One piece per scene from the same checked candidates; a scene nothing fits plays the chapter's piece.
      const pieces = chosen && { ...chosen, scenePieces: chooseScenePieces(passed.get(i)!, scenesOf(run.drafts[i]!), chosen) };
      // A chapter with too few pieces that passed every guard names none, never a vocal piece (A20), but keeps the
      // emotions the research found and their sources (A13): its mood is scored, only its pieces are missing.
      run.results[i] = { index: i, title: run.book.chapters[i], mood: mood(run, i, run.drafts[i]), pieces };
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
  }

  return {
    async start(key: string, book: BookRequest, rescore = false): Promise<Schedule> {
      const [run, result] = await load();
      if (run && run.state === "running") return { view: view(key, run, result)!, run: false };
      if (result && !rescore) return { view: view(key, undefined, result)!, run: false };
      return begin(key, book, result);
    },

    /** The job as it stands; a capped job starts here once the month's spend is under the cap again. */
    async status(): Promise<{ view: JobView | null; run: boolean }> {
      const [run, result] = await load();
      if (run && run.state === "capped" && (await underCap(meter, deps.capUsd, now()))) {
        const resumed = freshRun(run.key, run.book, "running");
        await store.put(JOB, resumed);
        return { view: view(run.key, resumed, result), run: true };
      }
      return { view: view(run?.key ?? result?.key ?? "", run, result), run: false };
    },

    /** Runs one step of a running job. `more` asks for another step after `delayMs`. */
    async step(): Promise<{ more: boolean; delayMs: number }> {
      const run = await store.get<Run>(JOB);
      if (!run || run.state !== "running") return { more: false, delayMs: 0 };
      try {
        if (run.phase === "search") await searchStep(run);
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
