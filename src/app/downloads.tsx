import { router } from "expo-router";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import { useCatalog } from "@/lib/catalog-config";
import { downloadCaption, downloadKindLabel } from "@/lib/download-labels";
import { downloadQueue, useDownloads, useStorageMeter } from "@/lib/downloads";
import { useBook } from "@/lib/library";
import { useSettings } from "@/lib/settings";
import { formatBytes } from "@/lib/storage";
import type { Download } from "@/lib/types";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { SettingsSection } from "@/ui/SettingsList";
import { colors, radii, sizes, spacing, strokes, typography } from "@/ui/theme";
import { TopBar } from "@/ui/TopBar";

// Downloads (spec 05, 05.6, A6), from the library's overflow menu and Settings' Storage row: the queue (LibriVox
// books, 05.8, and the pieces a built playlist needs, 05.4) and the storage meter, splitting books from music. All its copy lives here.
const COPY = {
  title: "Downloads",
  back: "Your shelf",
  backA11y: "Back to your shelf",
  storageTitle: "Storage",
  storageUnknown: "Mood Read can't measure your books in a browser. Open the phone app to see your storage.",
  books: (v: string) => `Books ${v}`,
  music: (v: string) => `Music ${v}`,
  wifiCaption: "Downloads on Wi-Fi only. Change it in Settings.",
  queueTitle: "In the queue",
  emptyTitle: "All caught up.",
  emptyBody: "Nothing is downloading right now.",
  webNote: "On the web, Mood Read keeps one book and its music offline. Adding another takes the first off this browser, and it stays on your shelf. The phone app keeps your whole shelf.",
  pause: "Pause",
  resume: "Resume",
  retry: "Retry",
};

const goBack = () => (router.canGoBack() ? router.back() : router.replace("/"));

export default function DownloadsScreen() {
  const meter = useStorageMeter();
  const downloads = useDownloads();
  const wifiOnly = useSettings().wifiOnly;
  const total = (meter.booksBytes ?? 0) + meter.musicBytes;

  return (
    <View style={styles.screen}>
      <TopBar title={COPY.title} back={{ label: COPY.back, a11yLabel: COPY.backA11y, onPress: goBack }} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card} testID="storage-meter">
          <Text style={styles.cardTitle} role="heading" aria-level={2}>
            {COPY.storageTitle}
          </Text>
          {meter.booksBytes === null ? (
            <Text style={styles.caption}>{COPY.storageUnknown}</Text>
          ) : (
            <>
              <View
                role="progressbar"
                aria-label={COPY.storageTitle}
                aria-valuemin={0}
                aria-valuemax={total || 1}
                aria-valuenow={meter.booksBytes}
                style={styles.meterTrack}
              >
                {total > 0 && (
                  <>
                    <View style={[styles.meterBooks, { width: `${(meter.booksBytes / total) * 100}%` }]} />
                    <View style={[styles.meterMusic, { width: `${(meter.musicBytes / total) * 100}%` }]} />
                  </>
                )}
              </View>
              <View style={styles.legend}>
                <Text style={styles.caption}>{COPY.books(formatBytes(meter.booksBytes))}</Text>
                <Text style={styles.caption}>{COPY.music(formatBytes(meter.musicBytes))}</Text>
              </View>
            </>
          )}
        </View>

        {wifiOnly && (
          <View style={styles.wifiRow}>
            <Icon name="wifi" size="small" color={colors.textMuted} />
            <Text style={styles.caption}>{COPY.wifiCaption}</Text>
          </View>
        )}

        <SettingsSection label={COPY.queueTitle}>
          {downloads.length === 0 ? <EmptyQueue /> : downloads.map((d) => <DownloadRow key={d.id} item={d} />)}
        </SettingsSection>
      </ScrollView>
    </View>
  );
}

function EmptyQueue() {
  return (
    <View testID="downloads-empty" style={styles.empty}>
      <Text style={styles.emptyTitle}>{COPY.emptyTitle}</Text>
      <Text style={styles.caption}>{COPY.emptyBody}</Text>
      {Platform.OS === "web" && (
        <View testID="downloads-web-note" style={styles.webNote}>
          <Icon name="hard-drive" size="small" color={colors.textMuted} />
          <Text style={styles.caption}>{COPY.webNote}</Text>
        </View>
      )}
    </View>
  );
}

function DownloadRow({ item }: { item: Download }) {
  const book = useBook(item.target.kind === "book" ? item.target.bookId : undefined);
  // A piece's row is titled by the catalog (05.4): its title and artist, else "Piece" until the catalog is read.
  const catalog = useCatalog();
  const pieceId = item.target.kind === "piece" ? item.target.pieceId : null;
  const piece = pieceId && catalog.status === "ready" ? catalog.pieces.find((p) => p.id === pieceId) : undefined;
  const title =
    item.target.kind === "book" ? (book?.title ?? downloadKindLabel(item.target)) : piece ? `${piece.title} · ${piece.artist}` : downloadKindLabel(item.target);
  const action =
    item.state === "running"
      ? { label: COPY.pause, onPress: () => downloadQueue.pause(item.id) }
      : item.state === "paused"
        ? { label: COPY.resume, onPress: () => downloadQueue.resume(item.id) }
        : item.state === "failed"
          ? { label: COPY.retry, onPress: () => downloadQueue.retry(item.id) }
          : null;
  const fraction = item.state === "running" && item.totalBytes ? Math.min(1, item.bytes / item.totalBytes) : null;

  return (
    <View testID={`download-${item.id}`} style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={[styles.caption, item.state === "failed" && styles.dangerText]}>{downloadCaption(item)}</Text>
        {fraction != null && (
          <View style={styles.rowTrack}>
            <View style={[styles.rowTrackFill, { width: `${fraction * 100}%` }]} />
          </View>
        )}
      </View>
      {action && (
        <Button
          testID={`download-${item.id}-action`}
          label={action.label}
          a11yLabel={`${action.label} ${title}`}
          kind="secondary"
          small
          onPress={action.onPress}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderWidth: strokes.hairline,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: { ...typography.label, fontSize: typography.body.fontSize },
  caption: typography.caption,
  dangerText: { color: colors.danger },
  meterTrack: {
    height: sizes.track,
    borderRadius: radii.pill,
    borderWidth: strokes.hairline,
    borderColor: colors.edge,
    backgroundColor: colors.background,
    overflow: "hidden",
    flexDirection: "row",
  },
  meterBooks: { height: "100%", backgroundColor: colors.accent },
  meterMusic: { height: "100%", backgroundColor: colors.pop },
  legend: { flexDirection: "row", gap: spacing.md },
  wifiRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.xs },
  empty: { padding: spacing.lg, alignItems: "center", gap: spacing.xs },
  emptyTitle: { ...typography.heading },
  webNote: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  row: {
    minHeight: sizes.settingRow,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowText: { flex: 1, minWidth: 0, gap: spacing.xxs },
  rowTitle: { ...typography.label, fontSize: typography.body.fontSize },
  rowTrack: {
    height: sizes.track,
    borderRadius: radii.pill,
    backgroundColor: colors.background,
    overflow: "hidden",
  },
  rowTrackFill: { height: "100%", backgroundColor: colors.accent },
});
