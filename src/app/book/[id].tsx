import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { chapterBed, pickFor } from "@/lib/bed";
import { speedLabel } from "@/lib/labels";
import { chapterEdits, reached, useBook, useFurthestIn, useFurthestReached } from "@/lib/library";
import { moodCardView, sceneBand } from "@/lib/mood-card";
import { isReached } from "@/lib/reached";
import { notes, useNoteDismissed } from "@/lib/notes";
import { scoring, scoringStore, useBookScores, useScoringJob } from "@/lib/scoring";
import { soundtrack } from "@/lib/soundtrack";
import { piecesPlayed } from "@/lib/soundtrack-store";
import { nextVerdict } from "@/lib/verdict-store";
import { useBookVerdicts, verdicts } from "@/lib/verdicts";
import { BookmarksSheet } from "@/player/BookmarksSheet";
import { ChapterRiver } from "@/player/ChapterRiver";
import { CompanionBand } from "@/player/CompanionBand";
import { LayerPicker } from "@/player/LayerPicker";
import { MiniPlayer } from "@/player/MiniPlayer";
import { RescoreConfirm, RESCORE_MENU, ScoringBand } from "@/player/ScoringBand";
import { Mixer } from "@/player/Mixer";
import { usePlayer } from "@/player/PlayerProvider";
import { SOUNDSCAPE_IDS } from "@/player/soundscapes";
import { SpeedSleepSheet } from "@/player/SpeedSleepSheet";
import { Button } from "@/ui/Button";
import { OverflowMenu } from "@/ui/OverflowMenu";
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
  const [confirmRescore, setConfirmRescore] = useState(false);
  const noteDismissed = useNoteDismissed("scoring-sent");
  const { open } = p;
  const job = useScoringJob(id ?? "");
  const scores = useBookScores(id ?? "");
  const furthest = useFurthestReached(id ?? "");
  const bookVerdicts = useBookVerdicts(id ?? "");

  // A scoring job remembered from before (the app closed mid-run) is picked up again when its book opens (A15).
  useEffect(() => {
    if (book) scoring.resume(book);
  }, [book]);

  useEffect(() => {
    if (id && book) open(id);
  }, [id, book, open]);

  // Playback has entered this chapter: it is reached from now on, and stays reached (src/lib/reached.ts, A21).
  const playingChapter = p.book?.id === id ? p.chapter : undefined;
  useEffect(() => {
    if (id && playingChapter) reached.reach(id, playingChapter);
  }, [id, playingChapter]);
  // And the furthest place within it (07.2, A2): a scene shows only once the clock has reached its start.
  const playingPosition = p.book?.id === id ? p.position : null;
  const furthestIn = useFurthestIn(id ?? "", playingChapter?.start ?? null);
  useEffect(() => {
    if (id && playingChapter && playingPosition !== null) reached.reachAt(id, playingChapter, playingPosition);
  }, [id, playingChapter, playingPosition]);

  // The reached chapter's piece plays for it: "Your soundtrack" logs it, and its scene pieces, the first time
  // (src/lib/soundtrack-store.ts, 07.8, A9). A pick made while it plays is logged too, since it plays from then on.
  useEffect(() => {
    if (!id || !playingChapter || !scores) return;
    const score = scores.chapters.find((s) => s.mood.chapterIndex === playingChapter.index && s.mood.chapterTitle === playingChapter.title);
    if (score) soundtrack.log(id, piecesPlayed(score));
  }, [id, playingChapter, scores]);

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
  // What each row may show: nothing before the chapter is reached (A21); then the "Unscored" chip, never a guessed
  // mood (A19), or its emotions, named piece, alternates and the listener's pick (A16). A stored score counts only
  // while the chapter keeps the title it was scored under.
  // The playing row also shows the playing scene's emotions, nothing for a scene not yet reached (07.2, A2).
  const moods = book.chapters.map((c) => {
    const score = scores?.chapters.find((s) => s.mood.chapterIndex === c.index && s.mood.chapterTitle === c.title) ?? null;
    const view = moodCardView(isReached(c, furthest, chapter), score);
    if (view.kind !== "scored" || c.index !== chapter?.index) return view;
    return { ...view, scene: sceneBand(score, c, position, active ? furthestIn : null) };
  });
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
              a11yLabel={`${COPY.speedSleep}, ${speedButton}`}
              onPress={() => setSheet(sheet === "speed" ? null : "speed")}
            />
            <TopBarButton
              testID="open-bookmarks"
              label={COPY.bookmarks}
              icon="bookmark"
              onPress={() => setSheet(sheet === "bookmarks" ? null : "bookmarks")}
            />
            {scores && job?.state !== "running" && (
              <OverflowMenu
                testID="open-river-menu"
                items={[{ key: "rescore", label: RESCORE_MENU.label, icon: "sparkles", caption: RESCORE_MENU.caption, onPress: () => setConfirmRescore(true) }]}
              />
            )}
          </>
        }
      />
      {active && p.companion && <CompanionBand timer={p.companionTimer} onTimer={p.setCompanionTimer} />}
      {confirmRescore && scores && (
        <RescoreConfirm
          chapters={book.chapters.length}
          onConfirm={() => {
            setConfirmRescore(false);
            void scoring.start(book, true);
          }}
          onCancel={() => setConfirmRescore(false)}
        />
      )}
      <ScoringBand
        chapters={book.chapters.length}
        job={job}
        scores={scores}
        noteDismissed={noteDismissed}
        onDismissNote={() => notes.dismiss("scoring-sent")}
        onStart={() => void scoring.start(book)}
        onRescore={() => void scoring.start(book, true)}
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
          moods={moods}
          onPick={(i, pick) => {
            const c = book.chapters[i];
            if (c) scoringStore.savePick(book.id, c, pick);
          }}
          verdicts={bookVerdicts}
          onVerdict={(i, pieceId, tapped) =>
            verdicts.setVerdict(book.id, i, pieceId, nextVerdict(verdicts.verdictFor(book.id, i, pieceId), tapped))
          }
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
