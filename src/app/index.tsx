import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { filterEmotions, fingerprint, moodFilter } from "@/lib/fingerprint";
import { bookStateLine } from "@/lib/labels";
import { library, reached, useBooks } from "@/lib/library";
import { deleteBook, downloadAgain, removeDownload } from "@/lib/library-manage";
import { EMOTION_NAMES } from "@/lib/mood-card";
import { scoringStore } from "@/lib/scoring";
import { filterShelf, searchShelf, showSearch, sortShelf, type ShelfFilter, type ShelfSort } from "@/lib/shelf";
import type { Book, EmotionScore } from "@/lib/types";
import { usePlayer } from "@/player/PlayerProvider";
import { Button } from "@/ui/Button";
import { Chip } from "@/ui/Chip";
import { Cover } from "@/ui/Cover";
import { Icon } from "@/ui/Icon";
import { OverflowMenu, type MenuItem } from "@/ui/OverflowMenu";
import { Sticker } from "@/ui/Sticker";
import { colors, opacities, radii, sizes, spacing, strokes, typography, type Emotion } from "@/ui/theme";
import { TopBar, TopBarButton } from "@/ui/TopBar";

// The library, "Your shelf" (design/layouts/DECISION.md, v2): every book on the device, most recently played first.
// Empty, it says so in the display line, with three decorative stickers and "Import a book". Importing is its own
// full screen, pushed from here (01.6). The top bar's overflow menu is the one home for Browse, Downloads, Your
// soundtrack (07.8), Settings and Credits (spec 06); an entry joins it when its route ships, one line each. Each
// scored book wears its fingerprint under the author line, its three strongest emotions over the chapters reached so
// far (07.7, spec 07 A8; src/lib/fingerprint.ts), and the top bar's Mood filter lights one of them to keep only the
// books that hold it, strongest match first. The filter row shows once some book has a fingerprint. All its copy
// lives here.
const COPY = {
  title: "Your shelf",
  emptyLead: "Nothing on the ",
  emptyWord: "shelf",
  emptyTail: " yet.",
  emptyBody: "Add an audiobook you own, or grab a free one, and we'll read the room, chapter by chapter.",
  importBook: "Import a book",
  browseBooks: "Browse free books",
  emptyCaption: "Free books are public-domain recordings from LibriVox.",
  filters: "Filter your shelf",
  mood: "Mood",
  moodChip: (emotion: string) => `Mood: ${emotion}`,
  fingerprint: (emotions: string) => `Mood so far: ${emotions}`,
  // Finished books, sort, state filter and search (05.16, spec 05 A18).
  sort: "Sort",
  sortChips: [
    ["recent", "Recent"],
    ["title", "Title"],
    ["author", "Author"],
  ] as [ShelfSort, string][],
  show: "Show",
  stateChips: [
    ["all", "All"],
    ["in-progress", "In progress"],
    ["not-started", "Not started"],
    ["finished", "Finished"],
  ] as [ShelfFilter, string][],
  searchPlaceholder: "Search title, author or narrator",
  clearSearch: "Clear search",
  markFinished: "Mark as finished",
  markNotFinished: "Mark as not finished",
  noBooks: "No book on your shelf fits.",
  noMatch: (emotion: string) => `No book feels like ${emotion} in the chapters you've reached.`,
  // Library management (05.7, spec 05 A7, A8).
  bookMore: (title: string) => `Options for ${title}`,
  removeDownload: "Remove download",
  removeCaption: "Keeps your place, bookmarks and moods",
  deleteBook: "Delete book",
  downloadAgain: "Download again",
  findFile: "Find the file",
  notOnDevice: "Not on device",
  deleteAsk: (title: string) => `Delete ${title}?`,
  deleteBody: "Its place, bookmarks, moods and picks go with it. Music another book on this device plays stays.",
  cancel: "Cancel",
  downloadFailed: "Couldn't reach LibriVox. Check your connection and try again.",
};

/** The empty shelf's stickers: decorative, hidden from screen readers, no percentages. */
const STICKERS: { emotion: Emotion; label: string }[] = [
  { emotion: "wonder", label: "Wonder" },
  { emotion: "joy", label: "Joy" },
  { emotion: "dread", label: "Dread" },
];
const MENU: MenuItem[] = [
  { key: "browse", label: "Browse free books", icon: "search", onPress: () => router.push("/browse") },
  { key: "downloads", label: "Downloads", icon: "download", onPress: () => router.push("/downloads") },
  { key: "soundtrack", label: "Your soundtrack", icon: "music", onPress: () => router.push("/soundtrack") },
  { key: "settings", label: "Settings", icon: "settings", onPress: () => router.push("/settings") },
  { key: "credits", label: "Credits", icon: "heart", ruleBefore: true, onPress: () => router.push("/credits") },
];

