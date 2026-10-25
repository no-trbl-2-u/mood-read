// The library's shelf (spec 05, 05.16, A18): a book's state, and the shelf's sort, state filter and search. Pure.
import { sortBooks } from "./library-store.ts";
import { END_SLACK } from "./timeline.ts";
import type { Book } from "./types.ts";

export type BookState = "not-started" | "in-progress" | "finished";
export type ShelfSort = "recent" | "title" | "author";
/** The state filter: every book, or one state. */
export type ShelfFilter = "all" | BookState;

/** The shelf holds more than this many books before a search field shows (A18). */
export const SEARCH_AFTER = 10;

/** Finished when the listener marked it or its last chapter ended; else started once the listener is past the start. */
export function bookState(book: Pick<Book, "duration" | "finished">, position: number): BookState {
  if (book.finished) return "finished";
  if (position >= book.duration - END_SLACK && position > 0) return "finished";
  return position > 0 ? "in-progress" : "not-started";
}

const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });

/** Recent is the library's own order (last played first); title and author sort A to Z, the other field breaking ties. */
export function sortShelf(books: Book[], sort: ShelfSort): Book[] {
  if (sort === "recent") return sortBooks(books);
  const [first, second] = sort === "title" ? (["title", "author"] as const) : (["author", "title"] as const);
  return [...books].sort((a, b) => byText(a[first], b[first]) || byText(a[second], b[second]));
}

export function filterShelf(books: Book[], filter: ShelfFilter, positionOf: (id: string) => number): Book[] {
  return filter === "all" ? books : books.filter((b) => bookState(b, positionOf(b.id)) === filter);
}

/** Books whose title, author or narrator holds every word of the query, in any case. An empty query keeps all. */
export function searchShelf(books: Book[], query: string): Book[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return books;
  return books.filter((b) => {
    const hay = `${b.title} ${b.author} ${b.narrator}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export function showSearch(bookCount: number): boolean {
  return bookCount > SEARCH_AFTER;
}
