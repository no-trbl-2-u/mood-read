// Data shapes for the player and its scoring (spec 01, Contracts). Later chunks extend these (mix, catalog).

/** One audio file of a book, in play order. `ref` is resolved to a playable URI by the media store. */
export type BookFile = {
  ref: string;
  name: string;
  /** Seconds. */
  duration: number;
};

export type Chapter = {
  /** The book this chapter belongs to. */
  bookId: string;
  index: number;
  title: string;
  /** Which file this chapter plays from. */
  fileIndex: number;
  /** Seconds within the whole book's audio. */
  start: number;
  end: number;
};

/** Where a book came from (spec 05 Contracts): a listener's own file, or a LibriVox download (05.8), kept by its
 *  archive.org identifier so a re-download can look it back up, with its public LibriVox catalog number and its
 *  text's Project Gutenberg number when they are known (05.9): scoring sends both, and the proxy reads the text. */
export type BookSource =
  | { kind: "import" }
  | {
      kind: "librivox";
      librivoxId: string;
      /** LibriVox's own catalog number (archive.org's `call_number`), digits; absent on a book downloaded before 05.9. */
      catalogId?: string;
      /** The text's Project Gutenberg ebook number, digits, from LibriVox's catalog; absent when it has none. */
      gutenbergId?: string;
    };

export type Book = {
  id: string;
  title: string;
  author: string;
  narrator: string;
  /** The cover from the files' tags, as a stored ref (resolved by the media store), if any. */
  cover: string | null;
  files: BookFile[];
  chapters: Chapter[];
  /** Seconds, the sum of the files. */
  duration: number;
  addedAt: number;
  /** When the listener last opened it to play (ms since epoch); the library sorts on it. */
  lastPlayedAt: number | null;
  /** Spec 05 Contracts. */
  source: BookSource;
  /** Spec 05 Contracts: false once "Remove download" (05.7) has deleted its file; true for every book today. */
  onDevice: boolean;
};

export type Bookmark = {
  id: string;
  bookId: string;
  /** Seconds within the whole book. */
  position: number;
  name: string;
  createdAt: number;
};

export type SleepTimer =
  | { kind: 'minutes'; minutes: number; endsAt: number }
  | { kind: 'chapterEnd'; chapterIndex: number; end: number };

/** A bed loop (spec 01, Contracts). `loop` is a bundled asset (a `require` of a file in `assets/`) or a URI. */
export type Soundscape = {
  id: string;
  name: string;
  loop: number | string;
  /** The loop's length in seconds, so the bed can sit at the right place in it. */
  loopSeconds: number;
  /** What allows Mood Read to play it (A18). */
  license: string;
};

/**
 * The listener's settings (spec 06, Contracts), kept on the device. `defaultSoundscapeId` is what a book with no
 * layer of its own plays (src/lib/bed.ts defaultBedFor): null for 01.7's default (Night Wind), `"off"`
 * (SOUNDSCAPE_OFF in ./settings-store.ts) for no bed, else a bundled loop's id.
 */
export type Settings = {
  /** Downloads wait for Wi-Fi (05.6 reads it). On by default. */
  wifiOnly: boolean;
  /** Mood Read's bed beside another app, no narration (01.14, src/lib/companion.ts). Off by default. */
  companionMode: boolean;
  /** In companion mode, the bed moves on by the book's chapter lengths; off, it waits for a tap. Off by default. */
  companionTimer: boolean;
  defaultSoundscapeId: string | null;
  /**
   * "Share what fits" (07.5, spec 07 A6): the listener's verdicts go to the proxy as daily aggregate rows
   * (src/lib/verdict-sync.ts). On by default; a saved record without it reads on. Verdicts stay on the device either way.
   */
  shareVerdicts: boolean;
};

// Chapter moods and named pieces (spec 01, Contracts; 01.2): what the scoring proxy returns and the device keeps.
// The proxy keeps its own copy in proxy/src/contract.ts; src/lib/scoring-contract.test.ts holds the two in step.

export const EMOTIONS = ["tension", "sorrow", "wonder", "joy", "dread", "calm", "romance", "triumph"] as const;
export type Emotion = (typeof EMOTIONS)[number];

