import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { downloadQueue, useDownloads } from "@/lib/downloads";
import { useLibriVoxBook } from "@/lib/library";
import { chapterFiles, chapterTitle, getItem, parseLength, readersLine, type LibriVoxItem } from "@/lib/librivox-api";
import { bookLengthLine } from "@/lib/librivox-labels";
import { pendingBookFrom, pendingBookIdFor, stashLibriVoxBook } from "@/lib/librivox-download";
import { useSettings } from "@/lib/settings";
import { formatBytes } from "@/lib/storage";
import { newId } from "@/lib/timeline";
import { Button } from "@/ui/Button";
import { Cover } from "@/ui/Cover";
import { colors, radii, sizes, spacing, strokes, typography } from "@/ui/theme";
import { TopBar } from "@/ui/TopBar";

// A LibriVox book (spec 05, 05.8; design/layouts/DECISION.md "A LibriVox book"), pushed from Browse: its cover,
// author, readers, length, and a Download button that enqueues the whole book through the shared download queue
// (05.6). Moods are out of scope here (05.9/05.10 not built): the mood section always reads unscored, even
// though "Score this book" does nothing yet. Pause/Resume/Retry reuse src/lib/downloads.ts's own queue and
// store rather than a second progress UI; "See all downloads" links to the Downloads screen that already draws
// one.
const COPY = {
  back: "Browse",
  loading: "Loading this book…",
  loadError: "Could not load this book from archive.org. Check your connection and try again.",
  tryAgain: "Try again",
  noChapters: "Mood Read could not find this book's chapters. Try another book.",
  moodTitle: "The whole book's mood",
  unscored: "Not scored yet. Once it's on your shelf, “Score this book” reads its mood.",
  download: "Download",
  wifiCaption: "Downloads on Wi-Fi only. Change it in Settings.",
  chaptersTitle: "Chapters",
  openShelf: "Open on your shelf",
  pause: "Pause",
  resume: "Resume",
  retry: "Retry",
  seeDownloads: "See all downloads",
  queued: "Queued to download…",
};

