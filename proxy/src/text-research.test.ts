import assert from "node:assert/strict";
import { test } from "node:test";

import type { CompletionRequest, ModelClient } from "./clients.ts";
import type { BookRequest } from "./contract.ts";
import { fakeModel, fakeSearch } from "./fakes.ts";
import { MIN_CHAPTER_WORDS, NoText, type TextChapter } from "./gutenberg.ts";
import { createBookJob, type Run } from "./job.ts";
import { createMeter, monthOf } from "./meter.ts";
import { memoryStore, type Store } from "./store.ts";
import {
  excerpt,
  gutenbergSource,
  MAX_CHAPTER_CHARS,
  nextBatch,
  parseTextMoods,
  planText,
  TEXT_CHARS_PER_STEP,
  textMoodRequest,
  type TextSource,
} from "./text-research.ts";
import { bookKey } from "./validate.ts";

const NOW = Date.UTC(2026, 9, 24, 12);

/** A sentence no stored byte may ever hold: it marks the book's own text. */
const SECRET = "Zyxwv the marmalade jar was quite empty";
const words = (mark: string, n = MIN_CHAPTER_WORDS + 30) => `${SECRET} ${mark}. ` + Array.from({ length: n }, () => "word").join(" ");

const TEXT = [
  "The Project Gutenberg eBook of Alice's Adventures in Wonderland",
  "*** START OF THE PROJECT GUTENBERG EBOOK ALICE'S ADVENTURES IN WONDERLAND ***",
  "",
  "CHAPTER I.",
  "Down the Rabbit-Hole",
  "",
  words("rabbit"),
  "",
  "CHAPTER II.",
  "The Pool of Tears",
  "",
  words("tears"),
  "",
  "CHAPTER III.",
  "A Caucus-Race and a Long Tale",
  "",
  words("caucus"),
  "",
  "*** END OF THE PROJECT GUTENBERG EBOOK ALICE'S ADVENTURES IN WONDERLAND ***",
  "THE FULL PROJECT GUTENBERG LICENSE",
].join("\n");

const book: BookRequest = {
  title: "Alice's Adventures in Wonderland",
  author: "Lewis Carroll",
  chapters: ["Opening Credits", "Down the Rabbit Hole", "Chapter 2", "Part 3"],
  librivoxId: "200",
  gutenbergId: "11",
};

const ch = (title: string, number: number, text = "x"): TextChapter => ({ title, number, text });

test("text chapters match the audiobook's by title, then chapter number; a part number never takes a chapter (A19)", () => {
  const text = [ch("Chapter I: Down the Rabbit-Hole", 1), ch("Chapter II: The Pool of Tears", 2), ch("Chapter III: A Caucus-Race", 3)];
  const run = planText(book, "11", text);
  assert.deepEqual(run.match, [null, 0, 1, null]);
  assert.equal(run.cursor, 0);
  assert.equal(run.gutenbergId, "11");
  // Positions never match: credits shift an audiobook's positions against the text's numbering.
  assert.deepEqual(planText({ ...book, chapters: ["Intro", "The Storm", "Arrival"] }, "11", text).match, [null, null, null]);
});

test("a very long chapter is read as its beginning, middle and end", () => {
  const long = "a".repeat(MAX_CHAPTER_CHARS) + "MIDDLE" + "b".repeat(MAX_CHAPTER_CHARS) + "THE END";
  const e = excerpt(long);
  assert.ok(e.length < MAX_CHAPTER_CHARS + 50);
  assert.ok(e.startsWith("aaa") && e.endsWith("THE END"));
  assert.match(e, /MIDDLE/);
  assert.equal(excerpt("short"), "short");
});

test("a step reads chapters within its character budget, always at least one", () => {
  const big = "z".repeat(MAX_CHAPTER_CHARS);
  const text = Array.from({ length: 8 }, (_, k) => ch(`Chapter ${k + 1}`, k + 1, big));
  const run = { gutenbergId: "1", match: [0, 1, 2, 3, 4, 5, 6, 7, null], cursor: 0 };
  const first = nextBatch(run, text);
  assert.equal(first.length, Math.floor(TEXT_CHARS_PER_STEP / MAX_CHAPTER_CHARS));
  assert.deepEqual(nextBatch({ ...run, cursor: 8 }, text), [8]);
});

