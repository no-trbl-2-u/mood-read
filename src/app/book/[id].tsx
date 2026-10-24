import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { chapterBed, pickFor } from "@/lib/bed";
import { speedLabel } from "@/lib/labels";
import { chapterEdits, useBook } from "@/lib/library";
import { BookmarksSheet } from "@/player/BookmarksSheet";
import { ChapterRiver } from "@/player/ChapterRiver";
import { LayerPicker } from "@/player/LayerPicker";
import { MiniPlayer } from "@/player/MiniPlayer";
import { Mixer } from "@/player/Mixer";
import { usePlayer } from "@/player/PlayerProvider";
import { SOUNDSCAPE_IDS } from "@/player/soundscapes";
import { SpeedSleepSheet } from "@/player/SpeedSleepSheet";
import { Button } from "@/ui/Button";
import { colors, spacing, typography } from "@/ui/theme";
import { TopBar, TopBarButton } from "@/ui/TopBar";

const backToLibrary = () => (router.canGoBack() ? router.back() : router.replace("/"));

const COPY = {
  back: "Back to your shelf",
  shelf: "Your shelf",
  notFound: "Book not found",
  notFoundBody: "This book isn't on your shelf on this device.",
  bookmarks: "Bookmarks",
  speedSleep: "Speed and sleep timer",
  playError: (error: string) => `This book could not play: ${error} Try opening it again from your shelf.`,
};

// One book's chapter river: the top bar (back to your shelf, the book title, Speed & Sleep and Bookmarks), the
// river, and the docked mini player. The two sheets rise over the river; the mini player stays below them.
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
        <TopBar title={COPY.notFound} back={{ label: COPY.shelf, a11yLabel: COPY.back, onPress: backToLibrary }} />
        <View style={styles.missing}>
          <Text style={styles.missingText}>{COPY.notFoundBody}</Text>
          <Button testID="back-to-library" role="link" label={COPY.back} onPress={() => router.replace("/")} />
        </View>
      </View>
    );
  }

  const active = p.book?.id === book.id;
  const position = active ? p.position : 0;
  const chapter = active ? p.chapter : book.chapters[0];
  const chapterIndex = chapter?.index ?? null;
  const speedButton = p.sleep ? `${speedLabel(p.speed)} · Sleep` : speedLabel(p.speed);

  return (
    <View style={styles.screen}>
      <TopBar
        title={book.title}
        back={{ label: COPY.back, iconOnly: true, onPress: backToLibrary }}
        trailing={
          <>
            <TopBarButton
              testID="open-speed-sleep"
              label={speedButton}
              a11yLabel={COPY.speedSleep}
              onPress={() => setSheet(sheet === "speed" ? null : "speed")}
            />
            <TopBarButton
              testID="open-bookmarks"
              label={COPY.bookmarks}
              icon="bookmark"
              onPress={() => setSheet(sheet === "bookmarks" ? null : "bookmarks")}
            />
          </>
        }
      />
      {active && p.error && (
        <Text style={styles.error} role="alert">
          {COPY.playError(p.error)}
        </Text>
      )}
      <View style={styles.body}>
        <ChapterRiver
          book={book}
          currentIndex={chapter?.index}
          position={position}
          mixer={
            active ? (
              <Mixer
                mix={p.mix}
                onChange={p.setMix}
                layer={
                  <LayerPicker
                    pick={pickFor(chapterIndex, p.bed, SOUNDSCAPE_IDS)}
                    chapterOnly={!!chapterBed(p.bed, chapterIndex)}
                    onPick={p.pickLayer}
                    onChapterOnly={p.setChapterOnly}
                  />
                }
              />
            ) : undefined
          }
          onJump={(i) => active && p.jumpToChapter(i)}
          edits={
            active
              ? {
                  rename: (i, t) => chapterEdits.rename(book, i, t),
                  mergeWithNext: (i) => chapterEdits.mergeWithNext(book, i),
                  splitAt: (s) => chapterEdits.splitAt(book, s),
                }
              : undefined
          }
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
        sleep={active ? p.sleep : null}
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
  missingText: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  error: { ...typography.body, color: colors.danger, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
});
