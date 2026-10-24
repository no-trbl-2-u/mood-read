// Naming pieces (01.2, A14, A20): for each scored chapter, one film or game score, instrumental or ambient piece that
// fits its emotions and would loop for the whole chapter, plus at least two alternates. Nothing is played (v1 names
// pieces only). A piece with vocals (singing or spoken words) is never named, as the main piece or an alternate: a
// candidate is dropped when the model flags any vocals or is unsure, when its name trips the no-vocals screen, or
// when a second, separate check does not confirm it instrumental. Unclear counts as vocals (agents.md rule 6).
// A chapter with scenes (07.1) also gets one piece per scene, chosen from the same candidates after the same checks.
// 07.5: when the proxy answers a job view, a chapter's alternates are ordered by the listeners' verdicts (orderJobView).
import type { CompletionRequest, JsonSchema } from "./clients.ts";
import { EMOTIONS, PIECE_KINDS, type BookRequest, type ChapterPieces, type Emotion, type EmotionScore, type JobView, type Piece, type PieceKind, type Scene } from "./contract.ts";
import type { PieceCounts, VerdictCount } from "./store.ts";
import { emotionSetKey } from "./validate.ts";

/** Candidates asked for per chapter; at least three must survive the guard (one piece and two alternates). */
export const CANDIDATES_PER_CHAPTER = 6;
/** Extra candidates asked for per scene when a chapter has two or more, so each scene has some that fit it. */
export const CANDIDATES_PER_SCENE = 2;
export const MIN_ALTERNATES = 2;
export const MAX_ALTERNATES = 4;

export type Candidate = {
  title: string;
  artist: string;
  kind: PieceKind;
  vocals: "none" | "some" | "unsure";
  moodTags: Emotion[];
};

/** One chapter's ask: its emotions and, from 07.1, its scenes (absent or one scene: the chapter alone). */
export type ChapterAsk = { index: number; emotions: EmotionScore[]; exclude: string[]; scenes?: Scene[] };

const sequence = (a: ChapterAsk): Scene[] => (a.scenes && a.scenes.length > 1 ? a.scenes : []);

/** How many candidates a chapter is asked for, and read: more when it has scenes. */
export function candidateCount(a: ChapterAsk): number {
  return CANDIDATES_PER_CHAPTER + sequence(a).length * CANDIDATES_PER_SCENE;
}

/** Every emotion a chapter's candidates may fit: the chapter's own and its scenes'. */
export function askEmotions(a: ChapterAsk): EmotionScore[] {
  const best = new Map<Emotion, number>();
  for (const e of [...a.emotions, ...sequence(a).flatMap((s) => s.emotions)]) best.set(e.emotion, Math.max(best.get(e.emotion) ?? 0, e.intensity));
  return [...best].map(([emotion, intensity]) => ({ emotion, intensity }));
}

const candidateSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["chapters"],
  properties: {
    chapters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["chapter", "candidates"],
        properties: {
          chapter: { type: "integer" },
          candidates: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "artist", "kind", "vocals", "moodTags"],
              properties: {
                title: { type: "string" },
                artist: { type: "string" },
                kind: { type: "string", enum: [...PIECE_KINDS] },
                vocals: { type: "string", enum: ["none", "some", "unsure"] },
                moodTags: { type: "array", items: { type: "string", enum: [...EMOTIONS] } },
              },
            },
          },
        },
      },
    },
  },
};

const describe = (e: EmotionScore[]) => e.map((x) => `${x.emotion} ${x.intensity}`).join(", ");