export type EmotionScore = { emotion: Emotion; intensity: number };

/** A cited source: its link and page title, never a copy of its text. */
export type SourceLink = { url: string; title: string };

/** Scenes per chapter, at most (spec 07, Decisions). */
export const MAX_SCENES = 4;
/** A scene's span is a multiple of this; a span under MIN_SCENE_SPAN is merged into its neighbour. */
export const SCENE_SPAN_STEP = 0.05;
export const MIN_SCENE_SPAN = 0.1;

/**
 * One part of a chapter, in order (spec 07, 07.1): its own emotions and its span, the fraction of the chapter it
 * covers; a chapter's spans sum to 1. A scene carries no text (A21), only emotions and a span.
 */
export type Scene = { emotions: EmotionScore[]; span: number };

/** What the research found for a chapter: the only coverages the proxy ever sends (proxy/src/contract.ts). */
export type ResearchCoverage = "scored" | "too-little";

/**
 * A chapter's mood. `coverage: "listener"` (07.6, spec 07 A7) is a mood the listener seeded on the device ("Set the
 * mood", src/lib/mood-match.ts): no sources, kept apart from the research (`seeds:<book id>`, src/lib/scoring-store.ts),
 * never sent anywhere and never received from the proxy.
 */
export type ChapterMood = {
  chapterIndex: number;
  chapterTitle: string;
  /** The whole chapter's, strongest first; empty when coverage is `too-little`. */
  emotions: EmotionScore[];
  /**
   * The chapter's scenes in order (1 to MAX_SCENES) when scored. Absent on a `too-little` chapter and on a book
   * scored before 07.1: read it through `scenesOf` (src/lib/scenes.ts), which gives one scene equal to the chapter.
   */
  scenes?: Scene[];
  sources: SourceLink[];
  coverage: ResearchCoverage | "listener";
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
  kind: "score" | "instrumental" | "ambient";
  /** Always none (A20). */
  vocals: "none";
  moodTags: Emotion[];
};

/** The chapter's one named piece that loops for it, two or more alternates, and the listener's pick (01.4) or auto. */
export type ChapterPlaylist = {
  chapterIndex: number;
  piece: string;
  alternates: string[];
  pick: "auto" | string;
  /**
   * One piece id per scene, the same length as the mood's `scenes` (07.1). Absent on a book scored before 07.1: read
   * it through `scenePiecesOf` (src/lib/scenes.ts), which gives the chapter's piece for every scene.
   */
  scenePieces?: string[];
};

/**
 * The listener's say on a chapter's playing piece (07.4, spec 07 A5): "Fits" or "Doesn't fit", kept on the device per
 * book (`verdicts:<book id>`, src/lib/verdict-store.ts), at most one per chapter and piece. `at` is when it was given,
 * in epoch ms; it never leaves the device (07.5 sends only aggregate rows with no book, chapter or time).
 */
export type PieceVerdict = { chapterIndex: number; pieceId: string; verdict: "fits" | "misfit"; at: number };

/**
 * One verdict as the device sends it to the proxy (07.5, spec 07 A6; POST /v1/verdicts, proxy/src/contract.ts): the
 * piece, the chapter's emotion set (names only) and the verdict. No book, chapter, device, position or time.
 */
export type VerdictRow = { pieceId: string; emotions: Emotion[]; verdict: PieceVerdict["verdict"] };

/** The body of POST /v1/verdicts: exactly `rows`, 1 to MAX_VERDICT_ROWS of them. */
export type VerdictBatch = { rows: VerdictRow[] };

/** Rows per POST /v1/verdicts, at most (the proxy refuses more). */
export const MAX_VERDICT_ROWS = 200;

/**
 * One line of "Your soundtrack" (07.8, spec 07 A9): a piece that has played for a reached chapter of a book, logged on
 * the device the first time it does (`soundtrack`, src/lib/soundtrack-store.ts). Never a time or a position.
 */
export type SoundtrackEntry = { bookId: string; pieceId: string };