test("the model's answer is read for the chapters asked only; scored needs an emotion in the set; the source is the ebook page", () => {
  const source = { url: "https://www.gutenberg.org/ebooks/11", title: "Alice, Project Gutenberg eBook #11" };
  const got = parseTextMoods(
    {
      chapters: [
        { chapter: 2, coverage: "scored", emotions: [{ emotion: "wonder", intensity: 0.9 }], scenes: [] },
        { chapter: 3, coverage: "scored", emotions: [{ emotion: "nostalgia", intensity: 0.9 }], scenes: [] },
        { chapter: 4, coverage: "too-little", emotions: [], scenes: [] },
        { chapter: 9, coverage: "scored", emotions: [{ emotion: "joy", intensity: 0.5 }], scenes: [] },
        { chapter: 2, coverage: "scored", emotions: [{ emotion: "dread", intensity: 0.9 }], scenes: [] },
      ],
    },
    [1, 2, 3],
    source,
  );
  assert.deepEqual([...got.keys()], [1]);
  assert.deepEqual(got.get(1), { emotions: [{ emotion: "wonder", intensity: 0.9 }], scenes: [{ emotions: [{ emotion: "wonder", intensity: 0.9 }], span: 1 }], sources: [source] });
  assert.equal(parseTextMoods(null, [1], source).size, 0);
});

test("the reading asks for emotions and spans only, never events, under the audiobook's chapter numbers", () => {
  const req = textMoodRequest(book, [{ index: 1, text: "Once upon a time." }]);
  assert.equal(req.name, "text_moods");
  assert.match(req.system, /Never describe, quote or summarise/);
  assert.match(req.user, /=== Chapter 2: Down the Rabbit Hole ===\nOnce upon a time\./);
});

test("the text is held in memory for one book: fetched once per book, replaced by the next (A10)", async () => {
  const urls: string[] = [];
  const source = gutenbergSource(async (url) => {
    urls.push(url);
    return url.includes("/404/") ? new Response("", { status: 404 }) : url.includes("/7/") ? new Response(words("x", 1000)) : new Response(TEXT);
  });
  const a = await source.chapters("11");
  assert.deepEqual(a.map((c) => c.number), [1, 2, 3]);
  assert.doesNotMatch(a.map((c) => c.text).join(" "), /PROJECT GUTENBERG|LICENSE/);
  await source.chapters("11");
  assert.equal(urls.length, 1, "a run's later steps reuse the text in memory");
  await assert.rejects(source.chapters("7"), NoText, "a text with no chapter headings is no text");
  await assert.rejects(source.chapters("404"), NoText);
  await source.chapters("11");
  assert.equal(urls.length, 4, "a different book replaced it");
});

// ---- the job on the text path ----

/** A store that records every value ever written, so a test can search all of it. */
function recordingStore(): Store & { written: string[] } {
  const inner = memoryStore();
  const written: string[] = [];
  return {
    written,
    get: (k) => inner.get(k),
    delete: (k) => inner.delete(k),
    async put(k, v) {
      written.push(`${k}=${JSON.stringify(v)}`);
      await inner.put(k, v);
    },
  };
}