export default function LibraryScreen() {
  const books = useBooks();
  const player = usePlayer();
  // Positions are not reactive (they are saved every half second); re-read them whenever the library shows.
  const [, setVisits] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  useFocusEffect(useCallback(() => setVisits((n) => n + 1), []));
  // Fingerprints read the stored scores and reached chapters: a scoring run that finishes, or a chapter reached,
  // redraws the shelf.
  useEffect(() => {
    const redraw = () => setVisits((n) => n + 1);
    const offScores = scoringStore.subscribe(redraw);
    const offReached = reached.subscribe(redraw);
    return () => {
      offScores();
      offReached();
    };
  }, []);
  const [lit, setLit] = useState<Emotion | null>(null);
  const [sort, setSort] = useState<ShelfSort>("recent");
  const [stateFilter, setStateFilter] = useState<ShelfFilter>("all");
  const [query, setQuery] = useState("");
  const searching = showSearch(books.length);

  const importBook = () => router.push("/import");
  const browseBooks = () => router.push("/browse");

  // The book in progress: the one open in the player, else the one played last.
  const resumingId = player.book?.id ?? books.find((b) => b.lastPlayedAt != null)?.id ?? null;

  // Each book's fingerprint; the playing chapter of the open book counts as reached, as on its river.
  const kept = sortShelf(searchShelf(filterShelf(books, stateFilter, library.getPosition), searching ? query : ""), sort);
  const prints = kept.map((b) => ({
    item: b,
    print: fingerprint(b, { chapters: scoringStore.chapters(b.id) }, reached.furthest(b.id), player.book?.id === b.id ? player.chapter : null),
  }));
  const printOf = new Map(prints.map((p) => [p.item.id, p.print]));
  // The Mood chips offer what the whole shelf holds, so a state filter never hides the way back.
  const offered = filterEmotions(
    books.map((b) =>
      fingerprint(b, { chapters: scoringStore.chapters(b.id) }, reached.furthest(b.id), player.book?.id === b.id ? player.chapter : null),
    ),
    lit,
  );
  const shown = moodFilter(prints, lit);

  return (
    <View style={styles.screen}>
      <TopBar
        title={COPY.title}
        large
        trailing={
          <>
            {books.length > 0 && <TopBarButton testID="import" label="Import" icon="plus" onPress={importBook} />}
            <OverflowMenu testID="library-more" items={MENU} onOpenChange={setMenuOpen} />
          </>
        }
        below={
          books.length > 1 || offered.length > 0 ? (
            <ShelfFilters
              emotions={offered}
              lit={lit}
              onLight={setLit}
              sort={sort}
              onSort={setSort}
              state={stateFilter}
              onState={setStateFilter}
              query={searching ? query : null}
              onQuery={setQuery}
            />
          ) : undefined
        }
      />
      <View style={[styles.screen, menuOpen && styles.behindMenu]}>
        {books.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle} role="heading" aria-level={2}>
              {COPY.emptyLead}
              <Text style={styles.pop}>{COPY.emptyWord}</Text>
              {COPY.emptyTail}
            </Text>
            <Text style={styles.emptyBody}>{COPY.emptyBody}</Text>
            <View style={styles.stickers} aria-hidden>
              {STICKERS.map((s, i) => (
                <Sticker key={s.emotion} emotion={s.emotion} label={s.label} index={i} decorative />
              ))}
            </View>
            <View style={styles.emptyActions}>
              <Button testID="import-book" label={COPY.importBook} icon="plus" onPress={importBook} />
              <Button testID="browse-books" kind="secondary" label={COPY.browseBooks} icon="search" onPress={browseBooks} />
            </View>
            <Text style={styles.emptyFootnote}>{COPY.emptyCaption}</Text>
          </View>
        ) : (
          <FlatList
            data={shown}
            keyExtractor={(b) => b.id}
            renderItem={({ item }) => <BookRow book={item} resuming={item.id === resumingId} print={printOf.get(item.id) ?? []} />}
            ListEmptyComponent={
              <Text style={styles.noMatch} testID="shelf-no-match" role="status">
                {lit ? COPY.noMatch(EMOTION_NAMES[lit]) : COPY.noBooks}
              </Text>
            }
          />
        )}
      </View>
    </View>
  );
}

