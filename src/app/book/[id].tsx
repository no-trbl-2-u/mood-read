import { router, Stack, useLocalSearchParams } from "expo-router";
import Head from "expo-router/head";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { chapterBed, MUSIC_PICK, pickFor, pickLayer } from "@/lib/bed";
import { useCatalog } from "@/lib/catalog-config";
import { chapterEdits } from "@/lib/chapter-edits";
import { licenseName } from "@/lib/credits";
import { speedLabel } from "@/lib/labels";
import { useBook, useFurthestIn, useFurthestReached } from "@/lib/library";
import { moodCardView, sceneBand } from "@/lib/mood-card";
import { draftFrom } from "@/lib/mood-match";
import { isReached } from "@/lib/reached";
import { notes, useNoteDismissed } from "@/lib/notes";
import { scoring, scoringStore, useBookScores, useScoringJob } from "@/lib/scoring";
import { buildPlaylist, usePlaylist } from "@/lib/playlists";
import { settings, useSettings } from "@/lib/settings";
import { seedable } from "@/lib/scoring-store";
import { setMood, useChapterScores } from "@/lib/seeding";
import { nextVerdict } from "@/lib/verdict-store";
import { useBookVerdicts, verdicts } from "@/lib/verdicts";
import { googleSignIn, youtubeConfigured } from "@/lib/youtube-auth";
import { referencePiecesOf, saveAsYoutubePlaylist, type PlaylistResult } from "@/lib/youtube-playlist";
import { BookmarksSheet } from "@/player/BookmarksSheet";
import { ChapterRiver } from "@/player/ChapterRiver";
import { CompanionBand } from "@/player/CompanionBand";
import { LayerPicker } from "@/player/LayerPicker";
import { MiniPlayer } from "@/player/MiniPlayer";
import { OffDeviceBand } from "@/player/OffDeviceBand";
import { RescoreConfirm, RESCORE_MENU, ScoringBand } from "@/player/ScoringBand";
import { Mixer } from "@/player/Mixer";
import { PlaylistBand } from "@/player/PlaylistBand";
import { usePlayer } from "@/player/PlayerProvider";
import { SOUNDSCAPE_IDS } from "@/player/soundscapes";
import { SetMoodSheet } from "@/player/SetMoodSheet";
import { SpeedSleepSheet } from "@/player/SpeedSleepSheet";
import { YOUTUBE_PLAYLIST_MENU, YoutubePlaylistBand } from "@/player/YoutubePlaylistBand";
import { Button } from "@/ui/Button";
import { OverflowMenu } from "@/ui/OverflowMenu";
import { Toast } from "@/ui/Toast";
import { colors, spacing, typography } from "@/ui/theme";
import { TopBar, TopBarButton } from "@/ui/TopBar";

const NO_BOOK = { id: "", chapters: [] };

const backToLibrary = () => (router.canGoBack() ? router.back() : router.replace("/"));

const COPY = {
  back: "Back to your shelf",
  shelf: "Your shelf",
  notFound: "Book not found",
  notFoundBody: "This book isn't on your shelf on this device.",
  bookmarks: "Bookmarks",
  speedSleep: "Speed and sleep timer",
  playError: (error: string) => `This book could not play: ${error} Try opening it again from your shelf.`,
  // The first "Fits" tap (07.5, spec 07 A6): what leaves the device, said once, as the privacy policy says it.
  verdictsShared:
    "Thanks. Once a day Mood Read shares which pieces fit, as just the piece, the chapter's emotions and your verdict: no book, chapter, device or time. Turn off \"Share what fits\" in Settings to keep them on this device.",
  dismissShared: "Dismiss this note",
};

