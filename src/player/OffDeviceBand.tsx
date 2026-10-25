// A book whose download was removed (spec 05, 05.7, A7): it opens with its chapters, moods and picks, and this band
// in place of the player. A LibriVox book downloads again in one tap, through the download queue (its progress here,
// each row on the Downloads screen); an imported one asks for its file through the import picker and takes it only
// when its title, author and length match (src/lib/reattach.ts). Its copy lives here.
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { downloadCaption } from "@/lib/download-labels";
import { downloadQueue, useDownloads } from "@/lib/downloads";
import { pickFiles } from "@/lib/library";
import { downloadAgain, findTheFile, type FindOutcome } from "@/lib/library-manage";
import type { Book } from "@/lib/types";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { colors, spacing, strokes, typography } from "@/ui/theme";

const FORMATS = "M4B, M4A, MP3, WAV, FLAC, OGG or Opus";

const COPY = {
  title: "Not on device",
  kept: "Your place, bookmarks, moods and picks are kept.",
  librivoxBody: "Download it again from LibriVox to listen.",
  importBody: "Find the file you imported, and Mood Read matches it by title, author and length.",
  downloadAgain: "Download again",
  findFile: "Find the file",
  retry: "Try again",
  checking: "Checking the file",
  unreachable: "Couldn't reach LibriVox. Check your connection and try again.",
  mismatch: {
    title: "That file is a different book: its title doesn't match.",
    author: "That file is by a different author.",
    files: "That copy is split into a different number of files. Pick the files you imported.",
    duration: "That file's length doesn't match this book. It may be another edition or reader.",
  },
  drm: (name: string) => `"${name}" is locked by DRM. Mood Read never decrypts locked files.`,
  unsupported: `That file could not be opened. Pick the DRM-free audiobook you imported, in ${FORMATS}.`,
  empty: `That folder has no audio files. Pick the ${FORMATS} files you imported.`,
} as const;

function findMessage(outcome: FindOutcome): string | null {
  switch (outcome.kind) {
    case "mismatch":
      return COPY.mismatch[outcome.reason];
    case "drm":
      return COPY.drm(outcome.fileName);
    case "unsupported":
      return COPY.unsupported;
    case "empty":
      return COPY.empty;
    default:
      return null;
  }
}

export function OffDeviceBand({ book }: { book: Book }) {
  const librivox = book.source.kind === "librivox";
  const download = useDownloads().find((d) => d.target.kind === "book" && d.target.bookId === book.id) ?? null;
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function find() {
    // The picker opens first, inside the tap: a browser only opens a file dialog from a user gesture.
    const picking = pickFiles();
    setError(null);
    setChecking(true);
    try {
      setError(findMessage(await findTheFile(book, await picking)));
    } finally {
      setChecking(false);
    }
  }

  function again() {
    setError(null);
    downloadAgain(book).catch(() => setError(COPY.unreachable));
  }

  const moving = download && download.state !== "failed" && download.state !== "done";
  return (
    <View style={styles.band} testID="off-device-band">
      <View style={styles.lead}>
        <Icon name="hard-drive" size="small" />
        <Text style={styles.title} role="heading" aria-level={2}>
          {COPY.title}
        </Text>
      </View>
      <Text style={styles.caption}>
        {COPY.kept} {librivox ? COPY.librivoxBody : COPY.importBody}
      </Text>
      {error && (
        <Text style={styles.error} role="alert" testID="off-device-error">
          {error}
        </Text>
      )}
      {download && (
        <Text style={styles.caption} role="status" testID="off-device-progress">
          {downloadCaption(download)}
        </Text>
      )}
      {checking && (
        <Text style={styles.caption} role="status">
          {COPY.checking}
        </Text>
      )}
      {librivox ? (
        download?.state === "failed" ? (
          <Button small testID="download-again-retry" icon="download" label={COPY.retry} onPress={() => downloadQueue.retry(download.id)} />
        ) : (
          !moving && <Button small testID="download-again" icon="download" label={COPY.downloadAgain} onPress={again} />
        )
      ) : (
        <Button small testID="find-the-file" icon="search" label={COPY.findFile} disabled={checking} onPress={() => void find()} />
      )}
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
    alignItems: "flex-start",
  },
  lead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: typography.label,
  caption: typography.caption,
  error: { ...typography.caption, color: colors.danger },
});
