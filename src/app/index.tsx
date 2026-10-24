import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { bookStateLine } from "@/lib/labels";
import { library, useBooks } from "@/lib/library";
import type { Book } from "@/lib/types";
import { usePlayer } from "@/player/PlayerProvider";
import { Cover } from "@/ui/Cover";
import { Icon } from "@/ui/Icon";
import { OverflowMenu, type MenuItem } from "@/ui/OverflowMenu";
import { colors, opacities, radii, spacing } from "@/ui/theme";
import { TopBar, TopBarButton } from "@/ui/TopBar";

// The library: every book on the device, most recently played first. Empty, it is one centred "Import a book".
// Importing is its own full screen, pushed from here (01.6). The top bar's overflow menu is the one home for
// Browse, Downloads, Settings and Credits (spec 06); an entry joins it when its route ships, one line each.
const MENU: MenuItem[] = [
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
        title="Library"
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
            <View style={styles.placeholder}>
              <Icon name="plus" color={colors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No books yet</Text>
            <Text style={styles.muted}>Import an audiobook file to start a chapter river.</Text>
            <Pressable
              testID="import-book"
              role="button"
              style={styles.primary}
              onPress={importBook}
            >
              <Text style={styles.primaryText}>Import a book</Text>
            </Pressable>
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
      aria-label={book.title}
      style={styles.row}
      onPress={() => router.push(`/book/${book.id}`)}
    >
      <Cover book={book} width={46} height={62} marked={resuming && position > 0} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {book.title}
        </Text>
        <Text style={styles.author} numberOfLines={1} testID="book-author">
          {book.author}
        </Text>
        <Text style={styles.muted} numberOfLines={1}>
          {bookStateLine(book, position, resuming)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  behindMenu: { opacity: opacities.behindMenu },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.lg,
  },
  placeholder: {
    width: 80,
    height: 80,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  muted: { color: colors.textMuted, fontSize: 14, textAlign: "left" },
  primary: {
    marginTop: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: colors.onAccent, fontSize: 16, fontWeight: "700" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  author: { color: colors.text, fontSize: 14 },
});
