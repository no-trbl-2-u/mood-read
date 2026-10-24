import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { bookStateLine } from "@/lib/labels";
import { library, useBooks } from "@/lib/library";
import type { Book } from "@/lib/types";
import { usePlayer } from "@/player/PlayerProvider";
import { Button } from "@/ui/Button";
import { Cover } from "@/ui/Cover";
import { OverflowMenu, type MenuItem } from "@/ui/OverflowMenu";
import { Sticker } from "@/ui/Sticker";
import { colors, opacities, sizes, spacing, strokes, typography, type Emotion } from "@/ui/theme";
import { TopBar, TopBarButton } from "@/ui/TopBar";

// The library, "Your shelf" (design/layouts/DECISION.md, v2): every book on the device, most recently played first.
// Empty, it says so in the display line, with three decorative stickers and "Import a book". Importing is its own
// full screen, pushed from here (01.6). The top bar's overflow menu is the one home for Browse, Downloads, Settings
// and Credits (spec 06); an entry joins it when its route ships, one line each. All its copy lives here.
const COPY = {
  title: "Your shelf",
  emptyLead: "Nothing on the ",
  emptyWord: "shelf",
  emptyTail: " yet.",
  emptyBody: "Add an audiobook you own and we'll read the room, chapter by chapter.",
  importBook: "Import a book",
};

/** The empty shelf's stickers: decorative, hidden from screen readers, no percentages. */
const STICKERS: { emotion: Emotion; label: string }[] = [
  { emotion: "wonder", label: "Wonder" },
  { emotion: "joy", label: "Joy" },
  { emotion: "dread", label: "Dread" },
];
const MENU: MenuItem[] = [
  { key: "downloads", label: "Downloads", icon: "download", onPress: () => router.push("/downloads") },
  { key: "settings", label: "Settings", icon: "settings", onPress: () => router.push("/settings") },
];

export default function LibraryScreen() {
  const books = useBooks();
  const player = usePlayer();
  // Positions are not reactive (they are saved every half second); re-read them whenever the library shows.
  const [, setVisits] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  useFocusEffect(useCallback(() => setVisits((n) => n + 1), []));

  const importBook = () => router.push("/import");

  // The book in progress: the one open in the player, else the one played last.
  const resumingId = player.book?.id ?? books.find((b) => b.lastPlayedAt != null)?.id ?? null;

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
            <Button testID="import-book" label={COPY.importBook} icon="plus" onPress={importBook} />
          </View>
        ) : (
          <FlatList
            data={books}
            keyExtractor={(b) => b.id}
            renderItem={({ item }) => <BookRow book={item} resuming={item.id === resumingId} />}
          />
        )}
      </View>
    </View>
  );
}

function BookRow({ book, resuming }: { book: Book; resuming: boolean }) {
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
});
