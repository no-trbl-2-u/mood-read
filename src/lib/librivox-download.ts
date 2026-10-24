// Downloads a LibriVox book into the library (05.8, A9): the `Transfer` src/lib/downloads.ts hands the download
// queue for a "book" target, and the small registry that tells it what that id's download actually means. A
// LibriVox book's id is generated with `newId()` (src/app/browse/[id].tsx, before the book exists) and enqueued
// at once; this module stashes the archive.org identifier, its resolved chapter files and chosen cover against
// that id, persisted (so an app restart mid-download does not orphan it, the way src/lib/download-queue.ts's
// `recoverRunning` already requeues the download row itself), and reads it back when the queue calls the
// Transfer. On the last file, it builds the `Book` (one `BookFile`/`Chapter` per chapter file, in track order)
// and calls `library.addBook`, exactly where `importFiles` does for a listener's own file (src/lib/library.ts).
import { getItem, removeItem, setItem } from "./kv";
import { library } from "./library";
import { chapterFiles, chapterTitle, coverFile, downloadUrl, gutenbergIdFor, parseLength, readerNames, type LibriVoxItem } from "./librivox-api";
import { downloadFileInto, probeDuration, resolveFile } from "./media";
import { extension } from "./meta/read";
import type { Transfer } from "./download-queue";
import type { Book, BookFile, Chapter } from "./types";

export type PendingLibriVoxBook = {
  identifier: string;
  title: string;
  author: string;
  /** In track order already (src/lib/librivox-api.ts chapterFiles); `length` is the fallback duration (seconds). */
  files: { name: string; title: string; length: number | null }[];
  cover: { name: string } | null;
  /** The volunteers who read it, from the item's "Read by ..." line: the book's narrator, thanked on /credits
   *  (05.5). Absent on a download stashed before 05.5. */
  readers?: string | null;
  /** LibriVox's catalog number (05.9), for finding the text's Project Gutenberg number. Absent before 05.9. */
  catalogId?: string | null;
};

const REGISTRY_KEY = "librivox-pending";

function readRegistry(): Record<string, PendingLibriVoxBook> {
  try {
    const raw = getItem(REGISTRY_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, PendingLibriVoxBook>) : {};
  } catch {
    return {};
  }
}

function writeRegistry(next: Record<string, PendingLibriVoxBook>): void {
  setItem(REGISTRY_KEY, JSON.stringify(next));
}

/** A LibriVox item's chapter files and chosen cover, ready to stash against an id and enqueue. */
export function pendingBookFrom(item: LibriVoxItem): PendingLibriVoxBook {
  const files = chapterFiles(item.files).map((f, i) => ({
    name: f.name,
    title: chapterTitle(f.title, i),
    length: parseLength(f.length),
  }));
  const cover = coverFile(item.files);
  return {
    identifier: item.identifier,
    title: item.title,
    author: item.creator || "Unknown author",
    files,
    cover: cover ? { name: cover.name } : null,
    readers: readerNames(item.description),
    catalogId: item.catalogId,
  };
}

/** Stashes what a soon-to-be-enqueued download id means; the Transfer reads it back by id when the queue runs it. */
export function stashLibriVoxBook(bookId: string, book: PendingLibriVoxBook): void {
  writeRegistry({ ...readRegistry(), [bookId]: book });
}

function forgetLibriVoxBook(bookId: string): void {
  const { [bookId]: _removed, ...rest } = readRegistry();
  if (Object.keys(rest).length === 0) removeItem(REGISTRY_KEY);
  else writeRegistry(rest);
}

/** The bookId already stashed for this LibriVox identifier, so a screen remounted mid-download finds it again. */
export function pendingBookIdFor(identifier: string): string | null {
  for (const [id, book] of Object.entries(readRegistry())) if (book.identifier === identifier) return id;
  return null;
}