/**
 * What the device keeps per chapter. `playlist` is null when the mood is `too-little` (unscored), and when the
 * emotions were found but no piece fits them. From v2 (05.3, A3) every piece in `pieces` and every id in `playlist` is
 * a catalog piece; a book scored before v2 is re-matched on the device (src/lib/catalog-match.ts rematchScores).
 * `reference` is the famous no-vocals piece the research named beside the catalog pick, shown only as "In the spirit
 * of" and never played (D13): never in `pieces`, never in `playlist`.
 */
export type ChapterScore = { mood: ChapterMood; pieces: Piece[]; playlist: ChapterPlaylist | null; reference?: Piece };

export type BookScores = {
  /** The proxy's job id for the book (its cache key). */
  jobId: string;
  model: string;
  version: string;
  scoredAt: number;
  costUsd: number;
  chapters: ChapterScore[];
};

// ---- what the proxy answers (proxy/src/contract.ts JobView) ----

export type JobState = "running" | "done" | "capped" | "failed";

export type JobProgress = { step: number; steps: number; chaptersDone: number; chapters: number };

/** A chapter mood as the research returns it: never a listener's seed (07.6). */
export type ResearchMood = ChapterMood & { coverage: ResearchCoverage };

export type RemoteChapter = {
  index: number;
  title: string;
  mood: ResearchMood;
  /**
   * `scenePieces`: one per scene, in order, when the mood has scenes (07.1). From v2 (05.3) the piece, alternates and
   * scene pieces are catalog pieces; `reference` is the famous piece shown as "In the spirit of", never played (D13).
   */
  pieces: { piece: Piece; alternates: Piece[]; scenePieces?: Piece[]; reference?: Piece } | null;
};

export type JobView = {
  jobId: string;
  state: JobState;
  progress: JobProgress;
  /** Always when `done`; also while a rescore runs, waits or has failed, since the old result stands meanwhile. */
  result?: { key: string; chapters: RemoteChapter[]; model: string; version: string; scoredAt: number; costUsd: number };
};

/**
 * Why the proxy said "try later" with a 429 (01.21, A34; proxy/src/limiter.ts RefusalReason): too many new runs from
 * this connection this hour, too many from everyone this hour, or a rescore of a result still too young.
 */
export type BusyReason = "client-limit" | "global-limit" | "rescore-too-soon";

/** The scoring job as the device remembers it per book, so it resumes after the app closes (A15). */
export type ScoringJob = {
  jobId: string | null;
  /**
   * `unreachable`: the proxy could not be reached; the listener may try again. `waiting`: the proxy said try later
   * (a 429, A38); nothing is sent for this book before `waitUntil`.
   */
  state: JobState | "unreachable" | "waiting";
  progress: JobProgress;
  rescore: boolean;
  startedAt: number;
  updatedAt: number;
  /** While `waiting`: when the proxy takes the book again (epoch ms, from Retry-After), and why it said no. */
  waitUntil?: number;
  waitReason?: BusyReason;
};

// ---- the download queue (spec 05, 05.6, A6): one queue for a whole book and a catalog piece alike ----

/**
 * What a download moves: a whole book (05.4, 05.8) or one catalog piece (05.1). Both are ids only; neither the
 * music catalog nor LibriVox browsing exists yet (05.1-05.4, 05.8), so nothing resolves these to a source today
 * (src/lib/download-queue.ts's `Transfer` is injected for exactly that reason).
 */
export type DownloadTarget = { kind: "book"; bookId: string } | { kind: "piece"; pieceId: string };

export type DownloadState = "queued" | "running" | "paused" | "failed" | "done";

/** One item in the download queue (A6): its progress, and the backoff/retry state once it fails. */
export type Download = {
  id: string;
  target: DownloadTarget;
  state: DownloadState;
  /** Bytes moved so far. */
  bytes: number;
  /** The transfer's total size, once known; null before then (no `Content-Length`, or not started). */
  totalBytes: number | null;
  /** Set only in state `failed`; cleared the moment it queues again. */
  error: string | null;
  /** How many attempts have failed in a row; drives the backoff schedule (src/lib/download-queue.ts backoffMs). */
  attempts: number;
  queuedAt: number;
  updatedAt: number;
};
