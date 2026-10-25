// Owner tools (05.21, spec 05 A23), pure: whether the build shows them, and what "Copy books for pre-scoring" copies.
// The list is, per library book, exactly the scoring request the app would send the proxy (src/lib/scoring-api.ts:
// title, author, chapter titles, and the LibriVox and Gutenberg numbers when known) and nothing else: no file paths,
// positions, bookmarks or listening data. The app never sends it anywhere; the owner pastes it into
// dev-audiobooks.json for `pnpm prescore --from` (05.22).
import { scoringRequest, type ScoringRequest } from "./scoring-api.ts";
import type { Book } from "./types.ts";

/** On only when the app config says so in so many words (app.config.ts: local dev and the preview profile). */
export const ownerToolsOn = (extra: Record<string, unknown> | null | undefined): boolean => extra?.ownerTools === true;

/** Every library book's scoring request, in shelf order. */
export const prescoreRequests = (books: readonly Book[]): ScoringRequest[] => books.map(scoringRequest);

/** The clipboard text: the requests as a JSON array, indented so a person can read and paste it. */
export const prescoreList = (books: readonly Book[]): string => JSON.stringify(prescoreRequests(books), null, 2);