/** The usual fake model, answering the text reading too: every chapter it is shown scored with wonder. */
function textModel(opts: { thin?: number[] } = {}): ModelClient & { calls: CompletionRequest[] } {
  const base = fakeModel({ emotions: [{ emotion: "wonder", intensity: 0.9 }, { emotion: "calm", intensity: 0.4 }] });
  return {
    model: base.model,
    calls: base.calls,
    async complete(req) {
      if (req.name !== "text_moods") return base.complete(req);
      base.calls.push(req);
      const nums = [...req.user.matchAll(/^=== Chapter (\d+): /gm)].map((m) => Number(m[1]));
      return {
        value: {
          chapters: nums.map((n) =>
            (opts.thin ?? []).includes(n)
              ? { chapter: n, coverage: "too-little", emotions: [], scenes: [] }
              : {
                  chapter: n,
                  coverage: "scored",
                  emotions: [{ emotion: "wonder", intensity: 0.9 }, { emotion: "calm", intensity: 0.4 }],
                  scenes: [
                    { emotions: [{ emotion: "calm", intensity: 0.5 }], span: 0.4 },
                    { emotions: [{ emotion: "wonder", intensity: 0.9 }], span: 0.6 },
                  ],
                },
          ),
        },
        usage: { input: 20_000, output: 300 },
      };
    },
  };
}

function setup(s: { text?: TextSource; fetchText?: (url: string) => Response; cap?: number; thin?: number[] } = {}) {
  const store = recordingStore();
  const meterStore = recordingStore();
  const meter = createMeter(meterStore);
  const search = fakeSearch();
  const model = textModel({ thin: s.thin });
  const fetched: string[] = [];
  const text =
    s.text ??
    gutenbergSource(async (url) => {
      fetched.push(url);
      return s.fetchText ? s.fetchText(url) : new Response(TEXT);
    });
  const job = createBookJob({ store, meter, capUsd: s.cap ?? 20, search, model, text, now: () => NOW });
  return { store, meterStore, meter, search, model, job, fetched };
}

async function drain(job: ReturnType<typeof createBookJob>) {
  for (let i = 0; i < 100; i++) if (!(await job.step()).more) return;
  throw new Error("job never finished");
}

test("A10: a book with a Gutenberg number is scored from its own text; pieces are named as today; no search is made", async () => {
  const { job, search, model, meter, fetched } = setup();
  const key = await bookKey(book);
  assert.equal((await job.start(key, book)).run, true);
  await drain(job);
  const { view } = await job.status();
  assert.equal(view?.state, "done");
  const [credits, alice, two, part] = view!.result!.chapters;

  assert.deepEqual(fetched, ["https://gutenberg.pglaf.org/cache/epub/11/pg11.txt"], "the text is fetched once, from the mirror");
  assert.equal(search.queries.length, 0, "the text path runs no web search");

  for (const c of [alice, two]) {
    assert.equal(c.mood.coverage, "scored");
    assert.deepEqual(c.mood.emotions.map((e) => e.emotion), ["wonder", "calm"]);
    assert.deepEqual(c.mood.sources, [{ url: "https://www.gutenberg.org/ebooks/11", title: "Alice's Adventures in Wonderland, Project Gutenberg eBook #11" }]);
    assert.deepEqual(c.mood.scenes?.map((x) => x.span), [0.4, 0.6]);
    assert.ok(c.pieces && c.pieces.alternates.length >= 2);
    for (const p of [c.pieces.piece, ...c.pieces.alternates]) {
      assert.equal(p.vocals, "none");
      assert.doesNotMatch(p.title, /Sung|Song/, "the same no-vocals screen as a web-scored book (A20)");
    }
  }
  // Credits and a part the text does not match stay unscored, never given a neighbour's text (A19).
  for (const c of [credits, part]) {
    assert.equal(c.mood.coverage, "too-little");
    assert.equal(c.pieces, null);
  }

  // The reading saw only the matched chapters' own text, under the audiobook's numbers.
  const reading = model.calls.find((c) => c.name === "text_moods")!;
  assert.match(reading.user, /=== Chapter 2: Down the Rabbit Hole ===\n.*rabbit/);
  assert.match(reading.user, /=== Chapter 3: Chapter 2 ===\n.*tears/);
  assert.doesNotMatch(reading.user, /caucus|PROJECT GUTENBERG/);

  // Metered as today.
  const spent = await meter.spent(monthOf(NOW));
  assert.ok(spent > 0);
  assert.equal(Math.round(spent * 1e9), Math.round(view!.result!.costUsd * 1e9));
});