export function candidateRequest(book: BookRequest, asks: ChapterAsk[]): CompletionRequest {
  const lines = asks.map((a) => {
    const ex = a.exclude.length ? ` Do not suggest: ${a.exclude.join("; ")}.` : "";
    const seq = sequence(a);
    const sc = seq.length ? ` Scenes in order: ${seq.map((s, k) => `${k + 1}) ${describe(s.emotions)}`).join("; ")}. Suggest ${candidateCount(a)} pieces, some for each scene.` : "";
    return `Chapter ${a.index + 1}: ${describe(a.emotions)}.${sc}${ex}`;
  });
  return {
    name: "chapter_pieces",
    schema: candidateSchema,
    system: [
      "You suggest existing recorded music to loop quietly under an audiobook chapter, matched to the chapter's emotions.",
      `For each chapter suggest ${CANDIDATES_PER_CHAPTER} real, well-known pieces: film or game scores (kind score), instrumentals (kind instrumental) or ambient pieces (kind ambient).`,
      "Every piece must be fully instrumental: no singing, no choir, no humming, no spoken words or samples of speech, in any well-known recording.",
      "Set vocals to none only if you are sure; otherwise some or unsure.",
      `Tag each piece with the emotions it fits, from: ${EMOTIONS.join(", ")}.`,
      "When a chapter lists its scenes, include pieces that fit each scene's emotions, under the same rules.",
      "Give the title and the composer or artist exactly as the recording is credited. Answer with the chapter numbers given.",
    ].join(" "),
    user: `Book: ${book.title}${book.author ? ` by ${book.author}` : ""}\n\n${lines.join("\n")}`,
  };
}

/** Reads the candidates per chapter number (1-based in the answer, 0-based in the result). Malformed entries are dropped. */
export function parseCandidates(value: unknown): Map<number, Candidate[]> {
  const out = new Map<number, Candidate[]>();
  const list = (value as { chapters?: unknown })?.chapters;
  if (!Array.isArray(list)) return out;
  for (const c of list) {
    const r = c as { chapter?: unknown; candidates?: unknown };
    if (typeof r?.chapter !== "number" || !Array.isArray(r.candidates)) continue;
    const items: Candidate[] = [];
    for (const raw of r.candidates) {
      const p = raw as Record<string, unknown>;
      if (typeof p?.title !== "string" || typeof p.artist !== "string" || !p.title.trim() || !p.artist.trim()) continue;
      if (typeof p.kind !== "string" || !(PIECE_KINDS as readonly string[]).includes(p.kind)) continue;
      const vocals = p.vocals === "none" || p.vocals === "some" ? p.vocals : "unsure";
      const tags = Array.isArray(p.moodTags) ? [...new Set(p.moodTags.filter((t): t is Emotion => typeof t === "string" && (EMOTIONS as readonly string[]).includes(t)))] : [];
      items.push({ title: p.title.trim(), artist: p.artist.trim(), kind: p.kind as PieceKind, vocals, moodTags: tags });
    }
    out.set(r.chapter - 1, [...(out.get(r.chapter - 1) ?? []), ...items]);
  }
  return out;
}

/**
 * The no-vocals screen on a name: words that mark a song, a voice or a choir drop the candidate. It errs towards
 * dropping (an instrumental called "Song of the Sea" goes too): a lost candidate costs a retry, a vocal piece breaks A20.
 * Words match whole with their plurals ("Ballads", "Lullabies", "Requiems"), alongside vocal works known by name
 * ("Ave Maria", "Carmina Burana", "Lacrimosa", "Nessun Dorma") and humming, which the candidate prompt counts as
 * vocals; a near spelling that is an instrumental form ("Ballade", "Humoresque") is left to the model checks.
 */
const VOCAL_WORDS =
  /\b(?:feat\.?|ft\.|featuring|vocals?|vocalises?|voices?|singers?|sings?|sung|singing|song\w*|lyrics?|choir\w*|choral|chorus|choruses|chorales?|chants?|cantatas?|oratorios?|arias?|operas?|operettas?|lieder|lied|hymns?|hymnal|gospel|anthems?|madrigals?|motets?|requiems?|mass|masses|a ?cappella|acapella|rap|spoken|narrat\w*|poems?|poetry|recitations?|monologues?|speech|lullab(?:y|ies)|ballads?|duets?|psalms?|hallelujah|alleluia|ave maria|carmina burana|stabat mater|agnus dei|te deum|kyrie|magnificat|miserere|vespers|canticles?|carols?|shant(?:y|ies)|spirituals?|hum|hums|humm\w*|lacrimosa|o fortuna|nessun dorma|gloria|sanctus|benedictus|dies irae|ode to joy|libera me|pie jesu|panis angelicus|ave verum|casta diva|lascia ch.io pianga|furtiva lagrima|queen of the night|aeternam)\b/i;

