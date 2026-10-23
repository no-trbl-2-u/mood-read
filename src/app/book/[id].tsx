import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { speedLabel } from "@/lib/labels";
import { useBook } from "@/lib/library";
import { BookmarksSheet } from "@/player/BookmarksSheet";
import { ChapterRiver } from "@/player/ChapterRiver";
import { MiniPlayer } from "@/player/MiniPlayer";
import { usePlayer } from "@/player/PlayerProvider";
import { SpeedSleepSheet } from "@/player/SpeedSleepSheet";
import { colors, radii, spacing } from "@/ui/theme";
import { TopBar, TopBarButton } from "@/ui/TopBar";

const backToLibrary = () => (router.canGoBack() ? router.back() : router.replace("/"));

// One book's chapter river: the top bar (back to Library, the book title, Speed & Sleep and Bookmarks), the river,
// and the docked mini player. The two sheets rise over the river; the mini player stays below them.
export default function BookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const book = useBook(id);
  const p = usePlayer();
  const [sheet, setSheet] = useState<"speed" | "bookmarks" | null>(null);
  const { open } = p;

  useEffect(() => {
    if (id && book) open(id);
  }, [id, book, open]);

  if (!book) {
    return (
      <View style={styles.screen}>
        <TopBar title="Book not found" back={{ label: "Library", onPress: backToLibrary }} />
        <View style={styles.missing}>
          <Text style={styles.missingText}>This book is not in your library on this device.</Text>
          <Pressable testID="back-to-library" role="link" style={styles.primary} onPress={() => router.replace("/")}>
            <Text style={styles.primaryText}>Back to Library</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const active = p.book?.id === book.id;
  const position = active ? p.position : 0;
  const chapter = active ? p.chapter : book.chapters[0];
  const speedButton = p.sleep ? `${speedLabel(p.speed)} · Sleep` : speedLabel(p.speed);

  return (
    <View style={styles.screen}>
      <TopBar
        title={book.title}
        back={{ label: "Library", onPress: backToLibrary }}
        trailing={
          <>
            <TopBarButton
              testID="open-speed-sleep"
              label={speedButton}
              a11yLabel="Speed and sleep timer"
              onPress={() => setSheet(sheet === "speed" ? null : "speed")}
            />
            <TopBarButton
              testID="open-bookmarks"
              label="Bookmarks"
              onPress={() => setSheet(sheet === "bookmarks" ? null : "bookmarks")}
            />
          </>
        }
      />
      {active && p.error && (
        <Text style={styles.error} role="alert">
          This book could not play: {p.error} Try opening it again from the library.
        </Text>
      )}
      <View style={styles.body}>
        <ChapterRiver
          book={book}
          currentIndex={chapter?.index}
          position={position}
          sleep={p.sleep}
          onJump={(i) => active && p.jumpToChapter(i)}
        />
        {active && sheet === "speed" && <SpeedSleepSheet player={p} onClose={() => setSheet(null)} />}
        {active && sheet === "bookmarks" && (
          <BookmarksSheet book={book} position={position} onJump={p.seek} onClose={() => setSheet(null)} />
        )}
      </View>
      <MiniPlayer
        book={book}
        chapter={chapter}
        position={position}
        playing={active && p.playing}
        loading={!active || p.loading}
        onToggle={() => active && p.toggle()}
        onSkip={(d) => active && p.skip(d)}
        onSeek={(s) => active && p.seek(s)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, position: "relative" },
  missing: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.lg },
  missingText: { color: colors.textMuted, fontSize: 15, textAlign: "center" },
  primary: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: colors.onAccent, fontSize: 16, fontWeight: "700" },
  error: { color: colors.danger, fontSize: 14, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
});