// One book's chapter river: the top bar (back to your shelf, the book title, Speed & Sleep and Bookmarks), the
// river, and the docked mini player. The two sheets rise over the river; the mini player stays below them.
export default function BookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const book = useBook(id);
  const p = usePlayer();
  // "Set the mood" (07.6, A7) opens for one chapter, by index.
  const [sheet, setSheet] = useState<"speed" | "bookmarks" | { mood: number } | null>(null);
  const [confirmRescore, setConfirmRescore] = useState(false);
  // "Save YouTube playlist" (01.11, A24's playlist half): null before it is offered, "running" while the sign-in
  // and the Data API calls are in flight, then the typed result the band shows in place.
  const [ytPlaylist, setYtPlaylist] = useState<"running" | PlaylistResult | null>(null);
  // The one-time "what is shared" notice after the first "Fits" (07.5): shown on that tap, then never again.
  const [sharedToast, setSharedToast] = useState(false);
  const noteDismissed = useNoteDismissed("scoring-sent");
  const { open } = p;
  const job = useScoringJob(id ?? "");
  const scores = useBookScores(id ?? "");
  // The research with the listener's seeds (07.6): what the rows, the card and "Your soundtrack" read.
  const chapterScores = useChapterScores(id ?? "");
  const furthest = useFurthestReached(id ?? "");
  // "Build playlist" (05.4, A4): shown once the book has a piece to download; null for an unscored book.
  const playlist = usePlaylist(book ?? NO_BOOK);
  const wifiOnly = useSettings().wifiOnly;
  const bookVerdicts = useBookVerdicts(id ?? "");
  // The music catalog (05.3, A3): the card names each catalog piece's license, and a book scored before v2 is
  // re-matched against it here, from its stored emotions, with no request to the proxy.
  const catalog = useCatalog();
  const catalogPieces = useMemo(() => (catalog.status === "ready" ? catalog.pieces : []), [catalog]);
  const licenses = useMemo(() => new Map(catalogPieces.map((c) => [c.id, licenseName(c.license)])), [catalogPieces]);
  useEffect(() => {
    if (id && scores) scoringStore.rematch(id, catalogPieces);
  }, [id, scores, catalogPieces]);

  // A scoring job remembered from before (the app closed mid-run) is picked up again when its book opens (A15).
  useEffect(() => {
    if (book) scoring.resume(book);
  }, [book]);

  // A book whose download was removed (05.7) has nothing to play until its file is back.
  useEffect(() => {
    if (id && book?.onDevice) open(id);
  }, [id, book, open]);

  // Playback reaches a chapter and logs its pieces in the player (audit 4.2), not here, so it holds on any screen.
  const playingChapter = p.book?.id === id ? p.chapter : undefined;
  const furthestIn = useFurthestIn(id ?? "", playingChapter?.start ?? null);

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

  const active = p.book?.id === book.id && book.onDevice;
  const position = active ? p.position : 0;
  const chapter = active ? p.chapter : book.chapters[0];
  const chapterIndex = chapter?.index ?? null;
  // What each row may show: nothing before the chapter is reached (A21); then the "Unscored" chip, never a guessed
  // mood (A19), or its emotions, named piece, alternates and the listener's pick (A16). A stored score counts only
  // while the chapter keeps the title it was scored under.
  // The playing row also shows the playing scene's emotions, nothing for a scene not yet reached (07.2, A2).
  const moods = book.chapters.map((c) => {
    const score = chapterScores.find((s) => s.mood.chapterIndex === c.index && s.mood.chapterTitle === c.title) ?? null;
    const view = moodCardView(isReached(c, furthest, chapter), score, (pieceId) => licenses.get(pieceId) ?? null);
    if (view.kind !== "scored" || c.index !== chapter?.index) return view;
    return { ...view, scene: sceneBand(score, c, position, active ? furthestIn : null) };
  });
  // An unscored book (no chapter the research scored) offers "Set the mood" in its band, for the playing chapter.
  const unscoredBook = seedable(book.chapters, scores).length === book.chapters.length;
  const moodSheet = sheet !== null && typeof sheet === "object" ? book.chapters[sheet.mood] : undefined;
  const speedButton = p.sleep ? `${speedLabel(p.speed)} · Sleep` : speedLabel(p.speed);
  // "Save YouTube playlist" (01.11, A24): only offered once some chapter has named a reference piece to save.
  const referencePieces = referencePiecesOf(chapterScores);
  const startYoutubePlaylist = async () => {
    setYtPlaylist("running");
    setYtPlaylist(await saveAsYoutubePlaylist(book.title, referencePieces, { signIn: googleSignIn, configured: youtubeConfigured }));
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: book.title }} />
      <Head>
        <title>{book.title}</title>
      </Head>
      <TopBar
        title={book.title}
        back={{ label: COPY.back, iconOnly: true, onPress: backToLibrary }}
        trailing={
          <>
            {book.onDevice && (
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
              </>
            )}
            {scores && job?.state !== "running" && (
              <OverflowMenu
                testID="open-river-menu"
                items={[
                  { key: "rescore", label: RESCORE_MENU.label, icon: "sparkles", caption: RESCORE_MENU.caption, onPress: () => setConfirmRescore(true) },
                  ...(referencePieces.length > 0
                    ? [
                        {
                          key: "youtube-playlist",
                          label: YOUTUBE_PLAYLIST_MENU.label,
                          icon: "music" as const,
                          caption: YOUTUBE_PLAYLIST_MENU.caption,
                          onPress: () => void startYoutubePlaylist(),
                        },
                      ]
                    : []),
                ]}
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
      {ytPlaylist !== null && <YoutubePlaylistBand state={ytPlaylist} onDismiss={() => setYtPlaylist(null)} />}
      <ScoringBand
        chapters={book.chapters.length}
        job={job}
        scores={scores}
        noteDismissed={noteDismissed}
        onDismissNote={() => notes.dismiss("scoring-sent")}
        onStart={() => void scoring.start(book)}
        onRescore={() => void scoring.start(book, true)}
        onDismissError={() => scoring.dismiss(book.id)}
        onSetMood={unscoredBook && chapter ? () => setSheet({ mood: chapter.index }) : undefined}
      />
      {!book.onDevice && <OffDeviceBand book={book} />}
      {playlist && !confirmRescore && book.onDevice && (
        <PlaylistBand
          status={playlist}
          wifiOnly={wifiOnly}
          onBuild={() => {
            void buildPlaylist(book);
            // The playlist is what plays from now on: the book's layer turns to Music, keeping its soundscape as the
            // fallback for an unscored chapter (01.10). A chapter with a layer of its own keeps it.
            if (active && p.bed.layer !== "music") p.setMix(pickLayer(p.bed, null, MUSIC_PICK));
          }}
        />
      )}
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
          onVerdict={(i, pieceId, tapped) => {
            const next = nextVerdict(verdicts.verdictFor(book.id, i, pieceId), tapped);
            // Said once, on the first "Fits" while sharing is on; with sharing off nothing leaves, so there is nothing to say.
            if (next === "fits" && settings.get().shareVerdicts && !notes.dismissed("verdicts-shared")) {
              notes.dismiss("verdicts-shared");
              setSharedToast(true);
            }
            verdicts.setVerdict(book.id, i, pieceId, next);
          }}
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
          onSetMood={(i) => setSheet({ mood: i })}
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
        {moodSheet && (
          <SetMoodSheet
            key={moodSheet.index}
            chapterLabel={seedable([moodSheet], scores).length > 0 ? `Ch.${moodSheet.index + 1} — ${moodSheet.title}` : null}
            initial={draftFrom(scoringStore.seeds(book.id).find((s) => s.mood.chapterIndex === moodSheet.index && s.mood.chapterTitle === moodSheet.title)?.mood.emotions ?? [])}
            onApply={(target, lit) => {
              setMood(book, target === "book" ? "book" : { chapter: moodSheet.index }, lit, catalogPieces);
              setSheet(null);
            }}
            onClose={() => setSheet(null)}
          />
        )}
      </View>
      {sharedToast && <Toast testID="verdicts-shared" text={COPY.verdictsShared} dismissLabel={COPY.dismissShared} onDismiss={() => setSharedToast(false)} />}
      {book.onDevice && (
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
      )}
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