export function failsNoVocalsScreen(c: Pick<Candidate, "title" | "artist">): boolean {
  return VOCAL_WORDS.test(c.title) || VOCAL_WORDS.test(c.artist);
}

export const nameKey = (c: Pick<Candidate, "title" | "artist">) =>
  `${c.title} | ${c.artist}`.normalize("NFKD").toLowerCase().replace(/[^a-z0-9|]+/g, "");

/** The first guard: the model's own flag, the name screen, the chapter's emotions (A14), and one entry per piece. */
export function firstGuard(candidates: Candidate[], emotions: EmotionScore[], rejected: Set<string>): Candidate[] {
  const wanted = new Set(emotions.map((e) => e.emotion));
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const c of candidates) {
    const key = nameKey(c);
    if (seen.has(key) || rejected.has(key)) continue;
    seen.add(key);
    if (c.vocals !== "none" || failsNoVocalsScreen(c) || !c.moodTags.some((t) => wanted.has(t))) {
      rejected.add(key);
      continue;
    }
    out.push(c);
  }
  return out;
}

// ---- the second, separate vocals check ----

const verdictSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["verdicts"],
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "verdict"],
        properties: { id: { type: "string" }, verdict: { type: "string", enum: ["instrumental", "has-vocals", "unsure"] } },
      },
    },
  },
};

export function vocalsCheckRequest(items: { id: string; title: string; artist: string }[]): CompletionRequest {
  return {
    name: "vocals_check",
    schema: verdictSchema,
    system: [
      "You check recorded music for vocals. For each piece, answer instrumental only if its well-known recordings contain no singing,",
      "no choir, no humming, no vocalise and no spoken words or speech samples. Answer has-vocals if any does, and unsure if you do not",
      "know the piece or are not certain. Answer for every id given.",
    ].join(" "),
    user: items.map((i) => `${i.id}: "${i.title}" by ${i.artist}`).join("\n"),
  };
}

/** The ids the check confirmed instrumental; a missing or unsure verdict is a no. */
export function confirmedInstrumental(value: unknown): Set<string> {
  const ok = new Set<string>();
  const list = (value as { verdicts?: unknown })?.verdicts;
  if (!Array.isArray(list)) return ok;
  for (const v of list) {
    const r = v as { id?: unknown; verdict?: unknown };
    if (typeof r?.id === "string" && r.verdict === "instrumental") ok.add(r.id);
  }
  return ok;
}

// ---- choosing ----

const slug = (s: string) => s.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function toPiece(c: Candidate): Piece {
  return { id: `${slug(c.artist)}--${slug(c.title)}`, title: c.title, artist: c.artist, kind: c.kind, vocals: "none", moodTags: c.moodTags };
}

/** How well a piece's tags fit a chapter: the summed intensity of the emotions they share. */
export function fit(c: Pick<Candidate, "moodTags">, emotions: EmotionScore[]): number {
  return emotions.filter((e) => c.moodTags.includes(e.emotion)).reduce((s, e) => s + e.intensity, 0);
}

/**
 * The chapter's piece (the best fit; ties keep the model's order) and its alternates, from candidates that passed
 * every guard and fit the chapter's own emotions (a candidate that only fits a scene stays a scene's). Null when
 * fewer than one piece plus two alternates are left.
 */
export function choosePieces(passed: Candidate[], emotions: EmotionScore[]): ChapterPieces | null {
  const fitting = passed.filter((c) => fit(c, emotions) > 0);
  if (fitting.length < 1 + MIN_ALTERNATES) return null;
  const ranked = fitting.map((c, i) => ({ c, i, f: fit(c, emotions) })).sort((a, b) => b.f - a.f || a.i - b.i);
  const [first, ...rest] = ranked.map((r) => toPiece(r.c));
  return { piece: first, alternates: rest.slice(0, MAX_ALTERNATES) };
}

