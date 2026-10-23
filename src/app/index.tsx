import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { bookStateLine } from "@/lib/labels";
import { importBookFromPicker, library, useBooks } from "@/lib/library";
import type { Book } from "@/lib/types";
import { usePlayer } from "@/player/PlayerProvider";
import { Cover } from "@/ui/Cover";
import { PlusGlyph } from "@/ui/glyphs";
import { colors, radii, spacing } from "@/ui/theme";
import { TopBar, TopBarButton } from "@/ui/TopBar";

// The library: every book on the device, most recently played first. Empty, it is one centred "Import a book".
// In 01.1 importing opens the system picker for one or more local audio files (one chapter per file); the
// Import screen with real imports and the AAX/AAXC note is 01.6.
export default function LibraryScreen() {
  const books = useBooks();
  const player = usePlayer();
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Positions are not reactive (they are saved every half second); re-read them whenever the library shows.
  const [, setVisits] = useState(0);
  useFocusEffect(useCallback(() => setVisits((n) => n + 1), []));

  async function importBook() {
    setError(null);
    setImporting(true);
    try {
      const book = await importBookFromPicker();
      if (book) router.push(`/book/${book.id}`);
    } catch {
      setError("That file could not be opened. Pick an audio file you own (MP3, M4A, M4B, WAV, FLAC or OGG).");
    } finally {
      setImporting(false);
    }
  }

  // The book in progress: the one open in the player, else the one played last.
  const resumingId = player.book?.id ?? books.find((b) => b.lastPlayedAt != null)?.id ?? null;

  return (
    <View style={styles.screen}>
      <TopBar
        title="Library"
        trailing={
          books.length > 0 ? (
            <TopBarButton testID="import" label={importing ? "Importing" : "Import"} onPress={importBook} />
          ) : undefined
        }
      />
      {error && (
        <Text style={styles.error} role="alert">
          {error}
        </Text>
      )}
      {books.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.placeholder}>
            <PlusGlyph size={24} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No books yet</Text>
          <Text style={styles.muted}>Import an audiobook file to start a chapter river.</Text>
          <Pressable
            testID="import-book"
            role="button"
            style={[styles.primary, importing && styles.busy]}
            onPress={importBook}
            disabled={importing}
          >
            <Text style={styles.primaryText}>{importing ? "Importing" : "Import a book"}</Text>
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
        <Text style={styles.muted} numberOfLines={1}>
          {bookStateLine(book, position, resuming)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
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
  busy: { opacity: 0.6 },
  primaryText: { color: colors.onAccent, fontSize: 16, fontWeight: "700" },
  error: { color: colors.danger, fontSize: 14, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
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
});
