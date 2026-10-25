// A scored book's playlist band, under the scoring band (spec 05, 05.4, A4): "Build playlist" downloads every piece
// the book plays, then its progress over the book's piece downloads (pieces and bytes), then the done line. Only a
// book with a piece to build shows it: an unscored book has none. A paused or failed playlist offers its button again,
// which resumes or retries; the Downloads screen holds each piece's own row. Its copy lives here and in
// src/lib/download-labels.ts playlistLine.
import { Platform, StyleSheet, Text, View } from "react-native";

import { playlistLine } from "@/lib/download-labels";
import type { PlaylistStatus } from "@/lib/playlist";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { colors, radii, spacing, strokes, typography } from "@/ui/theme";

const WEB = Platform.OS === "web";

const COPY = {
  build: "Build playlist",
  buildCaption: WEB
    ? "Keeps every chapter's music in this browser, for one book at a time. The phone app keeps every book's."
    : "Downloads every chapter's music, so the book plays offline.",
  progress: "Playlist download",
  resume: "Resume",
  retry: "Try again",
  retryCaption: "Missing pieces stream until they download.",
  done: WEB ? "Plays from this browser, chapter by chapter." : "Plays offline, chapter by chapter.",
  wifi: "Downloads on Wi-Fi only.",
} as const;

export function PlaylistBand(props: { status: PlaylistStatus; wifiOnly: boolean; onBuild: () => void }) {
  const { status } = props;
  const line = playlistLine(status);

  if (status.state === "unbuilt" || line === null) {
    return (
      <View style={styles.band} testID="playlist-band">
        <View style={styles.row}>
          <Button testID="build-playlist" small icon="download" kind="secondary" label={COPY.build} onPress={props.onBuild} />
          <Text style={[styles.caption, styles.grow]}>{COPY.buildCaption}</Text>
        </View>
      </View>
    );
  }

  if (status.state === "done") {
    return (
      <View style={styles.band} testID="playlist-band">
        <View style={styles.lead}>
          <Icon name="check" size="small" color={colors.accent} />
          <Text style={[styles.text, styles.grow]} testID="playlist-done" role="status">
            {line}
          </Text>
        </View>
        <Text style={styles.caption}>{COPY.done}</Text>
      </View>
    );
  }

  const pct = status.totalBytes > 0 ? Math.min(100, Math.round((status.bytes / status.totalBytes) * 100)) : 0;
  const stalled = status.state === "failed" || status.state === "paused";
  return (
    <View style={styles.band} testID="playlist-band">
      <View style={styles.row}>
        <View style={[styles.lead, styles.grow]}>
          <Icon name={stalled ? "pause" : "download"} size="small" color={stalled ? colors.textMuted : colors.accent} />
          <Text style={[stalled ? styles.text : styles.live, styles.grow]} testID="playlist-progress" role="status">
            {line}
          </Text>
        </View>
        {stalled && (
          <Button
            testID="playlist-resume"
            small
            kind="secondary"
            label={status.state === "failed" ? COPY.retry : COPY.resume}
            onPress={props.onBuild}
          />
        )}
      </View>
      <View
        style={styles.track}
        role="progressbar"
        aria-label={COPY.progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: stalled ? colors.textMuted : colors.accent }]} />
      </View>
      {stalled && <Text style={styles.caption}>{COPY.retryCaption}</Text>}
      {!stalled && props.wifiOnly && <Text style={styles.caption}>{COPY.wifi}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: strokes.hairline,
    borderBottomColor: colors.border,
    borderStyle: "dashed",
  },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  lead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  grow: { flexShrink: 1 },
  track: { height: spacing.sm, borderRadius: radii.pill, backgroundColor: colors.border, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radii.pill },
  live: { ...typography.label, color: colors.accent },
  text: typography.label,
  caption: typography.caption,
});
