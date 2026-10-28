// The result of "Save YouTube playlist" (01.11, spec 01 A24's playlist half), in the river's own place — same
// shape as the scoring band's waiting line and RescoreConfirm (src/player/ScoringBand.tsx): a brief in-progress
// line while the request runs, then the result in place, dismissible, never a silent failure and never a dead
// end. Mood Read never plays anything here; this only builds a playlist in the listener's own YouTube account.
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { PlaylistResult } from "@/lib/youtube-playlist";
import { Icon } from "@/ui/Icon";
import { colors, sizes, spacing, strokes, typography } from "@/ui/theme";

const COPY = {
  saving: "Saving your YouTube playlist…",
  notConfigured: "YouTube playlist saving isn't set up on this build yet.",
  noPieces: "No chapter in this book names a reference piece yet, so there's nothing to add.",
  cancelled: "Sign-in was cancelled, so nothing was saved.",
  error: "Couldn't save the playlist. Check your connection and try again.",
  saved: (matched: number, total: number) =>
    matched === total
      ? `Saved all ${total} piece${total === 1 ? "" : "s"} to a new YouTube playlist.`
      : `Added ${matched} of ${total} pieces to a new YouTube playlist.`,
  dismiss: "Dismiss",
} as const;

/** The overflow menu's item (next to Rescore): label and caption, same shape as ScoringBand's RESCORE_MENU. */
export const YOUTUBE_PLAYLIST_MENU = {
  label: "Save YouTube playlist",
  caption: "Saves the reference pieces to a new playlist in your YouTube account.",
} as const;

/** The calm line for a finished (or failed, or not-configured) result; never a crash, never a dead button. */
function resultLine(result: PlaylistResult): string {
  switch (result.kind) {
    case "not-configured":
      return COPY.notConfigured;
    case "no-pieces":
      return COPY.noPieces;
    case "cancelled":
      return COPY.cancelled;
    case "error":
      return COPY.error;
    case "saved":
      return COPY.saved(result.matched, result.total);
  }
}

export function YoutubePlaylistBand(props: { state: "running" | PlaylistResult; onDismiss: () => void }) {
  if (props.state === "running") {
    return (
      <View style={styles.band} testID="youtube-playlist-band">
        <View style={styles.lead}>
          <Icon name="hourglass" size="small" color={colors.textMuted} />
          <Text style={styles.text} testID="youtube-playlist-saving" role="status">
            {COPY.saving}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.band} testID="youtube-playlist-band">
      <View style={styles.row}>
        <Text style={styles.text} testID="youtube-playlist-result" role="status">
          {resultLine(props.state)}
        </Text>
        <Pressable
          testID="youtube-playlist-dismiss"
          role="button"
          aria-label={COPY.dismiss}
          onPress={props.onDismiss}
          style={styles.dismiss}
        >
          <Icon name="x" size="small" />
        </Pressable>
      </View>
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
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  lead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  text: { ...typography.label, flex: 1 },
  dismiss: { minWidth: sizes.touch, minHeight: sizes.touch, alignItems: "center", justifyContent: "center" },
});