/**
 * One piece per scene, in order (07.1): the best fit for the scene's emotions among the chapter's piece, its
 * alternates and the other candidates that passed every guard (ties go to the chapter's piece, then the alternates,
 * then the model's order), so a scene's piece went through exactly the checks the chapter's did (A20). A scene
 * nothing fits plays the chapter's piece; a chapter with one scene plays its own piece.
 */
export function chooseScenePieces(passed: Candidate[], scenes: Scene[], chosen: ChapterPieces): Piece[] {
  if (scenes.length <= 1) return scenes.map(() => chosen.piece);
  const pool: Piece[] = [chosen.piece, ...chosen.alternates];
  const ids = new Set(pool.map((p) => p.id));
  for (const c of passed) {
    const p = toPiece(c);
    if (!ids.has(p.id)) {
      ids.add(p.id);
      pool.push(p);
    }
  }
  return scenes.map((s) => {
    let best: Piece = chosen.piece;
    let bestFit = 0;
    for (const p of pool) {
      const f = fit(p, s.emotions);
      if (f > bestFit + 1e-9) {
        best = p;
        bestFit = f;
      }
    }
    return best;
  });
}

// ---- ordering by the listeners' verdicts (07.5, spec 07 A6) ----

/** A piece is demoted once it has at least this many verdicts for the emotion set... */
export const DEMOTE_MIN_VERDICTS = 10;
/** ...and its misfits are at least this many times its fits ("two to one"). */
export const DEMOTE_RATIO = 2;

/** Demoted: misfits outnumber fits two to one across at least ten verdicts. */
export function demoted(c: VerdictCount | undefined): boolean {
  return !!c && c.fits + c.misfits >= DEMOTE_MIN_VERDICTS && c.misfits >= DEMOTE_RATIO * c.fits;
}

/** How well kept a piece is for an emotion set: its fits minus its misfits (0 with no verdicts). */
export const keptScore = (c: VerdictCount | undefined): number => (c ? c.fits - c.misfits : 0);

/**
 * A chapter's alternates in the listeners' order (07.5): the best-kept first (fits minus misfits for the chapter's
 * exact emotion set; a piece with no verdicts scores 0), every demoted piece after every other, ties in the scorer's
 * order. Only the order changes: no alternate is added or removed (spec 07, Decisions: verdicts never remove a piece
 * the scorer named), and the chapter's own piece and its scene pieces stay as the scorer chose them.
 */
export function orderAlternates(alternates: readonly Piece[], emotions: readonly Emotion[], counts: Record<string, PieceCounts>): Piece[] {
  const set = emotionSetKey(emotions);
  return alternates
    .map((p, i) => ({ p, i, c: counts[p.id]?.[set] }))
    .sort((a, b) => Number(demoted(a.c)) - Number(demoted(b.c)) || keptScore(b.c) - keptScore(a.c) || a.i - b.i)
    .map((x) => x.p);
}

/** The piece ids whose counts a job view's ordering reads: every scored chapter's alternates. */
export function alternateIds(view: JobView): string[] {
  return [...new Set((view.result?.chapters ?? []).flatMap((c) => (c.pieces ? c.pieces.alternates.map((p) => p.id) : [])))];
}

/** A job view with each chapter's alternates ordered by the counts (orderAlternates); everything else as it was. */
export function orderJobView(view: JobView, counts: Record<string, PieceCounts>): JobView {
  if (!view.result) return view;
  const chapters = view.result.chapters.map((c) =>
    c.pieces && c.pieces.alternates.length > 1
      ? { ...c, pieces: { ...c.pieces, alternates: orderAlternates(c.pieces.alternates, c.mood.emotions.map((e) => e.emotion), counts) } }
      : c,
  );
  return { ...view, result: { ...view.result, chapters } };
}