test("A10: the proxy keeps no copy of the text: nothing stored, ever, and nothing logged, holds a word of it", async () => {
  const logged: string[] = [];
  const saved = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };
  for (const k of Object.keys(saved) as (keyof typeof saved)[]) console[k] = (...a: unknown[]) => void logged.push(a.map(String).join(" "));
  try {
    const { job, store, meterStore } = setup();
    await job.start(await bookKey(book), book);
    await drain(job);
    const all = [...store.written, ...meterStore.written];
    assert.ok(all.length > 3, "the job saved its state as it went");
    for (const w of [...all, ...logged]) {
      assert.doesNotMatch(w, /marmalade|Zyxwv|rabbit\.|tears\.|word word/, "no chapter text in the store, the cache or a log");
    }
    const run = (await store.get<Run>("job"))!;
    assert.deepEqual(run.text, { gutenbergId: "11", match: [null, 0, 1, null], cursor: 4 }, "the run keeps chapter numbers only");
  } finally {
    Object.assign(console, saved);
  }
});

test("a book whose text is missing, or matches none of its chapters, is researched on the web instead", async () => {
  const missing = setup({ fetchText: () => new Response("", { status: 404 }) });
  await missing.job.start(await bookKey(book), book);
  await drain(missing.job);
  assert.ok(missing.search.queries.length > 0, "fell back to the web research");
  const r = (await missing.job.status()).view!.result!;
  assert.ok(r.chapters.some((c) => c.mood.coverage === "scored" && c.mood.sources.every((s) => !s.url.includes("gutenberg"))));

  const unmatched = setup();
  const other = { ...book, chapters: ["Intro", "Track 02", "Part 3"] };
  await unmatched.job.start(await bookKey(other), other);
  await drain(unmatched.job);
  assert.ok(unmatched.search.queries.length > 0);
  assert.equal(unmatched.model.calls.filter((c) => c.name === "text_moods").length, 0);
});

test("a book without a Gutenberg number, or a proxy without the text source, takes the web path as before", async () => {
  const { job, search, fetched } = setup();
  const plain = { title: book.title, author: book.author, chapters: book.chapters };
  await job.start(await bookKey(plain), plain);
  await drain(job);
  assert.equal(fetched.length, 0);
  assert.ok(search.queries.length > 0);
});

test("the monthly cap holds on the text path: a capped book reads no text and spends nothing", async () => {
  const { job, fetched, meter, model } = setup({ cap: 1 });
  await meter.add(monthOf(NOW), 1);
  const out = await job.start(await bookKey(book), book);
  assert.equal(out.run, false);
  assert.equal(out.view.state, "capped");
  assert.equal((await job.step()).more, false);
  assert.equal(fetched.length, 0);
  assert.equal(model.calls.length, 0);
});

test("a fetch that fails after the text was matched is retried as any step is", async () => {
  let calls = 0;
  const big = "z ".repeat(MAX_CHAPTER_CHARS / 2);
  const chapters = [1, 2, 3, 4].map((n) => ch(`Chapter ${n}`, n, big));
  const flaky: TextSource = {
    async chapters() {
      calls += 1;
      if (calls === 2) throw new Error("mirror unavailable");
      return chapters;
    },
  };
  // Four long chapters take two readings: the first step matches and reads three, the second fails once, then reads.
  const four = { ...book, chapters: ["Chapter 1", "Chapter 2", "Chapter 3", "Chapter 4"] };
  const { job, model } = setup({ text: flaky });
  await job.start(await bookKey(four), four);
  assert.deepEqual(await job.step(), { more: true, delayMs: 0 });
  const failed = await job.step();
  assert.ok(failed.more && failed.delayMs > 0, "retried after a delay");
  await drain(job);
  const { view } = await job.status();
  assert.equal(view?.state, "done");
  assert.equal(calls, 3);
  assert.equal(model.calls.filter((c) => c.name === "text_moods").length, 2);
  assert.ok(view!.result!.chapters.every((c) => c.mood.coverage === "scored"));
});