/**
 * The shelf's filters, in the top bar, each a labelled group of chips (one lit at a time): Sort (recent, title,
 * author), Show (a state, 05.16) and Mood (a tap on the lit one clears it), with a search field once the shelf holds
 * more than ten books.
 */
function ShelfFilters(props: {
  emotions: Emotion[];
  lit: Emotion | null;
  onLight: (emotion: Emotion | null) => void;
  sort: ShelfSort;
  onSort: (sort: ShelfSort) => void;
  state: ShelfFilter;
  onState: (state: ShelfFilter) => void;
  query: string | null;
  onQuery: (query: string) => void;
}) {
  return (
    <View style={styles.filtersCol} testID="shelf-filters" role="group" aria-label={COPY.filters}>
      {props.query != null && (
        <View style={styles.field}>
          <Icon name="search" size="small" color={colors.textMuted} />
          <TextInput
            testID="shelf-search"
            aria-label={COPY.searchPlaceholder}
            style={styles.input}
            value={props.query}
            onChangeText={props.onQuery}
            placeholder={COPY.searchPlaceholder}
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
          />
          {props.query.length > 0 && (
            <Pressable testID="shelf-search-clear" role="button" aria-label={COPY.clearSearch} onPress={() => props.onQuery("")} style={styles.clear}>
              <Icon name="x" size="small" color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      )}
      <View style={styles.filters}>
        <View style={styles.filterGroup} testID="sort-filter" role="group" aria-label={COPY.sort}>
          <Text style={styles.filterLabel}>{COPY.sort}</Text>
          {COPY.sortChips.map(([key, label]) => (
            <Chip key={key} testID={`sort-${key}`} label={label} on={props.sort === key} onPress={() => props.onSort(key)} />
          ))}
        </View>
        <View style={styles.filterGroup} testID="state-filter" role="group" aria-label={COPY.show}>
          <Text style={styles.filterLabel}>{COPY.show}</Text>
          {COPY.stateChips.map(([key, label]) => (
            <Chip key={key} testID={`state-${key}`} label={label} on={props.state === key} onPress={() => props.onState(key)} />
          ))}
        </View>
        {props.emotions.length > 0 && (
          <View style={styles.filterGroup} testID="mood-filter" role="group" aria-label={COPY.mood}>
            <Text style={styles.filterLabel}>{COPY.mood}</Text>
            {props.emotions.map((emotion) => (
              <Chip
                key={emotion}
                testID={`mood-filter-${emotion}`}
                label={EMOTION_NAMES[emotion]}
                a11yLabel={COPY.moodChip(EMOTION_NAMES[emotion])}
                on={props.lit === emotion}
                onPress={() => props.onLight(props.lit === emotion ? null : emotion)}
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

/** A book's fingerprint: its strongest emotions so far as stickers, each with its name (never colour alone). */
function Fingerprint({ bookId, print }: { bookId: string; print: EmotionScore[] }) {
  if (print.length === 0) return null;
  const names = print.map((p) => EMOTION_NAMES[p.emotion]);
  return (
    <View style={styles.fingerprint} testID={`fingerprint-${bookId}`} role="list" aria-label={COPY.fingerprint(names.join(", "))}>
      {print.map((p, i) => (
        <View key={p.emotion} role="listitem">
          <Sticker emotion={p.emotion} label={EMOTION_NAMES[p.emotion]} index={i} testID={`fingerprint-${p.emotion}`} />
        </View>
      ))}
    </View>
  );
}

/**
 * A book's own menu (05.7): on the device, "Remove download" (the file goes, the book stays, A7) and "Delete book";
 * not on the device, the way its file comes back ("Download again" for a LibriVox book, "Find the file" for an
 * imported one, on its page) and "Delete book".
 */
function bookMenu(book: Book, on: { delete: () => void; error: (message: string | null) => void }): MenuItem[] {
  const back: MenuItem[] = book.onDevice
    ? [{ key: "remove-download", label: COPY.removeDownload, icon: "hard-drive", caption: COPY.removeCaption, onPress: () => void removeDownload(book.id) }]
    : book.source.kind === "librivox"
      ? [
          {
            key: "download-again",
            label: COPY.downloadAgain,
            icon: "download",
            onPress: () => {
              on.error(null);
              downloadAgain(book).catch(() => on.error(COPY.downloadFailed));
            },
          },
        ]
      : [{ key: "find-file", label: COPY.findFile, icon: "search", onPress: () => router.push(`/book/${book.id}`) }];
  const finish: MenuItem = book.finished
    ? { key: "mark-unfinished", label: COPY.markNotFinished, icon: "x", onPress: () => library.setFinished(book.id, false) }
    : { key: "mark-finished", label: COPY.markFinished, icon: "check", onPress: () => library.setFinished(book.id, true) };
  return [finish, ...back, { key: "delete-book", label: COPY.deleteBook, icon: "x", ruleBefore: true, onPress: on.delete }];
}

function BookRow({ book, resuming, print }: { book: Book; resuming: boolean; print: EmotionScore[] }) {
  const position = library.getPosition(book.id);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <View style={styles.rowWrap}>
      <View style={styles.row}>
        <Pressable testID={`book-${book.id}`} role="link" style={styles.rowLink} onPress={() => router.push(`/book/${book.id}`)}>
          <Cover book={book} width={sizes.coverWidth} height={sizes.coverHeight} marked={resuming && position > 0} />
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>{book.title}</Text>
            <Text style={styles.author} testID="book-author">
              {book.author}
            </Text>
            <Fingerprint bookId={book.id} print={print} />
            <Text style={styles.meta}>{bookStateLine(book, position, resuming)}</Text>
            {!book.onDevice && (
              <Text style={styles.offDevice} testID={`not-on-device-${book.id}`}>
                {COPY.notOnDevice}
              </Text>
            )}
          </View>
        </Pressable>
        <OverflowMenu
          testID={`book-more-${book.id}`}
          label={COPY.bookMore(book.title)}
          items={bookMenu(book, { delete: () => setConfirming(true), error: setError })}
        />
      </View>
      {error && (
        <Text style={styles.rowError} role="alert">
          {error}
        </Text>
      )}
      {confirming && (
        <View style={styles.confirm} testID={`delete-confirm-${book.id}`} role="alert">
          <Text style={styles.rowTitle}>{COPY.deleteAsk(book.title)}</Text>
          <Text style={styles.meta}>{COPY.deleteBody}</Text>
          <View style={styles.confirmActions}>
            <Button
              small
              kind="danger"
              testID="delete-confirm-yes"
              label={COPY.deleteBook}
              onPress={() => {
                setConfirming(false);
                void deleteBook(book.id);
              }}
            />
            <Button small kind="secondary" testID="delete-confirm-cancel" label={COPY.cancel} onPress={() => setConfirming(false)} />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  behindMenu: { opacity: opacities.behindMenu },
  empty: { flex: 1, justifyContent: "center", gap: spacing.md, padding: spacing.lg },
  emptyTitle: typography.display,
  pop: { color: colors.pop },
  emptyBody: { ...typography.body, color: colors.textMuted },
  stickers: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm },
  emptyActions: { gap: spacing.sm },
  emptyFootnote: { ...typography.caption, textAlign: "center" },
  rowWrap: { borderBottomWidth: strokes.hairline, borderBottomColor: colors.border },
  row: { flexDirection: "row", alignItems: "center", paddingRight: spacing.xs },
  rowLink: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingLeft: spacing.md,
    paddingVertical: spacing.sm,
  },
  offDevice: { ...typography.caption, color: colors.text },
  rowError: { ...typography.caption, color: colors.danger, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  confirm: { gap: spacing.xs, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  confirmActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  rowText: { flex: 1, gap: spacing.xxs },
  rowTitle: { ...typography.body, fontWeight: typography.label.fontWeight },
  author: { ...typography.caption, color: colors.text },
  meta: typography.caption,
  fingerprint: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, paddingVertical: spacing.xxs },
  filtersCol: { gap: spacing.sm },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: sizes.touch,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: strokes.outline,
    borderColor: colors.edge,
    backgroundColor: colors.surface,
  },
  input: { flex: 1, minHeight: sizes.touch, ...typography.body, paddingVertical: spacing.sm },
  clear: { minHeight: sizes.touch, minWidth: sizes.touch, alignItems: "center", justifyContent: "center", marginRight: -spacing.sm },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  filterGroup: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.xs, flexShrink: 1, maxWidth: "100%" },
  filterLabel: typography.label,
  noMatch: { ...typography.body, color: colors.textMuted, padding: spacing.lg },
});
