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
  /** Mood Read's bed beside another app (01.14 brings the behaviour). Off by default. */
  companionMode: boolean;
  defaultSoundscapeId: string | null;
};

// Chapter moods and named pieces (spec 01, Contracts; 01.2): what the scoring proxy returns and the device keeps.
// The proxy keeps its own copy in proxy/src/contract.ts; src/lib/scoring-contract.test.ts holds the two in step.

export const EMOTIONS = ["tension", "sorrow", "wonder", "joy", "dread", "calm", "romance", "triumph"] as const;
export type Emotion = (typeof EMOTIONS)[number];

export type EmotionScore = { emotion: Emotion; intensity: number };

/** A cited source: its link and page title, never a copy of its text. */
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
};

/**
 * What the device keeps per chapter. `playlist` is null when the mood is `too-little` (unscored), and when the
 * emotions were found but no piece passed the no-vocals checks (A20).
 */
export type ChapterScore = { mood: ChapterMood; pieces: Piece[]; playlist: ChapterPlaylist | null };

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

export type RemoteChapter = {
  index: number;
  title: string;
  mood: ChapterMood;
  pieces: { piece: Piece; alternates: Piece[] } | null;
};

export type JobView = {
  jobId: string;
  state: JobState;
  progress: JobProgress;
  result?: { key: string; chapters: RemoteChapter[]; model: string; version: string; scoredAt: number; costUsd: number };
};

/** The scoring job as the device remembers it per book, so it resumes after the app closes (A15). */
export type ScoringJob = {
  jobId: string | null;
  /** `unreachable`: the proxy could not be reached; the listener may try again. */
  state: JobState | "unreachable";
  progress: JobProgress;
  rescore: boolean;
  startedAt: number;
  updatedAt: number;
};
