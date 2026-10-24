// Fakes of the two paid services for the proxy's tests (and nothing else): a search engine with canned hits and a
// model that answers each structured request by its schema name. No test reaches the network.
import type { Completion, CompletionRequest, ModelClient, SearchClient, SearchHit } from "./clients.ts";
import type { Emotion } from "./contract.ts";

export function fakeSearch(hitsFor: (q: string) => SearchHit[] = defaultHits): SearchClient & { queries: string[] } {
  const queries: string[] = [];
  return {
    queries,
    async search(q) {
      queries.push(q);
      return hitsFor(q);
    },
  };
}

export function defaultHits(q: string): SearchHit[] {
  const slug = q.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return [
    { url: `https://summaries.example/${slug}`, title: `Summary: ${q}`, snippet: `What readers say about ${q}.` },
    { url: `https://reviews.example/${slug}`, title: `Review: ${q}`, snippet: `A review touching ${q}.` },
  ];
}

export type FakeModelOptions = {
  /** Chapter titles (as listed to the model) the sources say too little about. */
  thin?: string[];
  /** Emotions given to every scored chapter. */
  emotions?: { emotion: Emotion; intensity: number }[];
  /**
   * Scenes per chapter title (as listed to the model), for chapters the sources describe as a sequence; every other
   * scored chapter comes back with no scenes (one scene, the chapter). Raw, as a model might answer: the proxy
   * cleans them (src/validate.ts cleanScenes).
   */
  scenes?: Record<string, unknown[]>;
  /** Piece titles the second vocals check says have vocals. */
  vocalByCheck?: string[];
  /** How many clean candidates each chapter gets per round (besides the two planted vocal ones). */
  clean?: number;
  /** Throws on the nth call (1-based), once. */
  failOnCall?: number;
  usage?: { input: number; output: number };
};

const chapterLines = (user: string) =>
  [...user.matchAll(/^(\d+)\. (.+)$/gm)].map((m) => ({ n: Number(m[1]), title: m[2] }));

export function fakeModel(opts: FakeModelOptions = {}): ModelClient & { calls: CompletionRequest[] } {
  const calls: CompletionRequest[] = [];
  const emotions = opts.emotions ?? [
    { emotion: "tension", intensity: 0.8 },
    { emotion: "dread", intensity: 0.5 },
  ];
  let round = 0;
  return {
    model: "gpt-5-mini",
    calls,
    async complete(req): Promise<Completion> {
      calls.push(req);
      if (opts.failOnCall === calls.length) throw new Error("model unavailable");
      const usage = opts.usage ?? { input: 1000, output: 200 };
      if (req.name === "chapter_moods") {
        const ids = [...req.user.matchAll(/^\[(S\d+)\]/gm)].map((m) => m[1]);
        const chapters = chapterLines(req.user).map(({ n, title }) =>
          (opts.thin ?? []).includes(title)
            ? { sourceTitle: title, sourceNumber: n, coverage: "too-little", emotions: [], sourceIds: [] }
            : { sourceTitle: title, sourceNumber: n, coverage: "scored", emotions, scenes: opts.scenes?.[title] ?? [], sourceIds: ids.slice(0, 2) },
        );
        return { value: { chapters }, usage };
      }
      if (req.name === "chapter_pieces") {
        round += 1;
        const lines = [...req.user.matchAll(/^Chapter (\d+):(.*)$/gm)].map((m) => ({ n: Number(m[1]), rest: m[2] }));
        const tags = emotions.map((e) => e.emotion);
        return {
          value: {
            chapters: lines.map(({ n, rest }) => {
              // A chapter asked with scenes gets one clean candidate per scene emotion the chapter does not carry, and
              // the two planted vocal ones carry those emotions too, so a test sees them refused for a scene as well.
              const scene = /Scenes in order: (.*?)\. Suggest/.exec(rest)?.[1] ?? "";
              const extra = [...new Set([...scene.matchAll(/([a-z]+) \d/g)].map((m) => m[1] as Emotion))].filter((e) => !tags.includes(e));
              return {
                chapter: n,
                candidates: [
                  { title: `Sung Thing ${n}`, artist: "A Singer", kind: "instrumental", vocals: "some", moodTags: [...tags, ...extra] },
                  { title: `Song for Ch ${n}`, artist: "Band", kind: "score", vocals: "none", moodTags: [...tags, ...extra] },
                  ...extra.map((e) => ({ title: `Scene Theme ${n}.${round} ${e}`, artist: "Scene Composer", kind: "ambient", vocals: "none", moodTags: [e] })),
                  ...Array.from({ length: opts.clean ?? 4 }, (_, k) => ({
                    title: `Theme ${n}.${round}.${k + 1}`,
                    artist: `Composer ${k + 1}`,
                    kind: (["score", "instrumental", "ambient"] as const)[k % 3],
                    vocals: "none",
                    moodTags: k === 0 ? tags : [tags[tags.length - 1]],
                  })),
                ],
              };
            }),
          },
          usage,
        };
      }
      if (req.name === "vocals_check") {
        const items = [...req.user.matchAll(/^(p\d+): "(.+)" by /gm)].map((m) => ({ id: m[1], title: m[2] }));
        return {
          value: { verdicts: items.map((i) => ({ id: i.id, verdict: (opts.vocalByCheck ?? []).includes(i.title) ? "has-vocals" : "instrumental" })) },
          usage,
        };
      }
      throw new Error(`unexpected request ${req.name}`);
    },
  };
}