/**
 * The download queue's `Transfer` for every "book" target (only LibriVox books ever download: an imported book
 * is on the device from the moment it is added). Downloads each chapter file in turn, then the cover, reporting
 * cumulative bytes/totalBytes across all of them to the one `Download` row (a free CDN, not a thing to hammer —
 * sequential is fine); once every file is written, builds the `Book` and adds it to the library.
 */
export const librivoxTransfer: Transfer = async (download, onProgress, signal) => {
  if (download.target.kind !== "book") throw new Error("Nothing to download for this target yet");
  const bookId = download.target.bookId;
  const pending = readRegistry()[bookId];
  if (!pending) throw new Error("This download no longer knows what to fetch");

  const slots = pending.files.length + (pending.cover ? 1 : 0);
  const bytes = new Array<number>(slots).fill(0);
  const totals = new Array<number | null>(slots).fill(null);
  const report = () => {
    const total = totals.every((t) => t != null) ? totals.reduce<number>((s, t) => s + (t as number), 0) : null;
    onProgress(bytes.reduce((s, b) => s + b, 0), total);
  };
  const progressFor = (i: number) => (b: number, t: number | null) => {
    bytes[i] = b;
    totals[i] = t;
    report();
  };

  const refs: string[] = [];
  for (let i = 0; i < pending.files.length; i++) {
    const f = pending.files[i]!;
    const ext = extension(f.name);
    const name = `${String(i).padStart(3, "0")}${ext ? `.${ext}` : ""}`;
    const { ref } = await downloadFileInto(bookId, name, downloadUrl(pending.identifier, f.name), progressFor(i), signal);
    refs.push(ref);
  }

  let coverRef: string | null = null;
  if (pending.cover) {
    const ext = extension(pending.cover.name) || "jpg";
    const { ref } = await downloadFileInto(bookId, `cover.${ext}`, downloadUrl(pending.identifier, pending.cover.name), progressFor(pending.files.length), signal);
    coverRef = ref;
  }

  const files: BookFile[] = [];
  for (let i = 0; i < refs.length; i++) {
    const meta = pending.files[i]!;
    let duration: number;
    try {
      duration = await probeDuration(await resolveFile(refs[i]!));
    } catch {
      // A chapter the player cannot probe still keeps its place: archive.org's own `length` stands in for it.
      duration = meta.length ?? 0;
    }
    files.push({ ref: refs[i]!, name: meta.title, duration });
  }

  let at = 0;
  const chapters: Chapter[] = files.map((f, i) => {
    const start = at;
    at += f.duration;
    return { bookId, index: i, title: pending.files[i]!.title, fileIndex: i, start, end: at };
  });

  const book: Book = {
    id: bookId,
    title: pending.title,
    author: pending.author,
    narrator: pending.readers ?? "",
    cover: coverRef,
    files,
    chapters,
    duration: at,
    addedAt: Date.now(),
    lastPlayedAt: null,
    source: librivoxSource(pending, await textNumber(pending)),
    onDevice: true,
  };
  library.addBook(book);
  forgetLibriVoxBook(bookId);
};

/**
 * The text's Project Gutenberg number, looked up once as the book lands (05.9). Best effort: a failed lookup (no
 * network, LibriVox down, a browser refusing the cross-site request) leaves the book without one, and it is scored
 * from the web as before; the download never fails for it.
 */
async function textNumber(pending: PendingLibriVoxBook): Promise<string | null> {
  if (!pending.catalogId) return null;
  try {
    return await gutenbergIdFor((url, init) => fetch(url, init), pending.catalogId);
  } catch {
    return null;
  }
}

/** A downloaded book's source: its archive.org identifier, and its catalog numbers when known (05.9). */
export function librivoxSource(pending: Pick<PendingLibriVoxBook, "identifier" | "catalogId">, gutenbergId: string | null): Book["source"] {
  return {
    kind: "librivox",
    librivoxId: pending.identifier,
    ...(pending.catalogId ? { catalogId: pending.catalogId } : {}),
    ...(gutenbergId ? { gutenbergId } : {}),
  };
}