export default function BrowseBookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<LibriVoxItem | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(() => pendingBookIdFor(id ?? ""));
  const wifiOnly = useSettings().wifiOnly;
  const shelfBook = useLibriVoxBook(id);
  const download = useDownloads().find((d) => d.target.kind === "book" && d.target.bookId === downloadingId) ?? null;

  // This screen is pushed fresh for each identifier, so one fetch per mount is enough; item/loadError start at
  // their "nothing yet" values already, with no reset to synchronize here.
  useEffect(() => {
    if (!id) return;
    let live = true;
    getItem((url, init) => fetch(url, init), id).then(
      (found) => live && setItem(found),
      () => live && setLoadError(true),
    );
    return () => {
      live = false;
    };
  }, [id]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/browse"));

  if (!shelfBook && !item && !loadError) {
    return (
      <View style={styles.screen}>
        <TopBar title="" back={{ label: COPY.back, onPress: goBack }} />
        <View style={styles.centered}>
          <Text style={styles.muted} role="status">
            {COPY.loading}
          </Text>
        </View>
      </View>
    );
  }

  if (!shelfBook && loadError) {
    return (
      <View style={styles.screen}>
        <TopBar title="" back={{ label: COPY.back, onPress: goBack }} />
        <View style={styles.centered}>
          <Text style={styles.errorText} role="alert">
            {COPY.loadError}
          </Text>
          <Button testID="browse-book-retry-load" kind="secondary" label={COPY.tryAgain} onPress={() => setLoadError(false)} />
        </View>
      </View>
    );
  }

  const chapters = item ? chapterFiles(item.files) : [];
  const title = shelfBook?.title ?? item?.title ?? "";
  const author = shelfBook?.author ?? item?.creator ?? "";
  const readers = item ? readersLine(item.description) : null;
  const lengthLine = item ? bookLengthLine(parseLength(item.runtime), chapters.length, null) : "";

  function onDownload() {
    if (!item) return;
    const pending = pendingBookFrom(item);
    if (pending.files.length === 0) {
      setDownloadError(COPY.noChapters);
      return;
    }
    setDownloadError(null);
    const bookId = newId();
    stashLibriVoxBook(bookId, pending);
    setDownloadingId(bookId);
    downloadQueue.enqueue({ kind: "book", bookId });
  }

  return (
    <View style={styles.screen}>
      <TopBar title="" back={{ label: COPY.back, onPress: goBack }} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.header}>
          {shelfBook ? (
            <Cover book={shelfBook} width={sizes.fileTileWidth} height={sizes.fileTileHeight} />
          ) : (
            <View style={styles.cover}>
              <Text style={styles.coverInitials}>{initials(title)}</Text>
            </View>
          )}
          <View style={styles.headerText}>
            <Text style={styles.title} role="heading" aria-level={1}>
              {title}
            </Text>
            <Text style={styles.author}>{author}</Text>
            {readers && <Text style={styles.caption}>{readers}</Text>}
            {lengthLine && <Text style={styles.caption}>{lengthLine}</Text>}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle} role="heading" aria-level={2}>
            {COPY.moodTitle}
          </Text>
          <Text style={styles.muted}>{COPY.unscored}</Text>
        </View>

        {downloadError && (
          <Text style={styles.errorText} role="alert">
            {downloadError}
          </Text>
        )}

        {shelfBook ? (
          <Button testID="browse-book-open" label={COPY.openShelf} onPress={() => router.replace(`/book/${shelfBook.id}`)} />
        ) : download ? (
          <DownloadCard download={download} />
        ) : (
          <View style={styles.downloadBlock}>
            <Button testID="browse-book-download" label={COPY.download} icon="download" onPress={onDownload} />
            {wifiOnly && <Text style={styles.caption}>{COPY.wifiCaption}</Text>}
          </View>
        )}

        {chapters.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle} role="heading" aria-level={2}>
              {COPY.chaptersTitle}
            </Text>
            <View style={styles.chapterCard}>
              {chapters.map((f, i) => {
                const seconds = parseLength(f.length);
                return (
                  <View key={f.name} testID={`browse-chapter-${i}`} style={i > 0 && styles.chapterDivider}>
                    <View style={styles.chapterRow}>
                      <Text style={styles.chapterTitle}>
                        {i + 1}. {chapterTitle(f.title, i)}
                      </Text>
                      {seconds != null && <Text style={styles.caption}>{formatClock(seconds)}</Text>}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/** Initials for the cover placeholder before download, the same shape Cover.tsx draws for a book with no art. */
function initials(title: string): string {
  const words = title.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase());
  return words.join("") || "?";
}

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function DownloadCard({ download }: { download: ReturnType<typeof useDownloads>[number] }) {
  const pct = download.totalBytes ? Math.min(100, Math.round((download.bytes / download.totalBytes) * 100)) : null;
  return (
    <View style={styles.downloadCard} testID="browse-book-downloading">
      {download.state === "failed" ? (
        <>
          <Text style={styles.errorText} role="alert">
            {download.error ?? "The download failed."}
          </Text>
          <Button testID="browse-book-retry" label={COPY.retry} onPress={() => downloadQueue.retry(download.id)} />
        </>
      ) : (
        <>
          <Text style={styles.downloadingTitle}>
            {pct != null ? `Downloading ${pct}%` : download.state === "paused" ? "Paused" : COPY.queued}
          </Text>
          {download.totalBytes != null && (
            <Text style={styles.caption}>
              {formatBytes(download.bytes)} of {formatBytes(download.totalBytes)}
            </Text>
          )}
          <View style={styles.track}>
            <View style={[styles.trackFill, pct != null && { width: `${pct}%` }]} />
          </View>
          {download.state === "running" && <Button testID="browse-book-pause" kind="secondary" label={COPY.pause} onPress={() => downloadQueue.pause(download.id)} />}
          {download.state === "paused" && <Button testID="browse-book-resume" label={COPY.resume} onPress={() => downloadQueue.resume(download.id)} />}
        </>
      )}
      <Button testID="browse-book-see-downloads" kind="secondary" label={COPY.seeDownloads} role="link" onPress={() => router.push("/downloads")} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.xl },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.lg },
  muted: { ...typography.body, color: colors.textMuted },
  errorText: { ...typography.body, color: colors.danger },
  header: { flexDirection: "row", gap: spacing.md },
  cover: {
    width: sizes.fileTileWidth,
    height: sizes.fileTileHeight,
    borderRadius: radii.sm,
    borderWidth: strokes.outline,
    borderColor: colors.edge,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  coverInitials: typography.label,
  headerText: { flex: 1, gap: spacing.xxs, justifyContent: "center" },
  title: typography.heading,
  author: typography.body,
  caption: typography.caption,
  section: { gap: spacing.sm },
  sectionTitle: { ...typography.label, fontSize: typography.body.fontSize },
  downloadBlock: { gap: spacing.sm },
  downloadCard: {
    backgroundColor: colors.surface,
    borderWidth: strokes.hairline,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  downloadingTitle: { ...typography.label, color: colors.accent },
  track: { height: sizes.track, borderRadius: radii.pill, backgroundColor: colors.background, overflow: "hidden" },
  trackFill: { height: "100%", backgroundColor: colors.accent },
  chapterCard: {
    backgroundColor: colors.surface,
    borderWidth: strokes.hairline,
    borderColor: colors.border,
    borderRadius: radii.lg,
    overflow: "hidden",
  },
  chapterDivider: { borderTopWidth: strokes.hairline, borderTopColor: colors.border },
  chapterRow: {
    minHeight: sizes.settingRow,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chapterTitle: { ...typography.body, flex: 1, minWidth: 0 },
});
