import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { filterEmotions, fingerprint, moodFilter } from "@/lib/fingerprint";
import { bookStateLine } from "@/lib/labels";
import { library, reached, useBooks } from "@/lib/library";
import { EMOTION_NAMES } from "@/lib/mood-card";
import { scoringStore } from "@/lib/scoring";
import type { Book, EmotionScore } from "@/lib/types";
import { usePlayer } from "@/player/PlayerProvider";
import { Button } from "@/ui/Button";
import { Chip } from "@/ui/Chip";
import { Cover } from "@/ui/Cover";
import { OverflowMenu, type MenuItem } from "@/ui/OverflowMenu";
import { Sticker } from "@/ui/Sticker";
import { colors, opacities, sizes, spacing, strokes, typography, type Emotion } from "@/ui/theme";
import { TopBar, TopBarButton } from "@/ui/TopBar";

// The library, "Your shelf" (design/layouts/DECISION.md, v2): every book on the device, most recently played first.
// Empty, it says so in the display line, with three decorative stickers and "Import a book". Importing is its own
// full screen, pushed from here (01.6). The top bar's overflow menu is the one home for Browse, Downloads, Settings
// and Credits (spec 06); an entry joins it when its route ships, one line each. Each scored book wears its
// fingerprint under the author line, its three strongest emotions over the chapters reached so far (07.7, spec 07
// A8; src/lib/fingerprint.ts), and the top bar's Mood filter lights one of them to keep only the books that hold it,
// strongest match first. The filter row shows once some book has a fingerprint. All its copy lives here.
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
  noMatch: (emotion: string) => `No book feels like ${emotion} in the chapters you've reached.`,
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

  const importBook = () => router.push("/import");
  const browseBooks = () => router.push("/browse");

  // The book in progress: the one open in the player, else the one played last.
  const resumingId = player.book?.id ?? books.find((b) => b.lastPlayedAt != null)?.id ?? null;

  // Each book's fingerprint; the playing chapter of the open book counts as reached, as on its river.
  const prints = books.map((b) => ({
    item: b,
    print: fingerprint(b, scoringStore.scores(b.id), reached.furthest(b.id), player.book?.id === b.id ? player.chapter : null),
  }));
  const printOf = new Map(prints.map((p) => [p.item.id, p.print]));
  const offered = filterEmotions(
    prints.map((p) => p.print),
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
        below={offered.length > 0 ? <ShelfFilters emotions={offered} lit={lit} onLight={setLit} /> : undefined}
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
              lit ? (
                <Text style={styles.noMatch} testID="shelf-no-match" role="status">
                  {COPY.noMatch(EMOTION_NAMES[lit])}
                </Text>
              ) : undefined
            }
          />
        )}
      </View>
    </View>
  );
}

/**
 * The shelf's filters, in the top bar: the Mood filter's chips (one lit at a time; a tap on the lit one clears it).
 * A row of labelled groups, so 05.16's state filter joins beside the Mood one as a second group of the same shape.
 */
function ShelfFilters(props: { emotions: Emotion[]; lit: Emotion | null; onLight: (emotion: Emotion | null) => void }) {
  return (
    <View style={styles.filters} testID="shelf-filters" role="group" aria-label={COPY.filters}>
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

function BookRow({ book, resuming, print }: { book: Book; resuming: boolean; print: EmotionScore[] }) {
  const position = library.getPosition(book.id);
  return (
    <Pressable
      testID={`book-${book.id}`}
      role="link"
      style={styles.row}
      onPress={() => router.push(`/book/${book.id}`)}
    >
      <Cover book={book} width={sizes.coverWidth} height={sizes.coverHeight} marked={resuming && position > 0} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{book.title}</Text>
        <Text style={styles.author} testID="book-author">
          {book.author}
        </Text>
        <Fingerprint bookId={book.id} print={print} />
        <Text style={styles.meta}>{bookStateLine(book, position, resuming)}</Text>
      </View>
    </Pressable>
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: strokes.hairline,
    borderBottomColor: colors.border,
  },
  rowText: { flex: 1, gap: spacing.xxs },
  rowTitle: { ...typography.body, fontWeight: typography.label.fontWeight },
  author: { ...typography.caption, color: colors.text },
  meta: typography.caption,
  fingerprint: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, paddingVertical: spacing.xxs },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  filterGroup: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.xs, flexShrink: 1, maxWidth: "100%" },
  filterLabel: typography.label,
  noMatch: { ...typography.body, color: colors.textMuted, padding: spacing.lg },
});
