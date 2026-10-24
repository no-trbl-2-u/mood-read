// The scoring proxy's contract (spec 01, Contracts; chunk 01.2): what the app sends, what a job reports and what a
// scored book holds. The app keeps its own copy of these shapes in src/lib/types.ts; src/lib/scoring-contract.test.ts
// holds the two in step. The proxy receives a book's title, author and chapter titles and nothing more (agents.md
// rule 6), and returns emotions, cited source links and named pieces, never a chapter's events (Open questions 7).

/** The fixed emotion set the agent names (spec 01, Mood scoring; the same list as src/ui/theme.ts). */
export const EMOTIONS = ["tension", "sorrow", "wonder", "joy", "dread", "calm", "romance", "triumph"] as const;
export type Emotion = (typeof EMOTIONS)[number];

export const PIECE_KINDS = ["score", "instrumental", "ambient"] as const;
export type PieceKind = (typeof PIECE_KINDS)[number];

/** Bumped when the research or naming changes enough that a cached book should read as older work. */
export const SCORER_VERSION = "01.2.1";

/** Everything the proxy accepts about a book: exactly these three fields. */
export type BookRequest = {
  title: string;
  author: string;
  /** The audiobook's chapter titles, in play order. */
  chapters: string[];
};

export type EmotionScore = { emotion: Emotion; intensity: number };

/** A cited source: its link and the page title, never a copy of its text. */
export type SourceLink = { url: string; title: string };

export type ChapterMood = {
  chapterIndex: number;
  chapterTitle: string;
  /** Strongest first; empty when coverage is `too-little`. */
  emotions: EmotionScore[];
  sources: SourceLink[];
  coverage: "scored" | "too-little";
  model: string;
  version: string;
  /** ms since epoch. */
  scoredAt: number;
};

export type Piece = {
  id: string;
  title: string;
  /** The composer or artist. */
  artist: string;
  kind: PieceKind;
  vocals: "none";
  moodTags: Emotion[];
};

/** The named piece that loops for the whole chapter, and its alternates (two or more). */
export type ChapterPieces = { piece: Piece; alternates: Piece[] };

export type ChapterResult = {
  index: number;
  title: string;
  mood: ChapterMood;
  /**
   * Null when the mood is `too-little` (an unscored chapter names no piece), and when the emotions were found but too
   * few pieces passed the no-vocals checks (A20): the mood stays `scored`, no piece is named.
   */
  pieces: ChapterPieces | null;
};

export type BookResult = {
  /** The cache key, also the job id. */
  key: string;
  chapters: ChapterResult[];
  model: string;
  version: string;
  scoredAt: number;
  /** What the run cost in US dollars, so the owner can see the cost per book. */
  costUsd: number;
};

export type JobState = "running" | "done" | "capped" | "failed";

export type JobProgress = {
  step: number;
  steps: number;
  /** Chapters whose result is final (scored with pieces, or unscored). */
  chaptersDone: number;
  chapters: number;
};

/** What POST /v1/score, POST /v1/rescore and GET /v1/jobs/:id answer. */
export type JobView = {
  jobId: string;
  state: JobState;
  progress: JobProgress;
  /** Present when `state` is `done`: the book's scored chapters. */
  result?: BookResult;
};
