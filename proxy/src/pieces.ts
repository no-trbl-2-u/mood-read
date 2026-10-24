// Naming pieces (01.2, A14, A20): for each scored chapter, one film or game score, instrumental or ambient piece that
// fits its emotions and would loop for the whole chapter, plus at least two alternates. Nothing is played (v1 names
// pieces only). A piece with vocals (singing or spoken words) is never named, as the main piece or an alternate: a
// candidate is dropped when the model flags any vocals or is unsure, when its name trips the no-vocals screen, or
// when a second, separate check does not confirm it instrumental. Unclear counts as vocals (agents.md rule 6).
import type { CompletionRequest, JsonSchema } from "./clients.ts";
import { EMOTIONS, PIECE_KINDS, type BookRequest, type ChapterPieces, type Emotion, type EmotionScore, type Piece, type PieceKind } from "./contract.ts";

/** Candidates asked for per chapter; at least three must survive the guard (one piece and two alternates). */
export const CANDIDATES_PER_CHAPTER = 6;
export const MIN_ALTERNATES = 2;
export const MAX_ALTERNATES = 4;

export type Candidate = {
  title: string;
  artist: string;
  kind: PieceKind;
  vocals: "none" | "some" | "unsure";
  moodTags: Emotion[];
};

export type ChapterAsk = { index: number; emotions: EmotionScore[]; exclude: string[] };

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
    return `Chapter ${a.index + 1}: ${describe(a.emotions)}.${ex}`;
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
export function fit(c: Candidate, emotions: EmotionScore[]): number {
  return emotions.filter((e) => c.moodTags.includes(e.emotion)).reduce((s, e) => s + e.intensity, 0);
}

/**
 * The chapter's piece (the best fit; ties keep the model's order) and its alternates, from candidates that passed
 * every guard. Null when fewer than one piece plus two alternates are left.
 */
export function choosePieces(passed: Candidate[], emotions: EmotionScore[]): ChapterPieces | null {
  if (passed.length < 1 + MIN_ALTERNATES) return null;
  const ranked = passed.map((c, i) => ({ c, i, f: fit(c, emotions) })).sort((a, b) => b.f - a.f || a.i - b.i);
  const [first, ...rest] = ranked.map((r) => toPiece(r.c));
  return { piece: first, alternates: rest.slice(0, MAX_ALTERNATES) };
}
