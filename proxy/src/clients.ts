// The two paid services the research agent calls, behind small injected clients (01.2): Brave Search for finding
// what is written about a book, OpenAI for reading it into emotions and naming pieces. The job sees only these
// interfaces, so tests pass fakes and nothing in a test reaches the network. The real clients read their keys from
// the Worker's secrets (OPENAI_API_KEY, BRAVE_SEARCH_API_KEY); no key ever ships in the app (A22).

export type SearchHit = { url: string; title: string; snippet: string };

export type SearchClient = {
  /** One web query; the hits in the engine's order. */
  search(query: string): Promise<SearchHit[]>;
};

export type JsonSchema = Record<string, unknown>;

export type CompletionRequest = {
  system: string;
  user: string;
  /** A name for the schema, as OpenAI's structured output asks. */
  name: string;
  schema: JsonSchema;
};

export type Usage = { input: number; output: number };

export type Completion = { value: unknown; usage: Usage };

export type ModelClient = {
  readonly model: string;
  /**
   * A structured-output completion: the model's answer parsed from JSON, and the tokens it used. A failed call
   * throws; when the provider still reported the tokens it used, the error is a ModelCallError carrying them, so
   * the meter counts what a failure cost (01.21).
   */
  complete(req: CompletionRequest): Promise<Completion>;
};

/** A failed model call, with the tokens the provider reported for it when it reported any. */
export class ModelCallError extends Error {
  readonly usage?: Usage;
  constructor(message: string, usage?: Usage) {
    super(message);
    this.name = "ModelCallError";
    this.usage = usage;
  }
}

/** The tokens a thrown error says its call used, or undefined when it does not say. */
export function usageOf(error: unknown): Usage | undefined {
  const u = (error as { usage?: unknown } | null)?.usage as Partial<Usage> | undefined;
  if (!u || typeof u.input !== "number" || typeof u.output !== "number") return undefined;
  if (!Number.isFinite(u.input) || !Number.isFinite(u.output) || u.input < 0 || u.output < 0) return undefined;
  return { input: u.input, output: u.output };
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
export const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

const SNIPPET_CHARS = 700;

/** Brave's web search. Snippets are the engine's own short extracts, kept only while a run is going. */
export function braveClient(apiKey: string, fetchImpl: Fetch = fetch, count = 5): SearchClient {
  return {
    async search(query) {
      const url = `${BRAVE_ENDPOINT}?${new URLSearchParams({ q: query, count: String(count), extra_snippets: "true" })}`;
      const res = await fetchImpl(url, { headers: { accept: "application/json", "x-subscription-token": apiKey } });
      if (!res.ok) throw new Error(`brave search answered ${res.status}`);
      const body = (await res.json()) as { web?: { results?: { url?: unknown; title?: unknown; description?: unknown; extra_snippets?: unknown }[] } };
      const hits: SearchHit[] = [];
      for (const r of body.web?.results ?? []) {
        if (typeof r.url !== "string" || !/^https?:\/\//.test(r.url)) continue;
        const extra = Array.isArray(r.extra_snippets) ? r.extra_snippets.filter((s): s is string => typeof s === "string") : [];
        const snippet = [typeof r.description === "string" ? r.description : "", ...extra].join(" ").replace(/<[^>]+>/g, "");
        hits.push({ url: r.url, title: typeof r.title === "string" ? r.title.replace(/<[^>]+>/g, "") : r.url, snippet: snippet.slice(0, SNIPPET_CHARS) });
      }
      return hits;
    },
  };
}

/** OpenAI chat completions with a strict JSON schema (structured output). */
export function openAiClient(apiKey: string, model: string, fetchImpl: Fetch = fetch): ModelClient {
  return {
    model,
    async complete(req) {
      const res = await fetchImpl(OPENAI_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user },
          ],
          response_format: { type: "json_schema", json_schema: { name: req.name, strict: true, schema: req.schema } },
        }),
      });
      let body: {
        choices?: { message?: { content?: unknown; refusal?: unknown } }[];
        usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
      } = {};
      try {
        body = (await res.json()) as typeof body;
      } catch {
        // An unreadable body reports no usage; the job meters an estimate instead.
      }
      const reported =
        typeof body.usage?.prompt_tokens === "number" && typeof body.usage?.completion_tokens === "number"
          ? { input: body.usage.prompt_tokens, output: body.usage.completion_tokens }
          : undefined;
      if (!res.ok) throw new ModelCallError(`openai answered ${res.status}`, reported);
      const usage = {
        input: typeof body.usage?.prompt_tokens === "number" ? body.usage.prompt_tokens : 0,
        output: typeof body.usage?.completion_tokens === "number" ? body.usage.completion_tokens : 0,
      };
      const message = body.choices?.[0]?.message;
      if (!message || typeof message.content !== "string") throw new ModelCallError("openai returned no content", reported);
      try {
        return { value: JSON.parse(message.content) as unknown, usage };
      } catch {
        throw new ModelCallError("openai returned unreadable content", reported);
      }
    },
  };
}
